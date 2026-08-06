import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { FinanceDoc, FinanceDocStatus, FinanceDocType, MiscInquiry, Importance } from './types';

// 見積/請求書 + その他問い合わせ API の react-query フック集

// ── 見積/請求書 ──────────────────────────────
export interface FinanceDocInput {
  doc_type?: FinanceDocType;
  sender?: string | null;
  subject?: string | null;
  content?: string | null;
  amount?: number | null;
  closing_month?: string | null;
  payment_due?: string | null;
  status?: FinanceDocStatus;
  received_at?: string | null;
  processed_by?: string | null;
  gls_number?: string | null;
  notes?: string | null;
}

export function useFinanceDocs(params: { status?: FinanceDocStatus; doc_type?: FinanceDocType } = {}) {
  return useQuery({
    queryKey: ['finance-docs', params.status ?? 'all', params.doc_type ?? 'all'],
    queryFn: () => api.get('/dailyops/finance-docs', { params }).then((r) => r.data.data as FinanceDoc[]),
    refetchOnMount: 'always',
  });
}

function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['finance-docs'] }); qc.invalidateQueries({ queryKey: ['dailyops-alerts'] }); };
}

export function useCreateFinanceDoc() {
  const inv = useInvalidateFinance();
  return useMutation({ mutationFn: (i: FinanceDocInput) => api.post('/dailyops/finance-docs', i).then((r) => r.data.data as FinanceDoc), onSuccess: inv });
}
export function useUpdateFinanceDoc() {
  const inv = useInvalidateFinance();
  return useMutation({ mutationFn: ({ id, fields }: { id: string; fields: FinanceDocInput }) => api.put(`/dailyops/finance-docs/${id}`, fields).then((r) => r.data.data as FinanceDoc), onSuccess: inv });
}
export function useDeleteFinanceDoc() {
  const inv = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => api.delete(`/dailyops/finance-docs/${id}`), onSuccess: inv });
}

// ── その他問い合わせ ──────────────────────────────
export interface InquiryInput {
  sender?: string | null;
  subject?: string | null;
  summary?: string;
  category?: string | null;
  importance?: Importance;
  action_needed?: string | null;
  url?: string | null;
  received_at?: string | null;
  notes?: string | null;
}

export function useInquiries(params: { importance?: Importance; unhandled?: boolean } = {}) {
  return useQuery({
    queryKey: ['inquiries', params.importance ?? 'all', params.unhandled ? 'unhandled' : 'all'],
    queryFn: () => api.get('/dailyops/inquiries', { params: params.unhandled ? { ...params, unhandled: 1 } : params }).then((r) => r.data.data as MiscInquiry[]),
    refetchOnMount: 'always',
  });
}

function useInvalidateInq() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['inquiries'] }); qc.invalidateQueries({ queryKey: ['dailyops-alerts'] }); };
}

export function useCreateInquiry() {
  const inv = useInvalidateInq();
  return useMutation({ mutationFn: (i: InquiryInput) => api.post('/dailyops/inquiries', i).then((r) => r.data.data as MiscInquiry), onSuccess: inv });
}
export function useUpdateInquiry() {
  const inv = useInvalidateInq();
  return useMutation({ mutationFn: ({ id, fields }: { id: string; fields: InquiryInput }) => api.put(`/dailyops/inquiries/${id}`, fields).then((r) => r.data.data as MiscInquiry), onSuccess: inv });
}
export function useHandleInquiry() {
  const inv = useInvalidateInq();
  return useMutation({ mutationFn: ({ id, handled }: { id: string; handled: boolean }) => api.post(`/dailyops/inquiries/${id}/handle`, { handled }).then((r) => r.data.data as MiscInquiry), onSuccess: inv });
}
export function useDeleteInquiry() {
  const inv = useInvalidateInq();
  return useMutation({ mutationFn: (id: string) => api.delete(`/dailyops/inquiries/${id}`), onSuccess: inv });
}

// ── ホームの件数 ──────────────────────────────
/**
 * 未処理の書類 と 未対応の情報 の件数。
 *
 * **サーバーが数えたものを使う** (`GET /dailyops/alerts`)。ホームは以前
 * 書類と問い合わせの**一覧を丸ごと取り寄せてから画面で数えて**いたので、
 * ・件数を出すためだけに数百件を運んでいた
 * ・「未処理」の定義が画面とサーバーの2か所にあり、片方だけ変えると食い違う
 * という2つの問題があった。数えるのは1か所にする。
 *
 * 書類・問い合わせを変えると `dailyops-alerts` は無効化される
 * (上の `useInvalidateFinance` / `useInvalidateInq` を参照)。
 */
export interface DailyopsAlerts {
  pendingFinanceDocs: number;
  unhandledInquiries: number;
}

export function useDailyopsAlerts() {
  return useQuery({
    queryKey: ['dailyops-alerts'],
    queryFn: () => api.get('/dailyops/alerts').then((r) => r.data.data as DailyopsAlerts),
    refetchOnMount: 'always',
  });
}
