/**
 * ②台本の骨格（ロールと尺の並び）の生成（段8・04-ai.md §1-1・§10-1）。
 *
 * 出力先は `qsheet_ai_proposals` だけ。**`qsheet_documents.data` には一切書かない**
 * — 人が編集画面でプレビューし、取り込んだときにクライアントが
 * `applyProposalOps`（`client-qsheet/src/lib/applyProposal.ts`。段7で実装済み）で
 * `applyDataUpdate` を通して初めて `data` に入る。
 */
import { queryOne } from '../../../shared/db/connection';
import { SCRIPT_OUTLINE_KIND, SCRIPT_OUTLINE_PROMPT_VERSION, promptVersionOf } from './kinds';
import { ScriptOutlineSchema } from './schemas';
import { normalizeScriptOutline, type ScriptOutlineProposal } from './normalize';
import { gatherMaterialsForDocument, type GenerationMaterials } from './materials';
import { runGeneration } from './generation-common';
import type { ProposalRow } from './types';

export interface GenerateScriptOutlineOptions {
  /** 枠の長さ（秒）。指定が無ければ上限なし */
  budgetSec?: number | null;
  instruction?: string;
  isAdmin: boolean;
}

function buildSystemPrompt(): string {
  return `あなたは放送・イベント制作会社の構成作家です。
台本の骨格（ロールの並び・それぞれの尺・行のラベル）の叩き台を作ります。

## 守ること
- **本文（セリフ）は書かない。** row の hint には「何を話す行か」を1行のメモで書くだけ
- 合計尺が budget_sec（渡されていれば）を超えないようにする。超える案は使われない
- speaker には masters.persons にある名前だけを使う。分からなければ空文字
- 過去の見本があれば、ロール構成・尺配分の型として参考にする（言い回しは真似しない）`;
}

function buildUserPrompt(materials: GenerationMaterials, budgetSec: number | null, instruction?: string): string {
  const p = materials.project;
  const lines: string[] = [];
  lines.push('## 案件');
  lines.push(p ? `${p.name}（${p.projectCategory ?? p.projectType ?? '種別不明'}）` : '（案件情報なし）');
  if (budgetSec) lines.push(`## 尺の上限: ${budgetSec}秒（${Math.round(budgetSec / 60)}分）。budget_sec に必ずこの値以下を入れる`);
  if (materials.similar.length) {
    lines.push('## 過去の似た回（見本・本文は含みません）');
    for (const s of materials.similar) {
      lines.push(`### ${s.title || '（無題）'} — 類似度${s.score}点・${s.serviceDate ?? '日付不明'}`);
      for (const sec of s.sections) lines.push(`- ${sec.label} / ${sec.durationSec}秒 / ${sec.rowCount}行`);
    }
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

export async function generateScriptOutline(
  documentId: string, opts: GenerateScriptOutlineOptions, userId: string,
): Promise<ProposalRow> {
  const materials = await gatherMaterialsForDocument(documentId, {
    kind: SCRIPT_OUTLINE_KIND, viewerId: userId, isAdmin: opts.isAdmin, excludeDocumentId: documentId,
  });
  const budgetSec = opts.budgetSec ?? null;

  const promptVersion = promptVersionOf(SCRIPT_OUTLINE_PROMPT_VERSION, materials.advice.length);
  const { proposal } = await runGeneration<{ budget_sec: unknown; sections: unknown }, ScriptOutlineProposal>({
    job: 'script_outline', usageKind: 'script_outline', kind: SCRIPT_OUTLINE_KIND,
    documentId, projectId: materials.project?.id ?? null, userId,
    tier: 'heavy', // 常時 heavy（04-ai.md §7）。尺の押し引きは本番まで気づきにくい
    system: buildSystemPrompt(), user: buildUserPrompt(materials, budgetSec, opts.instruction),
    schema: ScriptOutlineSchema, schemaName: 'script_outline', promptVersion,
    normalize: (raw) => normalizeScriptOutline(raw, budgetSec),
    isEmpty: (plan) => plan.sections.length === 0,
    contextSummary: {
      segment_key: materials.segmentKey, advice_count: materials.advice.length,
      knowledge_count: 0,
      references: materials.similar.map((s) => ({ document_id: s.documentId, title: s.title, score: s.score })),
    },
    inputSnapshot: { materials, budgetSec, instruction: opts.instruction ?? null },
  });
  return proposal;
}

/** `schedule_item_id` から尺の上限（秒）を引く（04-ai.md §10-1 の `ScriptOutlineRequest`） */
export async function budgetSecOfScheduleItem(scheduleItemId: string): Promise<number | null> {
  const row = await queryOne(
    'SELECT start_min, end_min FROM qsheet_schedule_items WHERE id = ? AND deleted_at IS NULL', [scheduleItemId],
  );
  if (!row) return null;
  const startMin = Number(row.start_min) || 0;
  const endMin = Number(row.end_min) || 0;
  return Math.max(0, (endMin - startMin) * 60);
}
