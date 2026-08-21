/**
 * `create_qsheet` / `propose_qsheet_draft` の DB 読み書き（MCP・段10 / 05-mcp.md §4-6・§4-7）。
 *
 * **サーバーから Yjs の `data` へは書かない。** 提案は `qsheet_ai_proposals` に1行置くだけで、
 * 台本への取り込みは画面でクライアントが `applyDataUpdate` 経由で行う（04 §3-1・05-mcp §6）。
 */
import { v4 as uuid } from 'uuid';
import { execute, queryOne } from '../../../../shared/db/connection';
import { AppError } from '../../../../shared/middleware/errorHandler';
import { recordAiOutput } from '../../../../shared/services/ai-output.service';
import { createDocument } from '../document-create.service';
import { canAccessDoc, type AccessUser } from '../../access';
import type { QsheetAiKind } from '../../ai/kinds';
import {
  validateOutlineProposal,
  validateLineProposal,
  type DroppedItem,
  type McpScriptOutlineProposal,
  type McpScriptLinesProposal,
} from '../../ai/mcpProposal';

// ============================================================
// create_qsheet
// ============================================================
export interface CreateQsheetInput {
  title: string;
  projectId?: string;
  episodeId?: string;
  broadcastDate?: string;
  blockTypes?: string[];
  idempotencyKey?: string;
}

export interface CreateQsheetResult {
  created: boolean;
  existing?: boolean;
  document: { id: string; docNo: string | null; title: string; url: string };
}

function docUrl(id: string): string {
  return `/qsheet/editor/${id}`;
}

export async function createQsheetIdempotent(actor: AccessUser, input: CreateQsheetInput): Promise<CreateQsheetResult> {
  if (input.idempotencyKey) {
    const dup = await queryOne(
      'SELECT id, doc_no, title FROM qsheet_documents WHERE idempotency_key = ? AND deleted_at IS NULL',
      [input.idempotencyKey],
    );
    if (dup) {
      return {
        created: false,
        existing: true,
        document: { id: dup.id as string, docNo: (dup.doc_no as string) ?? null, title: dup.title as string, url: docUrl(dup.id as string) },
      };
    }
  }

  const blocks = input.blockTypes && input.blockTypes.length > 0
    ? input.blockTypes.map((type, i) => ({ id: i === 0 ? type : `blk_${type}_${i}`, type, label: type, width: 150 }))
    : undefined; // 未指定なら document-create.service.ts の既定3列（scenario/video/audio）

  const row = await createDocument({
    title: input.title,
    projectId: input.projectId ?? null,
    episodeId: input.episodeId ?? null,
    broadcastDate: input.broadcastDate ?? null,
    blocks,
    createdBy: actor.id,
  });

  if (input.idempotencyKey) {
    await execute('UPDATE qsheet_documents SET idempotency_key = ? WHERE id = ?', [input.idempotencyKey, row.id]);
  }

  return {
    created: true,
    document: { id: row.id as string, docNo: (row.doc_no as string) ?? null, title: row.title as string, url: docUrl(row.id as string) },
  };
}

// ============================================================
// propose_qsheet_draft
// ============================================================
export interface ProposeDraftInput {
  documentId: string;
  kind: Extract<QsheetAiKind, 'script_outline_draft' | 'script_line_draft'>;
  payload: unknown;
  context?: {
    based_on_document_ids?: string[];
    schedule_id?: string;
    onair_window_min?: number;
    note?: string;
  };
  readFeedbackDigest?: boolean;
  model?: string;
  promptVersion?: string;
  idempotencyKey?: string;
  requestedBy?: string;
}

export interface ProposeDraftResult {
  created: boolean;
  existing?: boolean;
  proposal?: {
    id: string;
    documentId: string;
    kind: string;
    state: 'open';
    summary: { sections: number; rows: number; totalDurationText: string | null };
  };
  dropped: DroppedItem[];
  warnings: string[];
  nextStep: string;
  note?: string;
}

async function existingRowIdsOf(documentId: string): Promise<Set<string>> {
  const doc = await queryOne('SELECT data FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [documentId]);
  const data = (doc?.data && typeof doc.data === 'object' ? doc.data : {}) as { sections?: unknown[] };
  const sections = Array.isArray(data.sections) ? (data.sections as Record<string, unknown>[]) : [];
  const ids = new Set<string>();
  for (const s of sections) {
    const rows = Array.isArray(s.rows) ? (s.rows as Record<string, unknown>[]) : [];
    for (const r of rows) if (typeof r.id === 'string') ids.add(r.id);
  }
  return ids;
}

function summaryOf(kind: string, payload: McpScriptOutlineProposal | McpScriptLinesProposal): { sections: number; rows: number; totalDurationText: string | null } {
  if (kind === 'script_outline_draft') {
    const p = payload as McpScriptOutlineProposal;
    const rows = p.sections.reduce((n, s) => n + s.rows.length, 0);
    const totalSec = p.sections.reduce((n, s) => n + s.duration_sec, 0);
    const min = Math.round(totalSec / 60);
    return { sections: p.sections.length, rows, totalDurationText: min > 0 ? `${min}分` : null };
  }
  const p = payload as McpScriptLinesProposal;
  return { sections: 0, rows: p.lines.length, totalDurationText: null };
}

export async function createOutlineOrLineProposal(actor: AccessUser, input: ProposeDraftInput): Promise<ProposeDraftResult> {
  const doc = await queryOne(
    'SELECT id, project_id, created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL',
    [input.documentId],
  );
  if (!doc || !(await canAccessDoc(actor, input.documentId, (doc.created_by as string) ?? null))) {
    throw new AppError(404, 'NOT_FOUND', '台本が見つかりません');
  }

  if (input.idempotencyKey) {
    const dup = await queryOne('SELECT id, state FROM qsheet_ai_proposals WHERE idempotency_key = ?', [input.idempotencyKey]);
    if (dup) {
      if (dup.state === 'open') {
        const row = await queryOne('SELECT * FROM qsheet_ai_proposals WHERE id = ?', [dup.id]);
        const summary = summaryOf(input.kind, row!.proposal as McpScriptOutlineProposal | McpScriptLinesProposal);
        return {
          created: false,
          existing: true,
          proposal: { id: dup.id as string, documentId: input.documentId, kind: input.kind, state: 'open', summary },
          dropped: [],
          warnings: [],
          nextStep: `編集画面の「AIの提案」から内容を確認して取り込んでください: /qsheet/editor/${input.documentId}`,
        };
      }
      return {
        created: false,
        existing: true,
        dropped: [],
        warnings: [],
        nextStep: '',
        note: '同じ idempotency_key の提案は既に処理済みです（取り込み済みまたは見送り済み）。',
      };
    }
  }

  const validated = input.kind === 'script_outline_draft'
    ? validateOutlineProposal(input.payload)
    : validateLineProposal(input.payload, await existingRowIdsOf(input.documentId));

  const proposalId = uuid();
  await execute(
    `INSERT INTO qsheet_ai_proposals
       (id, kind, document_id, project_id, proposal, context, model, prompt_version,
        state, source, requested_by, read_feedback_digest, idempotency_key, created_by)
     VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, 'open', 'mcp', ?, ?, ?, ?)`,
    [
      proposalId, input.kind, input.documentId, doc.project_id ?? null,
      JSON.stringify(validated.payload), JSON.stringify(input.context ?? {}),
      input.model ? `mcp:${input.model}` : null, input.promptVersion ?? null,
      input.requestedBy ?? null, !!input.readFeedbackDigest, input.idempotencyKey ?? null, actor.id,
    ],
  );

  // AI 出力の全文置き場（切り詰め禁止）。best-effort — 失敗しても提案の作成は成功扱いにする
  // （AIループ方針: 記録の失敗で業務処理を壊さない）。
  const aiOutputId = await recordAiOutput({
    kind: input.kind,
    targetTable: 'qsheet_ai_proposals',
    targetId: proposalId,
    payload: validated.payload,
    toolName: 'propose_qsheet_draft',
    model: input.model ? `mcp:${input.model}` : null,
    promptVersion: input.promptVersion ?? null,
    actorId: actor.id,
    requestedBy: input.requestedBy ?? null,
    sourceChannel: 'mcp',
  });
  if (aiOutputId) {
    await execute('UPDATE qsheet_ai_proposals SET ai_output_id = ? WHERE id = ?', [aiOutputId, proposalId]);
  }

  const summary = summaryOf(input.kind, validated.payload);
  const warnings = [...validated.warnings];
  if (input.kind === 'script_outline_draft' && summary.rows === 0) {
    warnings.push('検証後に残った行が0件です。dropped の理由を見て提案を作り直してください。');
  }

  return {
    created: true,
    proposal: { id: proposalId, documentId: input.documentId, kind: input.kind, state: 'open', summary },
    dropped: validated.dropped,
    warnings,
    nextStep: `編集画面の「AIの提案」から内容を確認して取り込んでください: /qsheet/editor/${input.documentId}`,
  };
}
