import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { FinanceDoc, FinanceDocStatus, FinanceDocType, MiscInquiry, Importance } from './types';

/**
 * 一覧のキャッシュキー (v3.1.0)。
 *
 * v3.0.11 まで、読む側は `['finance-docs', …]`、`FinanceDocsPage` の
 * 書き込み後は `['dailyops', 'finance-docs']` を無効化していた。**前方一致しないので
 * 一覧が更新されず**、PDF を上げても画面に出てこない。出てこないので
 * もう一度上げる人がいて、それが二重登録の元になっていた。
 * キーは1か所に置いて、読む側と無効化する側が同じものを使う。
 *
 * また `['dailyops-alerts']` を無効化していたが、**そのキーで取得している画面は無い**
 * (読む側が居ない無効化) ので外した。
 */
export const FINANCE_DOCS_KEY = ['finance-docs'] as const;
export const INQUIRIES_KEY = ['inquiries'] as const;


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
    queryKey: [...FINANCE_DOCS_KEY, params.status ?? 'all', params.doc_type ?? 'all'],
    queryFn: () => api.get('/dailyops/finance-docs', { params }).then((r) => r.data.data as FinanceDoc[]),
    refetchOnMount: 'always',
  });
}

function useInvalidateFinance() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: FINANCE_DOCS_KEY }); };
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
    queryKey: [...INQUIRIES_KEY, params.importance ?? 'all', params.unhandled ? 'unhandled' : 'all'],
    queryFn: () => api.get('/dailyops/inquiries', { params: params.unhandled ? { ...params, unhandled: 1 } : params }).then((r) => r.data.data as MiscInquiry[]),
    refetchOnMount: 'always',
  });
}

function useInvalidateInq() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: INQUIRIES_KEY }); };
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
