/**
 * contexts/graphics/services/interactive-poller.service.ts — 段6-7
 *
 * 別 VPS のインタラクティブ演出から「いま送出中の投票・クイズページ」の得票数を
 * 一定間隔で取得し、`graphics_pages.fields.choices[].votes` に反映 + CG 出力に
 * socket push する。
 *
 * `server/src/contexts/quiz/services/interactive-poller.service.ts`（旧 Awards・
 * `quiz_stack_state.step <> 'idle'` の1問だけを対象にした軽量ポーリング・実運用実績あり）の
 * ほぼそのままの移植。DB アクセス部分だけ以下のように置き換えている:
 *   - 対象行の絞り込み: `graphics_cue_state.is_live = true` かつ `voteState = 'open'`
 *     の投票ページ（旧 `quiz_stack_state.step <> 'idle'` と同じ「実際に送出中のものだけ」）
 *   - 反映先: `quiz_choices.vote_count` の UPDATE ではなく、`graphics_pages.fields.choices`
 *     （JSON配列）の各要素の `votes` だけを SQL (jsonb_set) で原子的にマージする
 *     （票数以外のフィールド〈label/labelEn等〉は変更しない。`fields` を丸ごと書き戻すと
 *     ポーリングの読み書きの間に入ったオペレーター編集を巻き戻してしまう）
 *   - choice の index は Interactive 側の `choice_index` とそのまま対応する（配列 index
 *     そのまま。旧 awards の `position = index + 1` という1始まりへのオフセットは不要）
 *
 * `resolveQuestionId` の ACTIVE 問題優先解決ロジックは変更なしで移植した。
 */
import type { Server } from 'socket.io';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { fetchCues, mapPage, normalizeInteractiveLink } from '../store';
import { interactiveBridge, type InteractiveLink } from './interactive-bridge.service';

const POLL_INTERVAL_MS = 800;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

interface ActiveRow {
  page_id: number;
  project_id: number;
  interactive_question_id: string;
  interactive_link: InteractiveLink | string | null;
  page_fields: Record<string, unknown> | null;
}

// projectId → 連携イベントで「いま ACTIVE な問題」の id（TTL キャッシュ）。quiz 版と同じ理由
// （保存済みの interactiveQuestionId が古い/別問題を指していても、視聴者が実際に投票している
// ACTIVE 問題から票を拾えるようにする）。
const activeQCache = new Map<number, { qid: string | null; ts: number }>();
const ACTIVE_Q_TTL_MS = 2500;

async function resolveQuestionId(
  link: InteractiveLink,
  projectId: number,
  linkedId: string,
): Promise<string> {
  const now = Date.now();
  const cached = activeQCache.get(projectId);
  if (cached && now - cached.ts < ACTIVE_Q_TTL_MS) {
    return cached.qid ?? linkedId;
  }
  try {
    const { questions } = await interactiveBridge.listQuestions(link);
    const active = (questions ?? [])
      .filter((q) => q.status === 'active')
      .sort((a, b) => (b.answer_count ?? 0) - (a.answer_count ?? 0))[0];
    const qid = active?.id ?? null;
    activeQCache.set(projectId, { qid, ts: now });
    if (qid && qid !== linkedId) {
      console.warn(
        `[graphics-interactive-poller] linked id stale? polling ACTIVE question ${qid} ` +
          `instead of linked ${linkedId} (project ${projectId})`,
      );
    }
    return qid ?? linkedId;
  } catch (err) {
    activeQCache.set(projectId, { qid: null, ts: now });
    console.warn('[graphics-interactive-poller] listQuestions failed:', (err as Error).message);
    return linkedId;
  }
}

async function pollOnce(io: Server): Promise<void> {
  if (running) return; // 前回の poll がまだ走っていたらスキップ（多重実行防止）
  running = true;
  try {
    const rows = (await queryAll(
      `SELECT p.id AS page_id, p.project_id,
              p.fields->>'interactiveQuestionId' AS interactive_question_id,
              p.fields AS page_fields,
              pr.interactive_link
         FROM graphics_pages p
         JOIN graphics_projects pr ON pr.id = p.project_id
         JOIN graphics_cue_state cs ON cs.project_id = p.project_id AND cs.page_id = p.id AND cs.is_live = true
        WHERE p.part_key = 'vote'
          AND p.fields->>'voteState' = 'open'
          AND p.fields->>'interactiveQuestionId' IS NOT NULL
          AND pr.interactive_link IS NOT NULL`,
    )) as unknown as ActiveRow[];

    for (const row of rows) {
      const link = normalizeInteractiveLink(row.interactive_link);
      if (!link?.baseUrl || !link?.apiKeySecret) continue;

      const targetQid = await resolveQuestionId(link, row.project_id, row.interactive_question_id);

      let dump;
      try {
        dump = await interactiveBridge.getResults(link, targetQid);
      } catch (err) {
        // 1ページの失敗で全体を止めない
        console.warn('[graphics-interactive-poller] getResults failed:', (err as Error).message);
        continue;
      }

      const resultChoices = dump?.results?.choices ?? [];
      const resultMap = new Map<number, number>();
      for (const c of resultChoices) {
        resultMap.set(c.index, Math.max(0, Math.floor(Number(c.count) || 0)));
      }

      // 票数が変わっていなければ書かない（スナップショット比較。書き込み抑制のためだけに使う）
      const choicesRaw = Array.isArray(row.page_fields?.choices) ? (row.page_fields!.choices as unknown[]) : [];
      let changed = false;
      choicesRaw.forEach((c, index) => {
        if (!c || typeof c !== 'object') return;
        const currentVotes = Math.max(0, Math.trunc(Number((c as Record<string, unknown>).votes) || 0));
        if (currentVotes !== (resultMap.get(index) ?? 0)) changed = true;
      });

      if (!changed) continue;

      // fields はスナップショットの丸ごと書き戻しにしない — SELECT からここまで（外部API往復込み）の
      // 間にオペレーターが PUT /pages/:id で行った編集（設問文・選択肢ラベル等）を巻き戻すため。
      // UPDATE 時点の現在値の choices[] へ votes だけを原子的にマージする（jsonb_set は
      // vote-lifecycle.service の前例に合わせ create_missing=false: choices が無ければ何もしない）。
      // WHERE の voteState='open' は、手動/自動締切と競合したとき締切後の遅延書き込みを防ぐ。
      const votesMap: Record<string, number> = {};
      for (const [index, count] of resultMap) votesMap[String(index)] = count;
      const updated = await queryOne(
        `UPDATE graphics_pages
            SET fields = jsonb_set(
                  COALESCE(fields, '{}'::jsonb),
                  '{choices}',
                  COALESCE((
                    SELECT jsonb_agg(
                             CASE WHEN jsonb_typeof(elem) = 'object'
                                  THEN elem || jsonb_build_object('votes', COALESCE(((?::jsonb) ->> (ord - 1)::text)::int, 0))
                                  ELSE elem END
                             ORDER BY ord)
                      FROM jsonb_array_elements(COALESCE(fields, '{}'::jsonb) -> 'choices')
                           WITH ORDINALITY AS t(elem, ord)
                  ), '[]'::jsonb),
                  false
                ),
                updated_at = NOW()
          WHERE id = ? AND fields->>'voteState' = 'open'
          RETURNING *`,
        [JSON.stringify(votesMap), row.page_id],
      );
      if (!updated) continue;

      const page = mapPage(updated);
      const cues = await fetchCues(row.project_id);
      io.of('/graphics').to(`project:${row.project_id}`).emit('cg:sync', { cues, page, timestamp: Date.now() });
      console.log(
        `[graphics-interactive-poller] votes updated page=${row.page_id} ` +
          `total=${dump?.results?.total ?? 0} (project ${row.project_id})`,
      );
    }
  } catch (err) {
    console.warn('[graphics-interactive-poller] poll error:', (err as Error).message);
  } finally {
    running = false;
  }
}

/** テロップCG専用のポーラー登録。`contexts/quiz` の同名関数（旧Awards向け）とは別インスタンス。 */
export function initGraphicsInteractivePoller(io: Server): void {
  if (timer) return;
  timer = setInterval(() => {
    void pollOnce(io);
  }, POLL_INTERVAL_MS);
  console.log(`[graphics-interactive-poller] started (every ${POLL_INTERVAL_MS}ms)`);
}

export function shutdownGraphicsInteractivePoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
