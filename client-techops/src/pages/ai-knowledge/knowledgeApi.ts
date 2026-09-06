// AIナレッジ（`qsheet_ai_knowledge`）の承認UI — API の薄いラッパーと表示用の定数。
//
// バックエンドは段9（04-ai.md §6-3・§10-4）で完備済み
// （`server/src/contexts/qsheet/{ai/knowledge.ts, routes/ai-knowledge.routes.ts}`）。
// このファイルはそのAPIの**実際の形**（一覧 `{knowledge: rows}`・更新 `PUT :id`・
// status が変わるときだけ表全体の rev が単調に進む）を正として写しただけで、
// クライアント側で新しい概念は足さない。
import api from '@/lib/api';

export type KnowledgeStatus = 'draft' | 'active' | 'retired';
export type KnowledgeOrigin = 'auto' | 'human';

/**
 * 月次レビューの自動起草（`draftAutoKnowledge`）が入れる evidence の形
 * （`monthly-review.service.ts` の `draftKnowledgeFromDigest` が唯一の書き手）。
 * jsonb なので将来キーが増えても壊れないよう、全部 optional で受ける。
 */
export interface KnowledgeEvidence {
  field_path?: string;
  corrections?: number;
  fix?: number;
  enrich?: number;
  reject?: number;
  share?: number;
}

/** サーバーの `KnowledgeRow`（`ai/knowledge.ts`）そのまま。snake_case のまま受ける */
export interface KnowledgeRow {
  id: string;
  kind: string | null;
  segment_key: string | null;
  body: string;
  rationale: string | null;
  status: KnowledgeStatus;
  origin: KnowledgeOrigin;
  evidence: KnowledgeEvidence | null;
  rev: number;
  sort_order: number;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Envelope<T> { success: boolean; data: T }

/** 一覧（全状態）。閲覧は qsheet reader で通る（サーバー側のゲートと同じ） */
export async function listKnowledge(): Promise<KnowledgeRow[]> {
  const res = await api.get<Envelope<{ knowledge: KnowledgeRow[] }>>('/techops/ai/knowledge');
  return res.data.data.knowledge;
}

/**
 * 承認（active）・却下/引退（retired）。manager 以上のみ（サーバーが強制する。
 * ボタンの出し分けは見た目の話で、権限の正はあくまでサーバー側）。
 */
export async function updateKnowledgeStatus(id: string, status: KnowledgeStatus): Promise<KnowledgeRow> {
  const res = await api.put<Envelope<KnowledgeRow>>(`/techops/ai/knowledge/${id}`, { status });
  return res.data.data;
}

/**
 * kind の表示名。値の正はサーバーの `ai/kinds.ts`（生成4機能）。
 * `kind IS NULL` は「全機能共通」（listActiveKnowledge が NULL を
 * 「広げる」方向で扱う仕様に合わせた言い方）。
 */
export const KIND_LABELS: Record<string, string> = {
  event_plan_draft: 'イベント設計',
  script_outline_draft: '台本の骨格',
  script_line_draft: 'セリフ',
  production_chat: 'AI に相談',
};

export function kindLabel(kind: string | null): string {
  if (!kind) return '全機能共通';
  return KIND_LABELS[kind] ?? kind;
}

export const STATUS_LABELS: Record<KnowledgeStatus, string> = {
  draft: '下書き',
  active: '有効',
  retired: '引退',
};
