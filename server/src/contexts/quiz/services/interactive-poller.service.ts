/**
 * contexts/quiz/services/interactive-poller.service.ts — v2.9.24
 *
 * 別 VPS のインタラクティブ演出から「現在送出中のクイズ/アンケート」の投票数を
 * 一定間隔で取得し、Awards の quiz_choices.vote_count に反映 + CG 出力に socket push する。
 *
 * 負荷対策:
 *   - quiz_stack_state.step != 'idle' の (= 実際に送出中の) クイズだけを対象。
 *   - そのクイズが interactive_question_id を持ち、イベントに interactive_link がある場合のみ。
 *   - 投票数に変化があったときだけ socket broadcast (毎回は流さない)。
 *
 * 合算について: Interactive 側 interactive_answers は choice_index のみ保持 (言語非依存) のため、
 * 日本語/英語の視聴者の票は同じ choice_index に積まれ、results は既に全言語合算済み。
 * Awards は results.choices[i].count を position=i の vote_count にコピーするだけ。
 */
import type { Server } from 'socket.io';
import { queryAll, execute } from '../../../shared/db/connection';
import { emitInteractiveVotes } from '../socket';
import { interactiveBridge, type InteractiveLink } from './interactive-bridge.service';

// 送出中の 1 問だけを対象にした軽量ポーリング。リアルタイム性のため 800ms 間隔。
// (対象は通常 1 行 = Interactive への HTTP も 1 req/800ms 程度)
const POLL_INTERVAL_MS = 800;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

interface ActiveRow {
  event_id: number;
  current_quiz_id: number;
  interactive_question_id: string;
  interactive_link: InteractiveLink | string | null;
}

/**
 * interactive_link は JSONB だが、保存経路によっては「JSON 文字列」で返ることがある
 * (二重エンコード等)。lifecycle.service と同じく string / object 両対応で正規化する。
 * これをしないと文字列のとき link.baseUrl が undefined になり、poller が毎回スキップして
 * 「出題 (activate) はできるのに投票数が CG に反映されない」状態になる。
 */
function normalizeLink(raw: InteractiveLink | string | null): InteractiveLink | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as InteractiveLink;
    } catch {
      return null;
    }
  }
  return raw;
}

// event_id → 連携イベントで「いま ACTIVE な問題」の id (TTL キャッシュ)。
// 保存済みの interactive_question_id が古い/別問題を指していても、視聴者が実際に
// 投票している ACTIVE 問題から票を拾えるようにするための解決結果。
const activeQCache = new Map<number, { qid: string | null; ts: number }>();
const ACTIVE_Q_TTL_MS = 2500;

/**
 * 集計に使う Interactive 問題 id を解決する。
 * 連携イベントで現在 ACTIVE な問題 (= 視聴者が今投票している問題) を優先し、
 * 取れなければ Awards 側に保存済みの linkedId にフォールバック。
 * listQuestions の呼び出しは event 単位で TTL キャッシュして毎サイクル叩かない。
 */
async function resolveQuestionId(
  link: InteractiveLink,
  eventId: number,
  linkedId: string,
): Promise<string> {
  const now = Date.now();
  const cached = activeQCache.get(eventId);
  if (cached && now - cached.ts < ACTIVE_Q_TTL_MS) {
    return cached.qid ?? linkedId;
  }
  try {
    const { questions } = await interactiveBridge.listQuestions(link);
    // ACTIVE な問題を優先。複数あれば回答数が最大のもの。無ければ null。
    const active = (questions ?? [])
      .filter((q) => q.status === 'active')
      .sort((a, b) => (b.answer_count ?? 0) - (a.answer_count ?? 0))[0];
    const qid = active?.id ?? null;
    activeQCache.set(eventId, { qid, ts: now });
    if (qid && qid !== linkedId) {
      console.warn(
        `[interactive-poller] linked id stale? polling ACTIVE question ${qid} ` +
          `instead of linked ${linkedId} (event ${eventId})`,
      );
    }
    return qid ?? linkedId;
  } catch (err) {
    activeQCache.set(eventId, { qid: null, ts: now });
    console.warn('[interactive-poller] listQuestions failed:', (err as Error).message);
    return linkedId;
  }
}

async function pollOnce(io: Server): Promise<void> {
  if (running) return; // 前回の poll がまだ走っていたらスキップ (多重実行防止)
  running = true;
  try {
    const rows = (await queryAll(
      `SELECT s.event_id, s.current_quiz_id,
              q.interactive_question_id,
              e.interactive_link
         FROM quiz_stack_state s
         JOIN quizzes q       ON q.id = s.current_quiz_id
         JOIN awards_events e ON e.id = s.event_id
        WHERE s.step <> 'idle'
          AND q.interactive_question_id IS NOT NULL
          AND e.interactive_link IS NOT NULL`,
    )) as unknown as ActiveRow[];

    for (const row of rows) {
      const link = normalizeLink(row.interactive_link);
      if (!link?.baseUrl || !link?.apiKeySecret) continue;

      // 視聴者が今投票している ACTIVE 問題を優先解決 (保存済み id が古くても拾えるように)
      const targetQid = await resolveQuestionId(link, row.event_id, row.interactive_question_id);

      let dump;
      const t0 = Date.now();
      try {
        dump = await interactiveBridge.getResults(link, targetQid);
      } catch (err) {
        // 1 イベントの失敗で全体を止めない
        console.warn('[interactive-poller] getResults failed:', (err as Error).message);
        continue;
      }
      const latencyMs = Date.now() - t0;
      // 取得レイテンシ + 集計を可視化 (ラグの切り分け用)。リモート VPS への HTTP が
      // 遅いと poller の実効サイクルが伸びて反映ラグになるため、毎回 latency を出す。
      console.log(
        `[interactive-poller] fetched quiz=${row.current_quiz_id} iaQ=${targetQid} ` +
          `(linked=${row.interactive_question_id}) total=${dump?.results?.total ?? 0} latency=${latencyMs}ms`,
      );

      const choices = dump?.results?.choices ?? [];

      // 現在の vote_count を取得
      const current = (await queryAll(
        `SELECT position, vote_count FROM quiz_choices WHERE quiz_id = ? ORDER BY position`,
        [row.current_quiz_id],
      )) as { position: number; vote_count: number }[];

      // Interactive results を正本として反映。
      // results に含まれない選択肢 (= 0 票 / 再出題で回答クリア) は 0 に揃える。
      // Interactive choice_index は 0 始まり、Awards position は 1 始まり → position = index + 1
      const resultMap = new Map<number, number>();
      for (const c of choices) {
        resultMap.set(c.index + 1, Math.max(0, Math.floor(Number(c.count) || 0)));
      }

      let changed = false;
      for (const cur of current) {
        const newCount = resultMap.get(cur.position) ?? 0;
        if (cur.vote_count !== newCount) {
          await execute(
            `UPDATE quiz_choices SET vote_count = ?, updated_at = NOW() WHERE quiz_id = ? AND position = ?`,
            [newCount, row.current_quiz_id, cur.position],
          );
          changed = true;
        }
      }

      if (changed) {
        await emitInteractiveVotes(io, row.event_id, row.current_quiz_id);
        console.log(
          `[interactive-poller] votes updated quiz=${row.current_quiz_id} ` +
            `total=${dump?.results?.total ?? 0} (event ${row.event_id})`,
        );
      }
    }
  } catch (err) {
    console.warn('[interactive-poller] poll error:', (err as Error).message);
  } finally {
    running = false;
  }
}

export function initInteractivePoller(io: Server): void {
  if (timer) return;
  timer = setInterval(() => {
    void pollOnce(io);
  }, POLL_INTERVAL_MS);
  console.log(`[interactive-poller] started (every ${POLL_INTERVAL_MS}ms)`);
}

export function shutdownInteractivePoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
