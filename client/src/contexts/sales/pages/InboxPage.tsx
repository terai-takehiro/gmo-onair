// 受信箱 (v2.9.217+) — 営業ジャーニー刷新フェーズA
// 「お客様を待たせているもの」(期限超過アクション / AI作成の未確認案件 / 問い合わせ / 見積・請求)
// を1本のキューに集約し、全件が必ず終端状態 (完了/確認済み/対応済み/処理済み) に到達させる。
// 古いものが先頭。各行に受信からの経過タイマー (4h でアンバー / 24h で赤)。
// 0件のときは「お客様を待たせているものはありません」を大きく表示 (Inbox Zero)。
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import api from "@/lib/api";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import { cn } from "@/lib/utils";
import {
  Inbox,
  AlertTriangle,
  Sparkles,
  MessageSquare,
  Receipt,
  FileWarning,
  Check,
  ExternalLink,
  PartyPopper,
  RefreshCw,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ── 型 (GET /dashboard/inbox のレスポンス) ──────────────────────────
export type InboxKind = "overdue_action" | "ai_project" | "inquiry" | "finance_doc";

export interface InboxItem {
  key: string;
  kind: InboxKind;
  received_at: string | null;
  meta: Record<string, unknown>;
}

export interface InboxData {
  items: InboxItem[];
  checklist: { key: string; kind: "agreement"; meta: Record<string, unknown> }[];
  counts: {
    total: number;
    overdue_action: number;
    ai_project: number;
    inquiry: number;
    finance_doc: number;
    agreement: number;
  };
  dailyops: { visible: boolean; editable: boolean };
}

export const KIND_LABELS: Record<InboxKind, string> = {
  overdue_action: "期限超過",
  ai_project: "AI作成",
  inquiry: "問い合わせ",
  finance_doc: "見積・請求",
};

export const KIND_BADGE_CLASS: Record<InboxKind, string> = {
  overdue_action: "bg-red-100 text-red-700 border-red-200",
  ai_project: "bg-violet-100 text-violet-700 border-violet-200",
  inquiry: "bg-sky-100 text-sky-700 border-sky-200",
  finance_doc: "bg-amber-100 text-amber-700 border-amber-200",
};

const DOC_TYPE_LABELS: Record<string, string> = { quote: "見積書", invoice: "請求書", order: "注文書" };
const FD_STATUS_LABELS: Record<string, string> = { new: "受信", reviewing: "確認中", approved: "承認" };

// ── 経過時間 (受信からの待ち時間) ────────────────────────────────
export function elapsedHours(receivedAt: string | null): number | null {
  if (!receivedAt) return null;
  const t = new Date(receivedAt).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

export function formatElapsed(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}分`;
  if (hours < 24) return `${Math.round(hours)}時間`;
  return `${Math.floor(hours / 24)}日`;
}

// 経過時間チップ。4h 未満=グレー / 4h 以上=アンバー / 24h 以上=赤 (SLA の目安)
export function ElapsedChip({ receivedAt, forceRed }: { receivedAt: string | null; forceRed?: boolean }) {
  const h = elapsedHours(receivedAt);
  const cls =
    forceRed || (h !== null && h >= 24)
      ? "bg-red-100 text-red-700"
      : h !== null && h >= 4
        ? "bg-amber-100 text-amber-700"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", cls)}
      title={receivedAt ? `受信: ${String(receivedAt).slice(0, 16).replace("T", " ")}` : undefined}
    >
      {formatElapsed(h)}
    </span>
  );
}

export default function InboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<InboxKind | "all">("all");
  const [postponeFor, setPostponeFor] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<InboxData>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get("/dashboard/inbox")).data.data,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: 60_000, // 経過タイマーを 1 分粒度で更新
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.inbox() });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.aiInbox() });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.overdueActions() });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.salesBoard() });
  };

  // 次回アクション 完了/延期 (期限超過)
  const actionMutation = useMutation({
    mutationFn: async (p: { id: string; action: "complete" | "postpone"; date?: string }) =>
      p.action === "complete"
        ? api.post(`/activity-logs/${p.id}/complete-next-action`)
        : api.post(`/activity-logs/${p.id}/postpone-next-action`, { date: p.date }),
    onSuccess: () => { setPostponeFor(null); invalidate(); },
  });

  // AI 起票の確認 (単体 / まとめて)
  const reviewMutation = useMutation({
    mutationFn: async (projectId: string) => api.post(`/projects/${projectId}/ai-review`),
    onSuccess: invalidate,
  });
  const bulkReviewMutation = useMutation({
    mutationFn: async (ids: string[]) => api.post("/projects/ai-review-bulk", { ids }),
    onSuccess: invalidate,
  });

  // 問い合わせ 対応済み (dailyops editor のみ)
  const handleMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/dailyops/inquiries/${id}/handle`),
    onSuccess: invalidate,
  });

  const dateAfter = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const checklist = data?.checklist ?? [];
  const counts = data?.counts;
  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter]
  );
  const oldest = items[0] ? elapsedHours(items[0].received_at) : null;
  const aiIds = items.filter((i) => i.kind === "ai_project").map((i) => String(i.meta.id));

  const chips: { key: InboxKind | "all"; label: string; count: number }[] = [
    { key: "all", label: "すべて", count: counts?.total ?? 0 },
    { key: "overdue_action", label: KIND_LABELS.overdue_action, count: counts?.overdue_action ?? 0 },
    { key: "ai_project", label: KIND_LABELS.ai_project, count: counts?.ai_project ?? 0 },
    { key: "inquiry", label: KIND_LABELS.inquiry, count: counts?.inquiry ?? 0 },
    { key: "finance_doc", label: KIND_LABELS.finance_doc, count: counts?.finance_doc ?? 0 },
  ];

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground">受信箱</h1>
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">
            お客様を待たせているものを1箇所に。全部ゼロにしましょう。
          </p>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden="true" />
            更新
          </Button>
        </div>

        {/* サマリー行: 未対応件数 + 最古の待ち時間 */}
        {!isLoading && items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <span className="font-semibold text-amber-800">未対応 {items.length}件</span>
            <span className="text-amber-700">
              最古のお待たせ: <strong className="tabular-nums">{formatElapsed(oldest)}</strong>
            </span>
          </div>
        )}

        {/* フィルタチップ */}
        <div className="flex flex-wrap gap-1.5">
          {chips
            .filter((c) => c.key === "all" || c.count > 0)
            .map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-[32px]",
                  filter === c.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                )}
              >
                {c.label} <span className="tabular-nums">{c.count}</span>
              </button>
            ))}
          {/* AI 起票のまとめて確認 */}
          {aiIds.length > 1 && (filter === "all" || filter === "ai_project") && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-8 gap-1 border-violet-300 text-xs text-violet-700"
              disabled={bulkReviewMutation.isPending}
              onClick={() => {
                if (confirm(`${aiIds.length} 件を確認済みにします。内容は見ましたか？`)) {
                  bulkReviewMutation.mutate(aiIds);
                }
              }}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              まとめて確認 ({aiIds.length})
            </Button>
          )}
        </div>

        {/* 本体キュー */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-6 py-14 text-center">
            <PartyPopper className="h-10 w-10 text-emerald-500" aria-hidden="true" />
            <p className="text-lg font-bold text-emerald-800">お客様を待たせているものはありません</p>
            <p className="text-sm text-emerald-700">受信箱は空です。この状態をキープしましょう。</p>
          </div>
        ) : shown.length === 0 ? (
          <EmptyState title="この種別の未対応はありません" />
        ) : (
          <ul className="space-y-2">
            {shown.map((item) => {
              const m = item.meta;
              return (
                <li key={item.key} className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold",
                        KIND_BADGE_CLASS[item.kind]
                      )}
                    >
                      {KIND_LABELS[item.kind]}
                    </span>
                    <ElapsedChip receivedAt={item.received_at} forceRed={item.kind === "overdue_action"} />

                    {/* ── 種別ごとの本文 + アクション ── */}
                    {item.kind === "overdue_action" && (
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <button
                            className="font-medium text-primary hover:underline"
                            onClick={() => navigate(`/sales/projects/${m.project_id}`)}
                          >
                            {String(m.gls_number || m.project_code || m.project_name)}
                          </button>
                          <span className="truncate text-muted-foreground">{String(m.project_name)}</span>
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                            {String(m.days_overdue)}日超過
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            → {String(m.next_action)}（期限 {String(m.next_action_date)}）
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                              disabled={actionMutation.isPending}
                              onClick={() => actionMutation.mutate({ id: String(m.activity_id), action: "complete" })}
                            >
                              完了
                            </Button>
                            {postponeFor === item.key ? (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[11px]" onClick={() => actionMutation.mutate({ id: String(m.activity_id), action: "postpone", date: dateAfter(1) })}>明日</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[11px]" onClick={() => actionMutation.mutate({ id: String(m.activity_id), action: "postpone", date: dateAfter(7) })}>1週間</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[11px]" onClick={() => setPostponeFor(null)}>×</Button>
                              </>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setPostponeFor(item.key)}>延期</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {item.kind === "ai_project" && (
                      <div className="min-w-[200px] flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden="true" />
                          <button
                            className="min-w-0 truncate font-medium text-primary hover:underline"
                            onClick={() => navigate(`/sales/projects/${m.id}`)}
                          >
                            {String(m.name)}
                          </button>
                        </div>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          {m.customer_name ? <span className="truncate">{String(m.customer_name)}</span> : null}
                          {m.ai_requested_by ? <span className="text-violet-600">指示: {String(m.ai_requested_by)}</span> : null}
                          {m.assigned_to_name ? <span>担当: {String(m.assigned_to_name)}</span> : null}
                        </p>
                      </div>
                    )}
                    {item.kind === "ai_project" && (
                      <Button
                        size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-xs"
                        disabled={reviewMutation.isPending}
                        onClick={() => reviewMutation.mutate(String(m.id))}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        確認済み
                      </Button>
                    )}

                    {item.kind === "inquiry" && (
                      <div className="min-w-[200px] flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden="true" />
                          <span className="min-w-0 truncate font-medium text-foreground">{String(m.subject || "(件名なし)")}</span>
                          {m.importance === "high" && (
                            <Badge variant="destructive" className="text-[10px]">重要</Badge>
                          )}
                          {m.category ? <Badge variant="outline" className="text-[10px]">{String(m.category)}</Badge> : null}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {m.sender ? <span className="mr-2 font-medium">{String(m.sender)}</span> : null}
                          {String(m.summary || "")}
                        </p>
                      </div>
                    )}
                    {item.kind === "inquiry" && (
                      <div className="flex shrink-0 items-center gap-1">
                        {data?.dailyops.editable && (
                          <Button
                            size="sm" variant="outline" className="h-8 gap-1 text-xs"
                            disabled={handleMutation.isPending}
                            onClick={() => handleMutation.mutate(String(m.id))}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            対応済み
                          </Button>
                        )}
                        <a
                          href="/daily/inquiries"
                          className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent"
                          title="日常業務アプリで開く"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          詳細
                        </a>
                      </div>
                    )}

                    {item.kind === "finance_doc" && (
                      <div className="min-w-[200px] flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <Receipt className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                          <span className="font-medium text-foreground">
                            {DOC_TYPE_LABELS[String(m.doc_type)] ?? String(m.doc_type)}
                          </span>
                          <span className="min-w-0 truncate text-muted-foreground">{String(m.subject || "")}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {FD_STATUS_LABELS[String(m.status)] ?? String(m.status)}
                          </Badge>
                        </div>
                        <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                          {m.sender ? <span>{String(m.sender)}</span> : null}
                          {m.amount != null ? <span className="tabular-nums">¥{Number(m.amount).toLocaleString()}</span> : null}
                          {m.payment_due ? <span>支払期日 {String(m.payment_due)}</span> : null}
                        </p>
                      </div>
                    )}
                    {item.kind === "finance_doc" && (
                      <a
                        href="/daily/finance"
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-accent"
                        title="日常業務アプリで処理する"
                      >
                        処理へ <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* チェックリスト (申込書未提出) — 経過時間の概念が薄いため別枠 */}
        {!isLoading && checklist.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <FileWarning className="h-4 w-4" aria-hidden="true" />
              書類チェック — 申込書未提出 {checklist.length}件
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {checklist.map((c) => (
                <li key={c.key}>
                  <button
                    type="button"
                    className="inline-flex max-w-[280px] items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
                    onClick={() => navigate(`/sales/projects/${c.meta.id}`)}
                    title={`${String(c.meta.name)} — 案件を開いて書類管理から提出済みにできます`}
                  >
                    <span className="shrink-0 font-medium">{String(c.meta.gls_number || "")}</span>
                    <span className="truncate">{String(c.meta.name)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
