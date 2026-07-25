// 待たせている行列 (§4.2 / §4.4)
//
// ・並びは古い順 (received_at 昇順) = 最も待たせているものが先頭。優先度の色で並べ替えない
// ・行をクリックで開き、開いた場所で終端 (完了 / 確認済み / 承認・処理完了・却下 / 対応済み) に到達する
// ・0件のときは祝わない。§4.5 の 6b に従い「空いた時間でやるなら」を出すのは呼び出し側 (TodayPage)
//
// 旧「受信箱」ページ (/sales/inbox) はこの行列に統合した。

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, FileWarning, MessageSquare,
  Receipt, RefreshCw, Sparkles, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import { cn } from "@/lib/utils";
import { Delayed, ErrorPanel, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import {
  DOC_TYPE_LABELS, FD_STATUS_LABELS, KIND_BADGE_CLASS, KIND_CTA, KIND_LABELS,
  elapsedHours, formatElapsed, str, yen,
  type InboxData, type InboxItem, type InboxKind,
} from "./types";
import { OverdueDetail } from "./OverdueDetail";
import { FinanceDocDetail } from "./FinanceDocDetail";
import { InquiryDetail } from "./InquiryDetail";

/** 経過時間チップ。4時間で色が変わり、24時間で赤 */
export function ElapsedChip({ receivedAt, forceRed }: { receivedAt: string | null; forceRed?: boolean }) {
  const h = elapsedHours(receivedAt);
  const cls =
    forceRed || (h !== null && h >= 24)
      ? "bg-destructive-surface text-destructive"
      : h !== null && h >= 4
        ? "bg-warning-surface text-warning-strong"
        : "bg-secondary text-secondary-foreground";
  return (
    <span
      className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums", cls)}
      title={receivedAt ? `受信: ${str(receivedAt).slice(0, 16).replace("T", " ")}` : undefined}
    >
      {formatElapsed(h)} お待たせ
    </span>
  );
}

const KIND_ICON: Record<InboxKind, typeof AlertTriangle> = {
  overdue_action: AlertTriangle,
  ai_project: Sparkles,
  inquiry: MessageSquare,
  finance_doc: Receipt,
};

/** 1行の要約 (閉じているときに見える部分) */
function RowSummary({ item }: { item: InboxItem }) {
  const m = item.meta;
  switch (item.kind) {
    case "overdue_action":
      return (
        <>
          <span className="min-w-0 flex-1 truncate font-bold text-foreground">{str(m.next_action)}</span>
          <span className="hidden min-w-0 max-w-[240px] truncate text-[13px] text-secondary-foreground sm:inline">
            {str(m.project_name)}
            {m.customer_name ? ` ／ ${str(m.customer_name)}` : ""}
          </span>
          <span className="shrink-0 rounded bg-destructive-surface px-1.5 py-0.5 text-[11px] font-bold text-destructive">
            {str(m.days_overdue)}日超過
          </span>
        </>
      );
    case "ai_project":
      return (
        <>
          <span className="min-w-0 flex-1 truncate font-bold text-foreground">{str(m.name)}</span>
          <span className="hidden min-w-0 max-w-[220px] truncate text-[13px] text-secondary-foreground sm:inline">
            {str(m.customer_name)}
          </span>
          {m.ai_requested_by ? (
            <span className="hidden shrink-0 text-[12px] text-ai sm:inline">指示: {str(m.ai_requested_by)}</span>
          ) : null}
        </>
      );
    case "inquiry":
      return (
        <>
          <span className="min-w-0 flex-1 truncate font-bold text-foreground">
            {str(m.subject) || "(件名なし)"}
          </span>
          <span className="hidden min-w-0 max-w-[220px] truncate text-[13px] text-secondary-foreground sm:inline">
            {str(m.sender)}
          </span>
          {m.importance === "high" && (
            <span className="shrink-0 rounded bg-destructive-surface px-1.5 py-0.5 text-[11px] font-bold text-destructive">
              重要
            </span>
          )}
        </>
      );
    case "finance_doc":
      return (
        <>
          <span className="shrink-0 font-bold text-foreground">
            {DOC_TYPE_LABELS[str(m.doc_type)] ?? str(m.doc_type)}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">{str(m.subject)}</span>
          <span className="shrink-0 tabular-nums text-[13px] font-bold text-foreground">{yen(m.amount)}</span>
          <span className="hidden shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-bold text-secondary-foreground sm:inline">
            {FD_STATUS_LABELS[str(m.status)] ?? str(m.status)}
          </span>
        </>
      );
  }
}

export interface TodayQueueProps {
  /** 0件のときに出す内容 (§4.5 6b「空いた時間でやるなら」) */
  emptySlot?: React.ReactNode;
}

export function TodayQueue({ emptySlot }: TodayQueueProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<InboxData>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get("/dashboard/inbox")).data.data,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: 60_000, // 経過タイマーを1分ごとに更新
    placeholderData: (prev) => prev, // 再取得中に前の内容を消さない
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.inbox() });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.salesBoard() });
  };

  const actionMutation = useMutation({
    mutationFn: async (p: { id: string; action: "complete" | "postpone"; date?: string }) =>
      p.action === "complete"
        ? api.post(`/activity-logs/${p.id}/complete-next-action`)
        : api.post(`/activity-logs/${p.id}/postpone-next-action`, { date: p.date }),
    onSuccess: () => { setOpenKey(null); invalidate(); },
  });

  const reviewMutation = useMutation({
    mutationFn: async (projectId: string) => api.post(`/projects/${projectId}/ai-review`),
    onSuccess: () => { setOpenKey(null); invalidate(); },
  });

  const bulkReviewMutation = useMutation({
    mutationFn: async (ids: string[]) => api.post("/projects/ai-review-bulk", { ids }),
    onSuccess: invalidate,
  });

  const handleMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/dailyops/inquiries/${id}/handle`),
    onSuccess: () => { setOpenKey(null); invalidate(); },
  });

  // 営業でない (除外): 対応の要否を外してから対応済みにする。件名・分類は残す
  const excludeMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/dailyops/inquiries/${id}`, { action_needed: false });
      return api.post(`/dailyops/inquiries/${id}/handle`);
    },
    onSuccess: () => { setOpenKey(null); invalidate(); },
  });

  const financeMutation = useMutation({
    mutationFn: async (p: { id: string; status: string }) =>
      api.put(`/dailyops/finance-docs/${p.id}`, { status: p.status }),
    onSuccess: () => { setOpenKey(null); invalidate(); },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const checklist = data?.checklist ?? [];
  const editable = !!data?.dailyops.editable;
  const aiIds = items.filter((i) => i.kind === "ai_project").map((i) => str(i.meta.id));

  if (error && !data) {
    return (
      <ErrorPanel
        title="待たせているものを読み込めませんでした"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading && !data) {
    return (
      <Delayed>
        <SkeletonRows rows={4} />
      </Delayed>
    );
  }

  return (
    <section aria-label="待たせている行列" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold text-foreground">
          待たせている行列
          {items.length > 0 && (
            <span className="ml-1.5 rounded bg-destructive-surface px-1.5 py-0.5 text-[12px] tabular-nums text-destructive">
              {items.length}件
            </span>
          )}
        </h2>
        <p className="hidden text-[12px] text-muted-foreground sm:block">
          古い順。行を開くとその場で終わらせられます
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {aiIds.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1 border-ai-border text-ai"
              disabled={bulkReviewMutation.isPending}
              onClick={() => {
                if (confirm(`${aiIds.length} 件を確認済みにします。内容は見ましたか？`)) {
                  bulkReviewMutation.mutate(aiIds);
                }
              }}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              AI作成 {aiIds.length}件をまとめて確認
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="最新にする"
            title="最新にする"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-success/25 bg-success-surface px-4 py-3">
          <p className="text-[15px] font-bold text-foreground">
            お客様を待たせているものはありません。
          </p>
          {emptySlot}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const m = item.meta;
            const isOpen = openKey === item.key;
            const Icon = KIND_ICON[item.kind];
            return (
              <li
                key={item.key}
                className={cn(
                  "rounded-lg border bg-card px-3 py-2.5 transition-colors",
                  isOpen ? "border-primary/40 shadow-sm" : "border-border"
                )}
              >
                {/* 行 (クリックで開閉) */}
                <button
                  type="button"
                  onClick={() => setOpenKey(isOpen ? null : item.key)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left"
                >
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold",
                      KIND_BADGE_CLASS[item.kind]
                    )}
                  >
                    <Icon className="h-3 w-3" aria-hidden="true" />
                    {KIND_LABELS[item.kind]}
                  </span>
                  <ElapsedChip receivedAt={item.received_at} forceRed={item.kind === "overdue_action"} />
                  <RowSummary item={item} />
                  {/* 次の一手を行の右端に置く。開くと「閉じる」に変わる (行全体が1つのボタンなので span) */}
                  {isOpen ? (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-control border border-border px-2.5 py-1 text-[12px] font-bold text-secondary-foreground">
                      閉じる
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-control bg-primary px-2.5 py-1 text-[12px] font-bold text-primary-foreground">
                      {KIND_CTA[item.kind]}
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  )}
                </button>

                {/* 展開 — 種別ごとの中身と終端アクション */}
                {isOpen && (
                  <div className="mt-2.5">
                    {item.kind === "overdue_action" && (
                      <OverdueDetail
                        meta={m}
                        pending={actionMutation.isPending}
                        onComplete={() => actionMutation.mutate({ id: str(m.activity_id), action: "complete" })}
                        onPostpone={(date) => actionMutation.mutate({ id: str(m.activity_id), action: "postpone", date })}
                      />
                    )}

                    {item.kind === "ai_project" && (
                      <div className="space-y-3 border-t border-divider pt-3">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-4">
                          <div>
                            <dt className="text-[12px] text-muted-foreground">お客様</dt>
                            <dd className="font-bold text-foreground">{str(m.customer_name) || "未設定"}</dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-muted-foreground">想定金額</dt>
                            <dd className="font-bold tabular-nums text-foreground">{yen(m.expected_amount)}</dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-muted-foreground">担当</dt>
                            <dd className="font-bold text-foreground">{str(m.assigned_to_name) || "未設定"}</dd>
                          </div>
                          <div>
                            <dt className="text-[12px] text-muted-foreground">指示した人</dt>
                            <dd className="font-bold text-foreground">{str(m.ai_requested_by) || "—"}</dd>
                          </div>
                        </dl>
                        <p className="rounded-control border border-ai-border bg-ai-surface px-3 py-2 text-[13px] text-foreground">
                          AI がメールから作った案件です。内容が合っているか見てください。
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            className="h-9"
                            disabled={reviewMutation.isPending}
                            onClick={() => reviewMutation.mutate(str(m.id))}
                          >
                            確認した
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            onClick={() => navigate(`/sales/projects/${str(m.id)}`)}
                          >
                            案件を開いて直す
                          </Button>
                          {reviewMutation.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="処理中" />
                          )}
                        </div>
                      </div>
                    )}

                    {item.kind === "inquiry" && (
                      <InquiryDetail
                        meta={m}
                        editable={editable}
                        pending={handleMutation.isPending || excludeMutation.isPending}
                        onHandled={() => handleMutation.mutate(str(m.id))}
                        onExclude={() => excludeMutation.mutate(str(m.id))}
                      />
                    )}

                    {item.kind === "finance_doc" && (
                      <FinanceDocDetail
                        meta={m}
                        editable={editable}
                        pending={financeMutation.isPending}
                        onSetStatus={(status) => financeMutation.mutate({ id: str(m.id), status })}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 書類チェック (申込書未提出) — 経過時間の概念が薄いので行列とは分ける */}
      {checklist.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning-surface px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-warning-strong">
            <FileWarning className="h-4 w-4" aria-hidden="true" />
            申込書がまだ出ていない案件 {checklist.length}件
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {checklist.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  className="inline-flex max-w-[280px] items-center gap-1.5 rounded-control border border-border bg-card px-2.5 py-1.5 text-[12px] text-foreground hover:bg-secondary"
                  onClick={() => navigate(`/sales/projects/${str(c.meta.id)}`)}
                  title={`${str(c.meta.name)} — 案件を開いて書類管理から提出済みにできます`}
                >
                  <span className="shrink-0 font-bold">{str(c.meta.gls_number)}</span>
                  <span className="truncate">{str(c.meta.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
