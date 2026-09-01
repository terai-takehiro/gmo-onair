import { Server, Socket } from 'socket.io';
import { execute, queryAll, queryOne } from '../../shared/db/connection';
import { verifyToken } from '../../shared/auth/jwt';
import { config } from '../../config';
import { onCountdownStart, onReveal, onClear } from './services/interactive-lifecycle.service';

/**
 * Quiz CG socket: /quiz namespace, ?quizId= でルーム join。
 * - quiz:set     operator → server: 状態更新 (step / poll_started_at / reveal_phase / votes)
 * - quiz:sync    server → all in room: 最新スナップショット
 */
// v2.9.64: NEXT (送出予約) の quiz id を event 単位で保持 (in-memory)。
// ranking/oneshot の nextCue 相当。NEXT 出力 URL が購読する。
const stackNextByEvent = new Map<number, number | null>();

/** cookieヘッダーから gmo_onair_token を取り出す */
function extractCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/gmo_onair_token=([^;]+)/);
  return match ? match[1] : null;
}

export function initQuizSocketIO(io: Server): void {
  const ns = io.of('/quiz');

  // password mode で JWT / cookie 認証を要求 (/liveops namespace と同じ方式)。
  // トークンなしの接続は read-only の出力URL用として許可し、
  // 書き込み (quiz:set / quizStack:set / quizStack:nextSet) だけ userId で締める。
  // REST 側 (quizzes.routes.ts) は requirePermission('awards') で守られているのに
  // socket 経路だけ素通しだと vote_count・cue 状態を無認証で改ざんできてしまう。
  if (config.authMode === 'password') {
    ns.use(async (socket, next) => {
      try {
        const token = (socket.handshake.auth as { token?: string } | undefined)?.token
          || extractCookieToken(socket.handshake.headers.cookie as string | undefined);

        if (!token) { next(); return; } // トークンなし = read-only 表示用接続を許可
        const payload = verifyToken(token);
        if (!payload) return next(new Error('Unauthorized'));

        const user = await queryOne(
          'SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL',
          [payload.userId]
        );
        if (!user) return next(new Error('Unauthorized'));

        if ((user as { role?: string }).role !== 'system_admin') {
          // REST の requirePermission('awards') と同じ権限区画を見る
          const perm = await queryOne(
            'SELECT access_level FROM user_permissions WHERE user_id = $1 AND module = $2',
            [(user as { id: string }).id, 'awards']
          );
          if (!perm) return next(new Error('Forbidden: awards permission required'));
        }

        (socket as unknown as { userId: string }).userId = (user as { id: string }).id;
        next();
      } catch {
        next(new Error('Auth error'));
      }
    });
  } else {
    // mock 認証モード (REST 側も x-user-id で素通し) では書き込みゲートを塞がない
    ns.use((socket, next) => { (socket as unknown as { userId: string }).userId = 'mock'; next(); });
  }

  ns.on('connection', async (socket: Socket) => {
    const stackEventId = parseInt(socket.handshake.query.stackEventId as string);
    // ── イベント単位の stack モード (PRV/NEXT で quiz 切替) ──
    if (stackEventId && !isNaN(stackEventId)) {
      const room = `quizStack:${stackEventId}`;
      socket.join(room);
      // 接続直後に現状を push
      try {
        const cue = await queryOne(
          `SELECT current_quiz_id, step, poll_started_at, reveal_phase FROM quiz_stack_state WHERE event_id = ?`,
          [stackEventId]
        );
        socket.emit('quizStack:sync', {
          eventId: stackEventId,
          currentQuizId: cue?.current_quiz_id ?? null,
          step: cue?.step ?? 'idle',
          pollStartedAt: cue?.poll_started_at
            ? new Date(cue.poll_started_at as string | number | Date).getTime()
            : null,
          revealPhase: cue?.reveal_phase ?? 0,
          timestamp: Date.now(),
        });
        // NEXT (送出予約) の現状も push
        socket.emit('quizStack:nextSync', { nextQuizId: stackNextByEvent.get(stackEventId) ?? null });
      } catch (err) { console.error('[quiz socket] stack sync error', err); }

      // NEXT (送出予約) の quiz 選択を broadcast (NEXT 出力 URL 用)
      socket.on('quizStack:nextSet', (data: { nextQuizId?: number | null }) => {
        if (!(socket as unknown as { userId?: string }).userId) return; // 書き込みは認証済み operator のみ
        const id = typeof data?.nextQuizId === 'number' ? data.nextQuizId : null;
        stackNextByEvent.set(stackEventId, id);
        ns.to(room).emit('quizStack:nextSync', { nextQuizId: id });
      });

      socket.on('quizStack:set', async (data: {
        currentQuizId?: number | null;
        step?: string;
        pollStartedAt?: number | null;
        revealPhase?: number;
        votes?: Record<string | number, number>;
      }) => {
        if (!(socket as unknown as { userId?: string }).userId) return; // 書き込みは認証済み operator のみ
        try {
          const step = ['idle','poll','answer-check','correct-reveal'].includes(data.step ?? '') ? data.step : 'idle';
          const revealPhase = Math.max(0, Math.min(2, Math.floor(data.revealPhase ?? 0)));
          const currentQuizId = typeof data.currentQuizId === 'number' ? data.currentQuizId : null;

          // カウントダウン連動の自動出題/締切/正解発表/クリア 判定用に、更新前の状態を控える
          const prev = await queryOne(
            `SELECT step, poll_started_at, current_quiz_id FROM quiz_stack_state WHERE event_id = ?`,
            [stackEventId],
          );
          const prevStep = (prev?.step as string) ?? 'idle';
          const prevPollMs = prev?.poll_started_at
            ? new Date(prev.poll_started_at as string | number | Date).getTime()
            : null;
          const prevQuizId = (prev?.current_quiz_id as number | null) ?? null;

          // v2.9.55: poll 開始時刻はサーバー時刻で打刻し単一の真実源にする。
          //   旧実装は operator が getServerNow() で打刻した値をそのまま保存していたため、
          //   operator 機の時計補正がわずかでもずれると別マシンの出力URLに数秒差として出ていた。
          //   - 新規 poll (poll に突入 / poll 中に別 quiz へ) → サーバー Date.now()
          //   - 継続 poll (同一 quiz の votes 保存等の再送) → 既存の poll_started_at を維持
          //   - poll 以外のステップ → null
          const enteringPoll = step === 'poll' && prevStep !== 'poll';
          const quizChangedDuringPoll = step === 'poll' && prevStep === 'poll' && prevQuizId !== currentQuizId;
          const isNewPoll = enteringPoll || quizChangedDuringPoll;
          const effectivePollStartedAt: number | null =
            step !== 'poll' ? null : (isNewPoll ? Date.now() : (prevPollMs ?? Date.now()));

          await execute(
            `INSERT INTO quiz_stack_state (event_id, current_quiz_id, step, poll_started_at, reveal_phase, updated_at)
             VALUES (?, ?, ?, ${effectivePollStartedAt === null ? 'NULL' : 'to_timestamp(?::double precision / 1000.0)'}, ?, NOW())
             ON CONFLICT (event_id) DO UPDATE
               SET current_quiz_id = EXCLUDED.current_quiz_id,
                   step = EXCLUDED.step,
                   poll_started_at = EXCLUDED.poll_started_at,
                   reveal_phase = EXCLUDED.reveal_phase,
                   updated_at = NOW()`,
            effectivePollStartedAt === null
              ? [stackEventId, currentQuizId, step, revealPhase]
              : [stackEventId, currentQuizId, step, effectivePollStartedAt, revealPhase]
          );

          if (data.votes && typeof data.votes === 'object' && currentQuizId) {
            for (const [posKey, v] of Object.entries(data.votes)) {
              const pos = parseInt(String(posKey));
              const vc = Math.max(0, Math.floor(Number(v) || 0));
              if (!isNaN(pos)) {
                await execute(
                  `UPDATE quiz_choices SET vote_count = ?, updated_at = NOW()
                   WHERE quiz_id = ? AND position = ?`,
                  [vc, currentQuizId, pos]
                );
              }
            }
          }

          ns.to(room).emit('quizStack:sync', {
            eventId: stackEventId,
            currentQuizId,
            step, pollStartedAt: effectivePollStartedAt, revealPhase,
            timestamp: Date.now(),
          });

          // カウントダウン (poll) 新規開始 (isNewPoll) を検知 → Interactive を自動出題 + 締切予約。
          if (isNewPoll && currentQuizId) {
            // 再出題: 前回の集計が残らないよう投票数を 0 リセットして即時ブロードキャスト。
            // (Interactive 連動時は activate 側で回答もクリアされ、poller が 0 を反映)
            try {
              await execute(
                `UPDATE quiz_choices SET vote_count = 0, updated_at = NOW() WHERE quiz_id = ?`,
                [currentQuizId],
              );
              await emitInteractiveVotes(io, stackEventId, currentQuizId);
            } catch (resetErr) {
              console.error('[quiz socket] vote reset on re-poll error', resetErr);
            }
            void onCountdownStart(stackEventId, currentQuizId, effectivePollStartedAt ?? Date.now());
          }

          // 正解発表 (quiz の correct-reveal) に入ったら Interactive 視聴者画面にも正解を表示。
          if (step === 'correct-reveal' && prevStep !== 'correct-reveal') {
            const qid = currentQuizId ?? prevQuizId;
            if (qid) void onReveal(stackEventId, qid);
          }

          // クリア (idle に戻る) で Interactive 視聴者画面の問題表示も消す。
          // clear 時の payload は currentQuizId を持たないことがあるため prevQuizId をフォールバック。
          if (step === 'idle' && prevStep !== 'idle') {
            const qid = currentQuizId ?? prevQuizId;
            if (qid) void onClear(stackEventId, qid);
          }
        } catch (err) {
          console.error('[quiz socket] quizStack:set error', err);
        }
      });

      return;
    }

    const quizId = parseInt(socket.handshake.query.quizId as string);
    if (!quizId || isNaN(quizId)) { socket.disconnect(); return; }
    const room = `quiz:${quizId}`;
    socket.join(room);

    // 接続直後に現状を push
    try {
      const cue = await queryOne(
        `SELECT step, poll_started_at, reveal_phase FROM quiz_cue_state WHERE quiz_id = ?`,
        [quizId]
      );
      const choices = await queryAll(
        `SELECT position, vote_count FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
        [quizId]
      );
      socket.emit('quiz:sync', {
        quizId,
        step: cue?.step ?? 'idle',
        pollStartedAt: cue?.poll_started_at
          ? new Date(cue.poll_started_at as string | number | Date).getTime()
          : null,
        revealPhase: cue?.reveal_phase ?? 0,
        votes: Object.fromEntries(choices.map((c) => [c.position, c.vote_count])),
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[quiz socket] initial sync error', err);
    }

    socket.on('quiz:set', async (data: {
      step?: string;
      pollStartedAt?: number | null;
      revealPhase?: number;
      votes?: Record<string | number, number>;  // position -> vote_count
    }) => {
      if (!(socket as unknown as { userId?: string }).userId) return; // 書き込みは認証済み operator のみ
      try {
        const step = ['idle','poll','answer-check','correct-reveal'].includes(data.step ?? '') ? data.step : 'idle';
        const pollStartedAt = typeof data.pollStartedAt === 'number' ? data.pollStartedAt : null;
        const revealPhase = Math.max(0, Math.min(2, Math.floor(data.revealPhase ?? 0)));

        await execute(
          `INSERT INTO quiz_cue_state (quiz_id, step, poll_started_at, reveal_phase, updated_at)
           VALUES (?, ?, ${pollStartedAt === null ? 'NULL' : 'to_timestamp(?::double precision / 1000.0)'}, ?, NOW())
           ON CONFLICT (quiz_id) DO UPDATE
             SET step = EXCLUDED.step,
                 poll_started_at = EXCLUDED.poll_started_at,
                 reveal_phase = EXCLUDED.reveal_phase,
                 updated_at = NOW()`,
          pollStartedAt === null
            ? [quizId, step, revealPhase]
            : [quizId, step, pollStartedAt, revealPhase]
        );

        // 投票数の更新 (operator が手入力で投票数を変える)
        if (data.votes && typeof data.votes === 'object') {
          for (const [posKey, v] of Object.entries(data.votes)) {
            const pos = parseInt(String(posKey));
            const vc = Math.max(0, Math.floor(Number(v) || 0));
            if (!isNaN(pos)) {
              await execute(
                `UPDATE quiz_choices SET vote_count = ?, updated_at = NOW()
                 WHERE quiz_id = ? AND position = ?`,
                [vc, quizId, pos]
              );
            }
          }
        }

        const choices = await queryAll(
          `SELECT position, vote_count FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
          [quizId]
        );
        ns.to(room).emit('quiz:sync', {
          quizId,
          step,
          pollStartedAt,
          revealPhase,
          votes: Object.fromEntries(choices.map((c) => [c.position, c.vote_count])),
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[quiz socket] quiz:set error', err);
      }
    });
  });
}

/**
 * v2.9.24: Interactive (別 VPS) からのリアルタイム投票数を CG 出力に push する。
 * poller (interactive-poller.service) が vote_count を DB 更新した後に呼ぶ。
 *
 * cue (step / phase / oneshotStyle) には一切触れず votes だけを流す軽量イベントなので、
 * operator のステップ操作と競合しない。クライアント側は votes をマージ表示するだけ。
 */
export async function emitInteractiveVotes(io: Server, eventId: number, quizId: number): Promise<void> {
  const choices = await queryAll(
    `SELECT position, vote_count FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
    [quizId],
  );
  const votes = Object.fromEntries(choices.map((c) => [c.position, c.vote_count]));
  const ns = io.of('/quiz');
  ns.to(`quizStack:${eventId}`).emit('quizStack:votes', { eventId, quizId, votes, timestamp: Date.now() });
  ns.to(`quiz:${quizId}`).emit('quiz:votes', { quizId, votes, timestamp: Date.now() });
}
