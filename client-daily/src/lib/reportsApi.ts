import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './api';
import type { OpsReport, OpsReportDayGroup, OpsReportKind } from './types';

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

/**
 * 月表示 (デイリーニュース報告)。日ごとにまとめた行を1回で取る
 * (`GET /dailyops/reports/items-by-month`)。
 */
export function useReportItemsByMonth(kind: OpsReportKind, month: string) {
  return useQuery({
    queryKey: ['ops-report-items-by-month', kind, month],
    queryFn: () =>
      api.get('/dailyops/reports/items-by-month', { params: { kind, month } })
        .then((r) => r.data.data as OpsReportDayGroup[]),
    refetchOnMount: 'always',
  });
}

function useInvalidateReports() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['ops-reports'] });
    qc.invalidateQueries({ queryKey: ['ops-report'] });
    qc.invalidateQueries({ queryKey: ['ops-report-period'] });
    qc.invalidateQueries({ queryKey: ['ops-report-items-by-month'] });
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

/**
 * その週の集計を**いま引き直す**（`GET /dailyops/weekly-stats`）。
 *
 * 画面が出す数字は原則 `payload.stats`（確定時点のスナップショット）だが、
 * **AI下書きを一度も作っていない週にはスナップショットが無い**。以前はそこが
 * 「集計はまだありません」の空欄になり、総括を書こうとする人が材料を見られなかった。
 * 下書きのあいだだけこちらを使い、確定後はスナップショットに固定する。
 */
export function useWeeklyStats(week?: string, enabled = true) {
  return useQuery({
    queryKey: ['weekly-stats', week],
    queryFn: () => api.get('/dailyops/weekly-stats', { params: { week } }).then((r) => r.data.data),
    enabled: enabled && !!week,
  });
}

/**
 * 週の箱を削除する（論理削除）。確定済みはサーバーが 400 で断る
 * （メッセージに「確定を解いてください」と出るので、そのまま `notifyApiError` に渡せばよい）。
 */
export function useDeleteReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (reportId: string) => api.delete(`/dailyops/reports/${reportId}`),
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

/**
 * レポート本体（題名・本文）を人が直す。ウィークリー活動報告の「AI の要約」を
 * 確定前に直せる唯一の入口（行の編集は `useUpdateItem`）。
 */
export function useUpdateReportContent() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: ({ reportId, fields }: { reportId: string; fields: { title?: string; body?: string } }) =>
      api.put(`/dailyops/reports/${reportId}`, fields).then((r) => r.data.data as OpsReport),
    onSuccess: invalidate,
  });
}

/**
 * AI にウィークリー活動報告の本文を書かせる（「AI下書きを作る」ボタン）。
 * 確定済みの週報・AI未設定環境はサーバーが 400 / 503 を返す。
 */
export function useDraftWeeklyReport() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: (reportId: string) =>
      api.post(`/dailyops/reports/${reportId}/draft-ai`).then((r) => r.data.data as OpsReport),
    onSuccess: invalidate,
  });
}
