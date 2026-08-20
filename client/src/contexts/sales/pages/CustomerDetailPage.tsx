// 顧客360 (v2.9.218+) — 営業ジャーニー刷新フェーズB
// お客様単位で全接点を1画面に集約。「この会社と今どうなっているか」を3秒で把握し、
// 次に会う前に文脈を復元できる。上から: 取引実績サマリー → 統合タイムライン
// (この場でインライン追記可能・D3解消) → 案件リスト → 年次売上。
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { ProjectStageLabels, ProjectStageColors, type ProjectStage } from "@/types";
import {
  ArrowLeft, Building2, Mail, Phone, MapPin, User, Sparkles, History,
  Plus, Loader2, CalendarClock, TrendingUp, FolderKanban, Clock, Check,
  Phone as PhoneIcon, Users, FileText, MessageSquare,
} from "lucide-react";

// ── 型 ────────────────────────────────────────────────────
interface CustomerOverview {
  customer: Record<string, unknown>;
  summary: {
    confirmed_revenue: number;
    project_total: number;
    project_active: number;
    last_contact_date: string | null;
    open_actions: number;
  };
  projects: Array<Record<string, unknown>>;
  timeline: Array<Record<string, unknown>>;
  sales_by_year: Array<{ year: string; total: number }>;
}

const ACT_META: Record<string, { label: string; icon: React.ElementType }> = {
  call: { label: "電話", icon: PhoneIcon },
  email: { label: "メール", icon: Mail },
  meeting: { label: "打合せ", icon: Users },
  visit: { label: "訪問", icon: Users },
  proposal: { label: "提案", icon: FileText },
  demo: { label: "デモ", icon: MessageSquare },
  followup: { label: "フォロー", icon: MessageSquare },
  follow_up: { label: "フォロー", icon: MessageSquare },
  other: { label: "その他", icon: MessageSquare },
};

const ACTIVITY_TYPES = [
  { value: "call", label: "電話" },
  { value: "email", label: "メール" },
  { value: "meeting", label: "打合せ" },
  { value: "visit", label: "訪問" },
  { value: "proposal", label: "提案" },
  { value: "demo", label: "デモ" },
  { value: "follow_up", label: "フォロー" },
  { value: "other", label: "その他" },
];

// 最終接点からの経過日数
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - d.getTime()) / 86_400_000);
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<CustomerOverview>({
    queryKey: ["customer-overview", id],
    queryFn: async () => (await api.get(`/customers/${id}/overview`)).data.data,
    enabled: !!id,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  // 活動のインライン追記
  const [showForm, setShowForm] = useState(false);
  const [actType, setActType] = useState("call");
  const [actSubject, setActSubject] = useState("");
  const [actDesc, setActDesc] = useState("");
  const [actProjectId, setActProjectId] = useState<string>("none");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customer-overview", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const createActivity = useMutation({
    mutationFn: async () =>
      api.post("/activity-logs", {
        customer_id: (data?.customer?.id as string | undefined) ?? id, // 旧URLでも正規の companies.id を優先（PR #199 P2）
        project_id: actProjectId === "none" ? null : actProjectId,
        activity_type: actType,
        activity_date: todayStr(),
        subject: actSubject.trim(),
        description: actDesc.trim() || null,
        next_action: nextAction.trim() || null,
        next_action_date: nextAction.trim() ? (nextActionDate || null) : null,
      }),
    onSuccess: () => {
      setShowForm(false);
      setActSubject(""); setActDesc(""); setNextAction(""); setNextActionDate(""); setActProjectId("none");
      invalidate();
    },
  });

  // 次回アクション 完了/延期
  const actionMutation = useMutation({
    mutationFn: async (p: { id: string; action: "complete" | "postpone"; date?: string }) =>
      p.action === "complete"
        ? api.post(`/activity-logs/${p.id}/complete-next-action`)
        : api.post(`/activity-logs/${p.id}/postpone-next-action`, { date: p.date }),
    onSuccess: invalidate,
  });
  const dateAfter = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [postponeFor, setPostponeFor] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/sales/customers")} className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" /> 顧客一覧へ
        </Button>
        <EmptyState title="顧客が見つかりません" />
      </div>
    );
  }

  const c = data.customer;
  const s = data.summary;
  const since = daysSince(s.last_contact_date);
  const maxYear = Math.max(1, ...data.sales_by_year.map((y) => Number(y.total)));

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        {/* 戻る */}
        <Button variant="ghost" size="sm" onClick={() => navigate("/sales/customers")} className="gap-1 -ml-2">
          <ArrowLeft className="h-4 w-4" /> 顧客一覧へ
        </Button>

        {/* ヘッダー: 顧客名 + 連絡先 + 取引実績サマリー */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Building2 className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
              <h1 className="break-words text-xl font-bold text-foreground">{String(c.name)}</h1>
            </div>
            {!!c.is_ai_created && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700"
                title={c.ai_requested_by ? `AI が登録しました (指示: ${c.ai_requested_by})` : "AI が登録しました"}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" /> AI作成
              </span>
            )}
            <Button
              variant="outline" size="sm" className="ml-auto gap-1 text-xs"
              onClick={() => navigate("/sales/customers")}
            >
              編集は一覧から
            </Button>
          </div>

          {/* 連絡先 */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 break-words text-sm text-muted-foreground">
            {c.contact_name ? <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5 shrink-0" />{String(c.contact_name)}</span> : null}
            {c.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 shrink-0" />{String(c.email)}</span> : null}
            {c.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5 shrink-0" />{String(c.phone)}</span> : null}
            {c.address ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" />{String(c.address)}</span> : null}
          </div>

          {/* 取引実績サマリー: 375px では1列、640px以上で2列、1024px以上(PC)で今までどおり4列 */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="累計売上 (確定)" value={formatCurrency(Number(s.confirmed_revenue))} icon={<TrendingUp className="h-4 w-4" />} />
            <SummaryTile label="案件数" value={`${s.project_active} / ${s.project_total}`} sub="進行中 / 全体" icon={<FolderKanban className="h-4 w-4" />} />
            <SummaryTile
              label="最終接点"
              value={since === null ? "—" : since === 0 ? "今日" : `${since}日前`}
              sub={s.last_contact_date ?? undefined}
              icon={<Clock className="h-4 w-4" />}
              emphasis={since !== null && since >= 30 ? "warn" : undefined}
            />
            <SummaryTile
              label="未完了アクション"
              value={`${s.open_actions}件`}
              icon={<CalendarClock className="h-4 w-4" />}
              emphasis={s.open_actions > 0 ? "info" : undefined}
            />
          </div>
        </div>

        {/* 統合タイムライン (インライン追記) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" aria-hidden="true" />
              やり取りの履歴
              {data.timeline.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">直近 {data.timeline.length} 件</span>
              )}
              <Button
                size="sm"
                className="ml-auto w-full gap-1 text-xs sm:w-auto"
                onClick={() => setShowForm((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                やり取りを記録
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* インライン追記フォーム */}
            {showForm && (
              <div className="mb-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-3 space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">種別</label>
                    <Select value={actType} onValueChange={setActType}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">関連案件 (任意)</label>
                    <Select value={actProjectId} onValueChange={setActProjectId}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">案件に紐づけない</SelectItem>
                        {data.projects.map((p) => (
                          <SelectItem key={String(p.id)} value={String(p.id)}>
                            {String(p.gls_number || p.code || "")} {String(p.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">件名 *</label>
                  <Input value={actSubject} onChange={(e) => setActSubject(e.target.value)} placeholder="例: 見積内容の確認電話" className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">詳細 (任意)</label>
                  <Textarea value={actDesc} onChange={(e) => setActDesc(e.target.value)} rows={2} className="resize-y" />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">次回アクション (任意)</label>
                    <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="例: 再提案の日程調整" className="h-9" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">次回アクション期限</label>
                    <Input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} className="h-9" disabled={!nextAction.trim()} />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>キャンセル</Button>
                  <Button
                    size="sm"
                    disabled={!actSubject.trim() || createActivity.isPending}
                    onClick={() => createActivity.mutate()}
                  >
                    {createActivity.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    記録する
                  </Button>
                </div>
              </div>
            )}

            {data.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                やり取りの記録はまだありません。「やり取りを記録」から追加できます (メールは AI が自動で取り込みます)。
              </p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5 ml-1.5">
                {data.timeline.map((a) => {
                  const meta = ACT_META[String(a.activity_type)] ?? ACT_META.other;
                  const MIcon = meta.icon;
                  const naOverdue = a.next_action_date && !a.next_action_done_at &&
                    String(a.next_action_date) < todayStr();
                  return (
                    <li key={String(a.id)} className="relative">
                      <span className={cn(
                        "absolute -left-[27px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-card",
                        a.is_ai_created ? "border-violet-300 bg-violet-50" : "border-border"
                      )}>
                        <MIcon className={cn("h-3 w-3", a.is_ai_created ? "text-violet-600" : "text-orange-600")} aria-hidden="true" />
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{meta.label}</span>
                        <span>{String(a.activity_date)}</span>
                        {a.user_name ? <span>{String(a.user_name)}</span> : null}
                        {a.project_name ? (
                          <button
                            className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary"
                            onClick={() => navigate(`/sales/projects/${a.project_id}`)}
                            title="案件を開く"
                          >
                            {String(a.project_gls || "")} {String(a.project_name)}
                          </button>
                        ) : null}
                        {a.is_ai_created ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700" title={a.ai_requested_by ? `AI が記録しました (指示: ${a.ai_requested_by})` : "AI が記録しました"}>
                            <Sparkles className="h-3 w-3" aria-hidden="true" /> AI作成
                          </span>
                        ) : null}
                        {a.source_channel ? (
                          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700" title="どこから届いたか">
                            {String(a.source_channel)}
                          </span>
                        ) : null}
                        {a.message_id ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600" title={`メールから作られました (Message-ID: ${a.message_id})`}>
                            ✉ メール
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-foreground">{String(a.subject)}</p>
                      {a.description ? (
                        <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground line-clamp-3">{String(a.description)}</p>
                      ) : null}
                      {a.next_action ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-xs",
                            a.next_action_done_at ? "text-muted-foreground line-through" : naOverdue ? "font-medium text-red-600" : "text-blue-700"
                          )}>
                            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {String(a.next_action)}
                            {a.next_action_date ? `（期限 ${String(a.next_action_date)}${naOverdue ? " · 超過" : ""}）` : ""}
                          </span>
                          {!a.next_action_done_at && (
                            <div className="flex flex-wrap items-center gap-1">
                              <Button size="sm" variant="outline" className="px-2 text-xs"
                                disabled={actionMutation.isPending}
                                onClick={() => actionMutation.mutate({ id: String(a.id), action: "complete" })}>
                                <Check className="h-3 w-3" aria-hidden="true" />完了
                              </Button>
                              {postponeFor === String(a.id) ? (
                                <>
                                  <Button size="sm" variant="ghost" className="px-1.5 text-xs" onClick={() => actionMutation.mutate({ id: String(a.id), action: "postpone", date: dateAfter(1) })}>明日</Button>
                                  <Button size="sm" variant="ghost" className="px-1.5 text-xs" onClick={() => actionMutation.mutate({ id: String(a.id), action: "postpone", date: dateAfter(7) })}>1週間</Button>
                                  <Button size="sm" variant="ghost" className="px-1.5 text-xs" onClick={() => setPostponeFor(null)}>×</Button>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" className="px-2 text-xs" onClick={() => setPostponeFor(String(a.id))}>延期</Button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* 案件リスト */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" />
              案件 ({data.projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">この顧客の案件はまだありません。</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.projects.map((p) => {
                  const stage = p.stage as ProjectStage;
                  const rev = Number(p.total_revenue) || 0;
                  const pur = Number(p.total_purchase) || 0;
                  const gp = rev - pur;
                  return (
                    <li key={String(p.id)}>
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-1 py-2.5 text-left transition-colors hover:bg-accent rounded-md"
                        onClick={() => navigate(`/sales/projects/${p.id}`)}
                      >
                        <span className="text-xs text-muted-foreground">{String(p.gls_number || p.code || "—")}</span>
                        <Badge className="shrink-0 text-[11px]" style={{ backgroundColor: ProjectStageColors[stage], color: "#fff" }}>
                          {ProjectStageLabels[stage] || String(p.stage)}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{String(p.name)}</span>
                        {p.event_start ? <span className="text-xs text-muted-foreground">{String(p.event_start)}</span> : null}
                        {rev > 0 || pur > 0 ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            売上 {formatCurrency(rev)} / 粗利 {formatCurrency(gp)}
                          </span>
                        ) : Number(p.expected_amount) > 0 ? (
                          <span className="text-xs tabular-nums text-muted-foreground">想定 {formatCurrency(Number(p.expected_amount))}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* 年次売上 */}
        {data.sales_by_year.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
                年次売上 (確定)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.sales_by_year.map((y) => (
                  <div key={y.year} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">{y.year}年</span>
                    <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full rounded bg-primary/70"
                        style={{ width: `${Math.max(2, (Number(y.total) / maxYear) * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-foreground">{formatCurrency(Number(y.total))}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}

// 取引実績タイル
function SummaryTile({ label, value, sub, icon, emphasis }: {
  label: string; value: string; sub?: string; icon: React.ReactNode;
  emphasis?: "warn" | "info";
}) {
  return (
    <div className={cn(
      "rounded-lg border p-2.5",
      emphasis === "warn" ? "border-amber-200 bg-amber-50/50"
        : emphasis === "info" ? "border-blue-200 bg-blue-50/50"
        : "border-border bg-muted/30"
    )}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={cn(
          emphasis === "warn" ? "text-amber-600" : emphasis === "info" ? "text-blue-600" : "text-muted-foreground"
        )}>{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
