/**
 * AI（MCP）が起票したプロジェクト・タスクについての「人がどこを直したか」を残す。
 *
 * 案件側の `project-ai-feedback.service.ts` と同じ形（会社方針「AI を使い捨てにしない」の
 * 条件2）。**kind を分けている**のは、プロジェクト（GLS-B）は突き合わせる項目が
 * 案件（GLS-A）と違うため — `gpm_kind` / `pm_company` / `started_on` / `ends_on` は
 * 案件に無く、`expected_amount` / `event_start` はプロジェクトの登録に無い。
 * 同じ `project_draft` に混ぜると「よく直される項目」の集計が両者で濁る。
 *
 * ── 3つの落とし穴（`.claude/skills/ai-feedback-loop/` の失敗パターン）──
 *
 * ① 通常の業務更新を「AI の誤り」と数えない → `findLatestAiOutput` の 7日窓。
 *    `stage`（受注・完了）と `is_completed`（タスクの完了）は**業務が進んだ印**なので
 *    突き合わせの項目に入れない（承認しただけで「AI が間違えた」になる）
 * ② AI が自分で直した分を「人の修正」として数えない → `config.mcpActorId` を外す
 * ③ 人に差分を入力させない → before/after はサーバーが自動で比べる
 *
 * 記録に失敗しても保存は成功させる（`ai-output.service` 側が握りつぶす作り）。
 */
import { config } from '../../../config';
import {
  findLatestAiOutput,
  recordCorrections,
  type CorrectionInput,
} from '../../../shared/services/ai-output.service';

/** AI 出力の種類。MCP の `create_gpm_project` / `create_gpm_task` が起票時に残す */
export const GPM_PROJECT_DRAFT_KIND = 'gpm_project_draft';
export const GPM_TASK_DRAFT_KIND = 'gpm_task_draft';

/**
 * 突き合わせる項目。**AI が埋められるものだけ**を並べる。
 * `stage` は受注/完了で必ず動く業務の印、`gls_number` は発番の結果なので入れない。
 * `notes` はメモ（やり取りの1件）に変換されて列に残らないので突き合わせられない。
 */
const PROJECT_FIELDS: { path: string; label: string }[] = [
  { path: 'name', label: 'プロジェクト名' },
  { path: 'customer_id', label: '依頼元' },
  { path: 'gpm_kind', label: '種別（自社構築/グループ受託）' },
  { path: 'pm_company', label: 'PM会社' },
  { path: 'started_on', label: '開始日' },
  { path: 'ends_on', label: '終了日' },
  { path: 'assigned_to', label: '担当者' },
];

/**
 * タスク側。`is_completed` は業務の印なので入れない。
 * `gpm_phase_id` は「どの工程に付けるか」を AI が決めるので突き合わせる。
 */
const TASK_FIELDS: { path: string; label: string }[] = [
  { path: 'title', label: 'タスク名' },
  { path: 'description', label: '説明' },
  { path: 'assigned_to', label: '担当者' },
  { path: 'due_date', label: '期限' },
  { path: 'gpm_phase_id', label: '工程' },
];

/** 見た目が違うだけの値を「直した」と数えないための正規化（案件側と同じ式） */
function norm(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(v);
  const s = String(v).trim();
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? String(n) : s;
}

async function recordDiffs(
  kind: string,
  targetTable: string,
  targetId: string,
  fields: { path: string; label: string }[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  userId: string,
): Promise<void> {
  // AI が自分の下書きを直しているだけの回は数えない（案件側と同じ判断）
  if (userId === config.mcpActorId) return;

  const output = await findLatestAiOutput(targetTable, targetId, kind);
  if (!output) return; // AI 起票でない / 7日を過ぎている

  const diffs: CorrectionInput[] = [];
  for (const f of fields) {
    const b = norm(before[f.path]);
    const a = norm(after[f.path]);
    if (b === a) continue;
    diffs.push({
      fieldPath: f.path,
      before: before[f.path] ?? null,
      after: after[f.path] ?? null,
      // 空 → 値 は「AI が取れなかったものを人が足した」= 追記。値 → 別の値 は取り違え
      type: b === '' ? 'enrich' : 'fix',
    });
  }
  if (diffs.length === 0) return;

  // 直さなかった項目も残す（無修正採用率の分母）。**直した回だけ**記録する —
  // 開くたびに 'none' を積むと、よく開かれる行ほど精度が高く見える
  for (const f of fields) {
    if (diffs.some((d) => d.fieldPath === f.path)) continue;
    diffs.push({ fieldPath: f.path, type: 'none' });
  }

  await recordCorrections(output.id, diffs, userId);
}

/** プロジェクトの保存時に呼ぶ。AI 起票でなければ何もしない */
export async function recordGpmProjectCorrections(
  projectId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  userId: string,
): Promise<void> {
  await recordDiffs(GPM_PROJECT_DRAFT_KIND, 'projects', projectId, PROJECT_FIELDS, before, after, userId);
}

/** タスクの保存時に呼ぶ。AI 起票でなければ何もしない */
export async function recordGpmTaskCorrections(
  taskId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  userId: string,
): Promise<void> {
  await recordDiffs(GPM_TASK_DRAFT_KIND, 'project_tasks', taskId, TASK_FIELDS, before, after, userId);
}
