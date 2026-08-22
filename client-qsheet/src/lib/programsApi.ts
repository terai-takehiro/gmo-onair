// 番組（マニュアル・案件管理外）— API 呼び出しの薄いラッパー。
// 制作技術支援トップの2つ目の選び方（2026-08-22）。`qsheet_programs` のCRUD。
import api from "@/lib/api";

interface Envelope<T> { success: boolean; data: T }

export interface ProgramRow {
  id: string;
  name: string;
  event_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  creator_name?: string | null;
}

export async function listPrograms(search?: string): Promise<ProgramRow[]> {
  const res = await api.get<Envelope<ProgramRow[]>>("/qsheet/programs", { params: search ? { search } : undefined });
  return res.data.data;
}

export async function getProgram(id: string): Promise<ProgramRow> {
  const res = await api.get<Envelope<ProgramRow>>(`/qsheet/programs/${id}`);
  return res.data.data;
}

export async function createProgram(input: { name: string; event_date?: string | null; notes?: string | null }): Promise<ProgramRow> {
  const res = await api.post<Envelope<ProgramRow>>("/qsheet/programs", input);
  return res.data.data;
}
