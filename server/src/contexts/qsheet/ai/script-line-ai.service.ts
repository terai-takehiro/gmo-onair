/**
 * ③セリフ（プロンプター原稿）の生成（段8・04-ai.md §1-1・§2-4・§10-1）。
 *
 * **AI に埋めさせるブロック型はこの機能に限り `scenario` のみ**（映像・テロップ・小道具は
 * 埋めない）。**既にある行 id にしか書かない** — 行を増やしも減らしもしない
 * （増やすと骨格を AI が崩し、条件2の突合が壊れる）。
 */
import { queryOne } from '../../../shared/db/connection';
import { SCRIPT_LINE_KIND, SCRIPT_LINE_PROMPT_VERSION, promptVersionOf } from './kinds';
import { ScriptLinesSchema } from './schemas';
import { normalizeScriptLines, type ScriptLinesProposal } from './normalize';
import { gatherMaterialsForDocument, type GenerationMaterials } from './materials';
import { runGeneration } from './generation-common';
import { ValidationError } from '../services/httpErrors';
import type { ProposalRow } from './types';

export interface GenerateScriptLinesOptions {
  rowIds?: string[];
  sectionIds?: string[];
  instruction?: string;
  isAdmin: boolean;
}

interface TargetRow { rowId: string; label: string; sectionLabel: string; existingText: string }

function buildSystemPrompt(): string {
  return `あなたは放送・イベント制作会社の構成作家です。
プロンプターで読み上げるセリフ（既にある行の本文）を書きます。

## 守ること
- **row_id は渡された行のものしか使わない。** 行を増やさない・減らさない
- **HTML タグは書かない。** プレーンテキストのみ。改行は \\n
- name（話者）は masters.persons にある名前だけ。分からなければ空文字
- 「ここは1行足したほうがよい」等は text ではなく advice に書く。行は勝手に増やさない
- 同じ話者の過去のセリフ（見本）があれば、口調をそこに合わせる（内容はコピーしない）`;
}

function buildUserPrompt(
  materials: GenerationMaterials, targets: TargetRow[], instruction?: string,
): string {
  const p = materials.project;
  const lines: string[] = [];
  lines.push('## 案件');
  lines.push(p ? `${p.name}（${p.projectCategory ?? p.projectType ?? '種別不明'}）` : '（案件情報なし）');
  lines.push('## 書く対象の行');
  for (const t of targets) {
    lines.push(`- row_id=${t.rowId} 【${t.sectionLabel}】${t.label}${t.existingText ? `（下書き: ${t.existingText.slice(0, 30)}…）` : ''}`);
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

/** 対象行を集める。**空なら「全行」ではなく「本番ロールだけ」**（§2-6） */
async function resolveTargetRows(
  documentId: string, opts: GenerateScriptLinesOptions,
): Promise<{ targets: TargetRow[]; allowedRowIds: Set<string>; allowedNames: Set<string> }> {
  const doc = await queryOne('SELECT data FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
  const data = (doc?.data ?? {}) as Record<string, unknown>;
  const blocks = Array.isArray(data.blocks) ? (data.blocks as Record<string, unknown>[]) : [];
  const scenarioBlock = blocks.find((b) => b?.type === 'scenario');
  const scenarioBlockId = (scenarioBlock?.id as string | undefined) ?? null;
  const sections = Array.isArray(data.sections) ? (data.sections as Record<string, unknown>[]) : [];
  const masters = (data.masters ?? {}) as Record<string, unknown>;
  const allowedNames = new Set((Array.isArray(masters.persons) ? masters.persons : []).map(String));

  const rowIdFilter = opts.rowIds?.length ? new Set(opts.rowIds) : null;
  const sectionIdFilter = opts.sectionIds?.length ? new Set(opts.sectionIds) : null;

  const targets: TargetRow[] = [];
  const allowedRowIds = new Set<string>();
  for (const sec of sections) {
    if (sec._break || sec._pageBreak || sec._vtr) continue; // §2-6「本番ロールだけ」
    const secId = String(sec.id ?? '');
    if (sectionIdFilter && !sectionIdFilter.has(secId)) continue;
    const rows = Array.isArray(sec.rows) ? (sec.rows as Record<string, unknown>[]) : [];
    for (const row of rows) {
      const rowId = String(row.id ?? '');
      if (!rowId) continue;
      if (rowIdFilter && !rowIdFilter.has(rowId)) continue;
      allowedRowIds.add(rowId);
      const cell = scenarioBlockId
        ? ((row.cells as Record<string, unknown> | undefined)?.[scenarioBlockId] as Record<string, unknown> | undefined)
        : undefined;
      const entry = Array.isArray(cell?.entries) ? (cell!.entries as Record<string, unknown>[])[0] : undefined;
      targets.push({
        rowId, label: String(row.label ?? ''), sectionLabel: String(sec.label ?? ''),
        existingText: String(entry?.html ?? ''),
      });
    }
  }
  return { targets, allowedRowIds, allowedNames };
}

export async function generateScriptLines(
  documentId: string, opts: GenerateScriptLinesOptions, userId: string,
): Promise<ProposalRow> {
  const { targets, allowedRowIds, allowedNames } = await resolveTargetRows(documentId, opts);
  if (targets.length === 0) {
    throw new ValidationError('セリフを作る対象の行がありません（対象は本番ロールの行だけです）');
  }

  const materials = await gatherMaterialsForDocument(documentId, {
    kind: SCRIPT_LINE_KIND, viewerId: userId, isAdmin: opts.isAdmin, excludeDocumentId: documentId,
  });

  const tier = targets.length * 40 > 4000 ? 'heavy' : 'light'; // ai-model.ts の閾値と揃える目安
  const promptVersion = promptVersionOf(SCRIPT_LINE_PROMPT_VERSION, materials.knowledgeRev, materials.advice.length);
  const { proposal } = await runGeneration<{ lines: unknown; advice: unknown }, ScriptLinesProposal>({
    job: 'script_line', usageKind: 'script_line', kind: SCRIPT_LINE_KIND,
    documentId, projectId: materials.project?.id ?? null, userId,
    tier, retryHeavyOnError: true, // ③のみ: 例外時に1回だけ heavy へ（§8-1）
    system: buildSystemPrompt(), user: buildUserPrompt(materials, targets, opts.instruction),
    schema: ScriptLinesSchema, schemaName: 'script_lines', promptVersion,
    normalize: (raw) => normalizeScriptLines(raw, allowedRowIds, allowedNames),
    isEmpty: (plan) => plan.lines.length === 0,
    contextSummary: {
      segment_key: materials.segmentKey, advice_count: materials.advice.length,
      knowledge_count: materials.knowledge.length, target_row_count: targets.length,
    },
    inputSnapshot: { materials, targetRowIds: [...allowedRowIds], instruction: opts.instruction ?? null },
  });
  return proposal;
}
