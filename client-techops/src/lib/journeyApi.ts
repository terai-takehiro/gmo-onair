// 制作のジャーニー — API 呼び出しの薄いラッパー。実装設計: impl/03-app-structure-impl.md §6
import api from "@/lib/api";
import type { JourneyResponse, MarkKind, MarkScopeType, JourneyStage } from "@gmo-onair/shared/src/production/journey";

interface Envelope<T> { success: boolean; data: T }

export async function getProjectJourney(projectId: string): Promise<JourneyResponse> {
  const res = await api.get<Envelope<JourneyResponse>>(`/techops/scopes/project/${projectId}/journey`);
  return res.data.data;
}

export async function getDocumentJourney(docId: string): Promise<JourneyResponse> {
  const res = await api.get<Envelope<JourneyResponse>>(`/techops/scopes/document/${docId}/journey`);
  return res.data.data;
}

/** 番組（マニュアル・案件管理外）単位のジャーニー。2026-08-22 追加 */
export async function getProgramJourney(programId: string): Promise<JourneyResponse> {
  const res = await api.get<Envelope<JourneyResponse>>(`/techops/scopes/program/${programId}/journey`);
  return res.data.data;
}

// `production_journey_marks` の生の行（サーバーは snake_case のまま返す）
export interface JourneyMarkRow {
  id: string;
  scope_type: MarkScopeType;
  scope_id: string;
  target_date: string | null;
  stage: JourneyStage;
  kind: MarkKind;
  hint_key: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  cleared_at: string | null;
  cleared_by: string | null;
}

export async function listJourneyMarks(scopeType: MarkScopeType, scopeId: string): Promise<JourneyMarkRow[]> {
  const res = await api.get<Envelope<JourneyMarkRow[]>>("/techops/journey/marks", {
    params: { scope_type: scopeType, scope_id: scopeId },
  });
  return res.data.data;
}

export interface CreateMarkPayload {
  scope_type: MarkScopeType;
  scope_id: string;
  target_date: string | null;
  stage: JourneyStage;
  kind: MarkKind;
  hint_key?: string | null;
  note?: string | null;
}

export async function createJourneyMark(payload: CreateMarkPayload): Promise<JourneyMarkRow | null> {
  const res = await api.post<Envelope<JourneyMarkRow | null>>("/techops/journey/marks", payload);
  return res.data.data;
}

export async function clearJourneyMark(id: string): Promise<void> {
  await api.delete(`/techops/journey/marks/${id}`);
}
