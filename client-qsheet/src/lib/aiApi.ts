// AI 生成4機能 + 提案の取り込み — API 呼び出しの薄いラッパー（段8・04-ai.md §10）。
//
// **書き込みの実体はサーバーでは無く、ここが `applyProposal.ts` を呼んでから
// `/apply` で記録する**（§3-1）。生成そのもの（POST /event-plan 等）は
// `qsheet_ai_proposals` に置くだけで `data` には触らない。
import api from "./api";
import type { AppliedIds, ScriptOutlineProposal, ScriptLinesProposal } from "./applyProposal";

interface Envelope<T> { success: boolean; data: T }

export interface AiProposal<T = unknown> {
  id: string;
  kind: string;
  state: "open" | "applied" | "discarded" | "failed";
  proposal: T;
  context: Record<string, unknown>;
  model: string | null;
  prompt_version: string | null;
  document_id: string | null;
  schedule_id: string | null;
  created_at: string;
}

export interface EventPlanProposal {
  columns: Array<{ key: string; col_group: "venue" | "prep" | "ops"; label: string; room_hint: string | null }>;
  items: Array<{
    key: string; column_ref: string; title: string; kind: string;
    start_min: number; end_min: number; assignee: string | null; note: string | null; reason: string | null;
  }>;
}

// ── 生成 ────────────────────────────────────────────────────
export async function generateEventPlan(scheduleId: string, instruction?: string): Promise<AiProposal<EventPlanProposal>> {
  const res = await api.post<Envelope<AiProposal<EventPlanProposal>>>("/qsheet/ai/event-plan", {
    schedule_id: scheduleId, instruction,
  });
  return res.data.data;
}

export async function generateScriptOutline(
  documentId: string, opts: { scheduleItemId?: string; instruction?: string; fromMessageId?: string } = {},
): Promise<AiProposal<ScriptOutlineProposal>> {
  const res = await api.post<Envelope<AiProposal<ScriptOutlineProposal>>>("/qsheet/ai/script-outline", {
    document_id: documentId, schedule_item_id: opts.scheduleItemId,
    instruction: opts.instruction, from_message_id: opts.fromMessageId,
  });
  return res.data.data;
}

export async function generateScriptLines(
  documentId: string, opts: { rowIds?: string[]; sectionIds?: string[]; instruction?: string } = {},
): Promise<AiProposal<ScriptLinesProposal>> {
  const res = await api.post<Envelope<AiProposal<ScriptLinesProposal>>>("/qsheet/ai/script-lines", {
    document_id: documentId, row_ids: opts.rowIds, section_ids: opts.sectionIds, instruction: opts.instruction,
  });
  return res.data.data;
}

// ── 提案の取り込み・捨てる（段7の器） ───────────────────────────
export interface ApplyBody { applied_payload: unknown; applied_ids: AppliedIds; rejected_keys?: string[] }
export async function applyProposalRemote(id: string, body: ApplyBody): Promise<{ dropped_count: number }> {
  const res = await api.post<Envelope<{ dropped_count: number }>>(`/qsheet/ai/proposals/${id}/apply`, body);
  return res.data.data;
}
export async function discardProposal(id: string, reason?: string): Promise<void> {
  await api.post(`/qsheet/ai/proposals/${id}/discard`, { reason });
}
export async function listProposals(params: { document_id?: string; schedule_id?: string; state?: string }): Promise<AiProposal[]> {
  const res = await api.get<Envelope<{ proposals: AiProposal[] }>>("/qsheet/ai/proposals", { params });
  return res.data.data.proposals;
}

// ── 壁打ち（④・本人のみ） ───────────────────────────────────────
export interface AiThread {
  id: string; title: string; project_id: string | null; schedule_id: string | null; document_id: string | null;
  created_at: string; updated_at: string;
}
export interface AiMessage {
  id: string; seq: number; role: "user" | "assistant"; content: string;
  suggestion: { suggests: string; hint: string } | null;
  feedback: "good" | "rephrase" | "reject" | null;
  spawned_proposal_id: string | null;
}

export async function createThread(body: { title?: string; projectId?: string; scheduleId?: string; documentId?: string }): Promise<AiThread> {
  const res = await api.post<Envelope<AiThread>>("/qsheet/ai/threads", {
    title: body.title, project_id: body.projectId, schedule_id: body.scheduleId, document_id: body.documentId,
  });
  return res.data.data;
}
export async function getThread(id: string): Promise<AiThread & { messages: AiMessage[] }> {
  const res = await api.get<Envelope<AiThread & { messages: AiMessage[] }>>(`/qsheet/ai/threads/${id}`);
  return res.data.data;
}
export interface PostMessageResult {
  user: { id: string; seq: number; content: string };
  assistant: AiMessage & { model: string | null; prompt_version: string | null };
  history_truncated: boolean;
}
export async function postThreadMessage(threadId: string, content: string): Promise<PostMessageResult> {
  const res = await api.post<Envelope<PostMessageResult>>(`/qsheet/ai/threads/${threadId}/messages`, { content });
  return res.data.data;
}
export async function setMessageFeedback(messageId: string, feedback: "good" | "rephrase" | "reject", note?: string): Promise<void> {
  await api.put(`/qsheet/ai/messages/${messageId}/feedback`, { feedback, note });
}
