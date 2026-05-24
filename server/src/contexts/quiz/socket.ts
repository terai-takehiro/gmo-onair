import { Server, Socket } from 'socket.io';
import { execute, queryAll, queryOne } from '../../shared/db/connection';

/**
 * Quiz CG socket: /quiz namespace, ?quizId= でルーム join。
 * - quiz:set     operator → server: 状態更新 (step / poll_started_at / reveal_phase / votes)
 * - quiz:sync    server → all in room: 最新スナップショット
 */
export function initQuizSocketIO(io: Server): void {
  const ns = io.of('/quiz');

  ns.on('connection', async (socket: Socket) => {
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
      try {
        const step = ['idle','poll','reveal','winner','answer-check','correct-reveal'].includes(data.step ?? '') ? data.step : 'idle';
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
