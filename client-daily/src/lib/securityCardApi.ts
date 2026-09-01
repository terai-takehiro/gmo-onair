import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localDateStr } from '@gmo-onair/shared/src/client/format';
import api from './api';

// スタジオ セキュリティカード管理 API の react-query フック集 + 型・定数

// エリア (解錠対象の部屋)。サーバー (security-card.service SECURITY_AREAS) と揃える。
// 実際の解錠可否は各カードの access JSONB を参照する。
export interface AreaDef { key: string; label: string; floor: string }
export const SECURITY_AREAS: AreaDef[] = [
  { key: 'office', label: '執務室', floor: '27F' },
  { key: 'cargo_ev', label: '通用口（貨物EV）', floor: '27F' },
  { key: 'private_ev', label: '通用口（占有EV）', floor: '27F' },
  { key: 'room_a', label: 'ROOM A', floor: '27F' },
  { key: 'room_b', label: 'ROOM B', floor: '27F' },
  { key: 'room_c', label: 'ROOM C', floor: '27F' },
  { key: 'meeting', label: 'MEETING ROOM', floor: '27F' },
  { key: 'vip', label: 'VIP LOUNGE', floor: '27F' },
  { key: 'tech_storage', label: '技術倉庫', floor: '27F' },
  { key: 'soc1', label: '第1SOC', floor: '26F' },
];

export type CardStatus = 'available' | 'lent';

export interface SecurityCard {
  id: string;
  studio: string;
  card_no: number;
  label: string | null;
  security_level: string;
  level_label: string;
  access: Record<string, boolean>;
  is_active: boolean;
  notes: string | null;
  status: CardStatus;
  overdue: boolean;
  // 貸出中のとき: 現在の貸出情報
  lending_id: string | null;
  borrower_company: string | null;
  borrower_person: string | null;
  borrower_contact: string | null;
  purpose: string | null;
  lent_on: string | null;
  due_on: string | null;
  lent_by_user_id: string | null;
  lent_by_name: string | null;
  created_at: string;
  updated_at: string;
  history?: Lending[];
}

export interface Lending {
  id: string;
  card_id: string;
  borrower_company: string | null;
  borrower_person: string;
  borrower_contact: string | null;
  purpose: string | null;
  lent_on: string;
  due_on: string | null;
  returned_on: string | null;
  lent_by_user_id: string | null;
  lent_by_name: string | null;
  returned_by_user_id: string | null;
  returned_by_name: string | null;
  notes: string | null;
  status: 'active' | 'returned';
  overdue?: boolean;
  card_no?: number;
  level_label?: string;
  security_level?: string;
  studio?: string;
  created_at: string;
  updated_at: string;
}

export interface CardStats {
  total: number;
  available: number;
  lent: number;
  overdue: number;
}

export interface OnairUser { id: string; name: string; email: string }

export interface LendInput {
  borrower_person: string;
  borrower_company?: string | null;
  borrower_contact?: string | null;
  purpose?: string | null;
  lent_on?: string | null;
  due_on?: string | null;
  lent_by_user_id?: string | null;
  lent_by_name?: string | null;
  notes?: string | null;
}

export interface ReturnInput {
  returned_on?: string | null;
  returned_by_user_id?: string | null;
  returned_by_name?: string | null;
  notes?: string | null;
}

const KEY = 'security-cards';

export function useSecurityCards(params: { studio?: string; status?: CardStatus } = {}) {
  return useQuery({
    queryKey: [KEY, 'list', params.studio ?? 'yoga', params.status ?? 'all'],
    queryFn: () =>
      api.get('/dailyops/security-cards', { params }).then((r) => r.data.data as SecurityCard[]),
    refetchOnMount: 'always',
  });
}

export function useSecurityCardStats(studio?: string) {
  return useQuery({
    queryKey: [KEY, 'stats', studio ?? 'yoga'],
    queryFn: () =>
      api.get('/dailyops/security-cards/stats', { params: studio ? { studio } : {} }).then((r) => r.data.data as CardStats),
    refetchOnMount: 'always',
  });
}

export function useCardLendings(params: { card_id?: string; status?: 'active' | 'returned' } = {}, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'lendings', params.card_id ?? 'all', params.status ?? 'all'],
    queryFn: () =>
      api.get('/dailyops/security-cards/lendings', { params }).then((r) => r.data.data as Lending[]),
    enabled,
    refetchOnMount: 'always',
  });
}

export function useOnairUsers() {
  return useQuery({
    queryKey: ['onair-users'],
    queryFn: () => api.get('/users', { params: { limit: 200 } }).then((r) => r.data.data as OnairUser[]),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [KEY] });
  };
}

export function useLendCard() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LendInput }) =>
      api.post(`/dailyops/security-cards/${id}/lend`, input).then((r) => r.data.data as SecurityCard),
    onSuccess: invalidate,
  });
}

export function useReturnCard() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReturnInput }) =>
      api.post(`/dailyops/security-cards/${id}/return`, input).then((r) => r.data.data as SecurityCard),
    onSuccess: invalidate,
  });
}

export function useUpdateCard() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: { label?: string | null; notes?: string | null; is_active?: boolean } }) =>
      api.put(`/dailyops/security-cards/${id}`, fields).then((r) => r.data.data as SecurityCard),
    onSuccess: invalidate,
  });
}

/** 今日の YYYY-MM-DD (UTC の toISOString だと JST の 0〜9 時に前日になる) */
export function todayStr(): string {
  return localDateStr(new Date());
}

/** 'YYYY-MM-DD' → 'M/D' */
export function fmtMd(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
