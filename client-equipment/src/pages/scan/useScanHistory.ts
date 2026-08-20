/**
 * さっき読んだもの — 一覧の取得（PC・スマホ共通）
 *
 * **自分のぶんだけ**を出す（現場では「いま自分が読んだ機材」を確かめたいので、
 * 他の人のぶんが混ざると読めない）。見た目（Row か カード か）は
 * `ScanHistoryRows.tsx` / `ScanHistoryCards.tsx` に分けてあるが、
 * データの取り方は1本にしておく（写すと片方だけ `mine` の絞り込みを忘れる）。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface ScanRow {
  id: string;
  raw_code: string;
  equipment_id: string | null;
  equipment_name: string | null;
  unit_number: number | null;
  scanned_at: string;
}

export function useScanHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['equipment-scans'],
    queryFn: async () =>
      (await api.get('/equipment/scans', { params: { mine: 1, limit: 20 } })).data.data as ScanRow[],
    staleTime: 10_000,
  });
  return { rows: data ?? [], isLoading };
}

/** `2026-08-07T13:04:…` → `13:04`。同じ日に何度も読むので時刻だけでよい */
export function hm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
