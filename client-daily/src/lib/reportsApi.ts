import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { OpsReport, OpsReportKind } from './types';

// dailyops API の react-query フック集

export function useReports(kind?: OpsReportKind, limit = 30) {
  return useQuery({
    queryKey: ['ops-reports', kind ?? 'all', limit],
    queryFn: () =>
      api.get('/dailyops/reports', { params: { kind, limit } })
        .then((r) => r.data.data as OpsReport[]),
    refetchOnMount: 'always',
  });
}

export function useReport(id?: string) {
  return useQuery({
    queryKey: ['ops-report', id],
    queryFn: () => api.get(`/dailyops/reports/${id}`).then((r) => r.data.data as OpsReport),
    enabled: !!id,
    refetchOnMount: 'always',
  });
}

export function useReportByPeriod(kind: OpsReportKind, periodKey: string) {
  return useQuery({
    queryKey: ['ops-report-period', kind, periodKey],
    queryFn: () =>
      api.get('/dailyops/reports/by-period', { params: { kind, period_key: periodKey } })
        .then((r) => r.data.data as OpsReport | null),
    refetchOnMount: 'always',
  });
}

function useInvalidateReports() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['ops-reports'] });
    qc.invalidateQueries({ queryKey: ['ops-report'] });
    qc.invalidateQueries({ queryKey: ['ops-report-period'] });
  };
}

export function useEnsureReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (input: { kind: OpsReportKind; period_key: string }) =>
      api.post('/dailyops/reports/ensure', input).then((r) => r.data.data as OpsReport),
    onSuccess: invalidate,
  });
}

export interface ItemInput {
  category?: string | null;
  content?: string;
  note?: string | null;
  url?: string | null;
  ai_related?: boolean | null;
  pick?: number | null;
}

export function useAddItem() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ reportId, item }: { reportId: string; item: ItemInput }) =>
      api.post(`/dailyops/reports/${reportId}/items`, item).then((r) => r.data.data as OpsReport),
    onSuccess: invalidate,
  });
}

export function useUpdateItem() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ itemId, fields }: { itemId: string; fields: ItemInput }) =>
      api.put(`/dailyops/items/${itemId}`, fields).then((r) => r.data.data),
    onSuccess: invalidate,
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (itemId: string) => api.delete(`/dailyops/items/${itemId}`),
    onSuccess: invalidate,
  });
}

/**
 * デイリーニュースの行を**その日が属する週の週報へ写す** (migration 167)。
 *
 * 週は**ニュースの日付**で決まります（押した日ではありません）。金曜のニュースを
 * 月曜に送っても先週の週報に入ります。2回押しても増えません。
 */
export function useSendToWeekly() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/dailyops/items/${itemId}/to-weekly`)
        .then((r) => r.data.data as { already: boolean; weekStart: string }),
    onSuccess: invalidate,
  });
}

export function usePublishReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (reportId: string) =>
      api.post(`/dailyops/reports/${reportId}/publish`).then((r) => r.data.data as OpsReport),
    onSuccess: invalidate,
  });
}

/**
 * 確定を解く。**確定した週報は直せない**ので、直したいときはここを通る
 * （サーバーも同じ条件で断る。画面の出し分けだけに頼らない）。
 */
export function useReopenReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (reportId: string) =>
      api.post(`/dailyops/reports/${reportId}/reopen`).then((r) => r.data.data as OpsReport),
    onSuccess: invalidate,
  });
}

export function useReviewReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (reportId: string) =>
      api.post(`/dailyops/reports/${reportId}/review`).then((r) => r.data.data as OpsReport),
    onSuccess: invalidate,
  });
}
