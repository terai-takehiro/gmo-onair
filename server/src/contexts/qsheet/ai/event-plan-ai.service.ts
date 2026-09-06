/**
 * ①イベント設計（当日の枠の叩き台）の生成（段8・04-ai.md §1-1・§10-1）。
 *
 * 出力先は `qsheet_ai_proposals` だけ。**`qsheet_schedule_items`/`qsheet_schedule_columns`
 * には一切書かない** — 人が画面でプレビューし、取り込んだときにクライアントが
 * REST 経由で列・項目を作り、`POST /ai/proposals/:id/apply` で記録する（段7の器を使う）。
 */
import { queryAll } from '../../../shared/db/connection';
import { EVENT_PLAN_KIND, EVENT_PLAN_PROMPT_VERSION, promptVersionOf } from './kinds';
import { EventPlanSchema } from './schemas';
import { normalizeEventPlan, type EventPlanProposal } from './normalize';
import { gatherMaterialsForSchedule, type GenerationMaterials } from './materials';
import { runGeneration } from './generation-common';
import type { ProposalRow } from './types';

export interface GenerateEventPlanOptions {
  instruction?: string;
  isAdmin: boolean;
  /**
   * 拠点・種別の構造化入力（14-schedule-v2-plan.md §3 B10・§5）。自由文だけだと
   * 集計側（`getFeedbackDigest` の `segmentKey` = `type:|loc:`）が拾えない・表にまだ
   * 拠点が無い／案件に種別が未設定のときに埋まらない、という穴を埋める。
   * 表・案件の実際の値は書き換えない（`materials.ts` の `GatherOptions` 参照）。
   */
  locationId?: string | null;
  category?: string | null;
}

/** 種別の表示名。`client/src/contexts/sales/classification.ts` の `PROJECT_CATEGORY_LABEL` と
 *  同じ語彙（`projects.project_category`）— サーバー側なのでここに写しを持つ。書き換えるときは両方直す。 */
const CATEGORY_LABEL: Record<string, string> = {
  broadcast: '配信/生放送', recording: '収録', event: 'イベント（会場のみ）',
};

function buildSystemPrompt(): string {
  return `あなたは放送・イベント制作会社の制作進行です。
当日の進行枠（会場ごとの列に、準備・リハ・本番・撤収などの項目を並べたガント表）の
叩き台を作ります。

## 守ること
- 時刻は**その日の 00:00 からの分（整数）**で答える。"9:30" のような文字列は使わない
- 列は既存のものに項目を当てるか、無ければ新しい列を提案する（key で仮に名づける）
- 移動時間・転換（片付け→設営）の間隔を忘れない。時刻の計算違いは当日を壊す
- 分からないことは無理に埋めず、reason に「要確認」の旨を書く`;
}

function buildUserPrompt(materials: GenerationMaterials, instruction?: string): string {
  const p = materials.project;
  const lines: string[] = [];
  // categoryHint は「人が生成のときに選んだ種別」を案件本体の値より優先する（§3 B10）
  const categoryLabel = materials.categoryHint ? (CATEGORY_LABEL[materials.categoryHint] ?? materials.categoryHint) : null;
  lines.push('## 案件');
  lines.push(p ? `${p.name}（${categoryLabel ?? p.projectType ?? '種別不明'}・${p.companyName ?? '顧客不明'}）` : `（案件情報なし・種別: ${categoryLabel ?? '不明'}）`);
  if (p?.memoExcerpt) lines.push(`備考: ${p.memoExcerpt}`);
  if (materials.venue) {
    lines.push(`## 会場: ${materials.venue.locationName ?? '不明'}（部屋: ${materials.venue.roomNames.join('・') || '未設定'}）`);
  }
  if (materials.episode) {
    lines.push(`## 本番日: ${materials.episode.broadcastDate ?? materials.episode.recordingDate ?? '未定'}`);
  }
  if (materials.scheduleItems.length) {
    lines.push('## 既に入っている項目');
    for (const it of materials.scheduleItems) {
      lines.push(`- ${it.kind} ${it.startMin}〜${it.endMin}分: ${it.title}`);
    }
  }
  if (materials.knowledge.length) {
    lines.push('## 守るべきルール（人が承認済み）');
    for (const k of materials.knowledge) lines.push(`- ${k.body}`);
  }
  if (materials.advice.length) {
    lines.push('## 前回までの傾向（人があなたの提案をどう直したか）');
    for (const a of materials.advice) lines.push(`- ${a}`);
  }
  if (instruction) {
    lines.push('## 追加の指示');
    lines.push(instruction);
  }
  return lines.join('\n');
}

export async function generateEventPlan(
  scheduleId: string, opts: GenerateEventPlanOptions, userId: string,
): Promise<ProposalRow> {
  const materials = await gatherMaterialsForSchedule(scheduleId, {
    kind: EVENT_PLAN_KIND, viewerId: userId, isAdmin: opts.isAdmin,
    locationIdOverride: opts.locationId ?? null, categoryOverride: opts.category ?? null,
  });
  const existingColumns = await queryAll(
    'SELECT id FROM qsheet_schedule_columns WHERE schedule_id = ? AND deleted_at IS NULL', [scheduleId],
  );
  const existingColumnIds = new Set(existingColumns.map((c) => String(c.id)));

  const promptVersion = promptVersionOf(EVENT_PLAN_PROMPT_VERSION, materials.knowledgeRev, materials.advice.length);
  const { proposal } = await runGeneration<{ columns: unknown; items: unknown }, EventPlanProposal>({
    job: 'event_plan', usageKind: 'event_plan', kind: EVENT_PLAN_KIND,
    scheduleId, projectId: materials.project?.id ?? null, userId,
    tier: 'heavy', // 常時 heavy（04-ai.md §7）。時刻の抜けは目視で気づけない
    system: buildSystemPrompt(), user: buildUserPrompt(materials, opts.instruction),
    schema: EventPlanSchema, schemaName: 'event_plan', promptVersion,
    normalize: (raw) => normalizeEventPlan(raw, { existingColumnIds }),
    isEmpty: (plan) => plan.columns.length === 0 && plan.items.length === 0,
    contextSummary: {
      // segment_key が digest の `type:|loc:` 集計軸そのもの（§6-1）。location_id/category は
      // 画面表示・デバッグ用の生値（人が明示的に選んだ拠点・種別が入っていれば分かるように）
      segment_key: materials.segmentKey, location_id: materials.venue?.locationId ?? null,
      category: materials.categoryHint, advice_count: materials.advice.length,
      knowledge_count: materials.knowledge.length, references: [],
    },
    inputSnapshot: { materials, instruction: opts.instruction ?? null },
  });
  return proposal;
}
