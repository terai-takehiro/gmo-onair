/**
 * CustomerDetailPage — お客様1社 / 顧客360 (§4.9 / デザイン 11b)
 *
 * 「次に会う前の下調べを1画面で。その場で直せて、その場で記録できる」
 *
 * ヘッダーの連絡先は**その場で直せる** (旧版は「編集は一覧から」と書いて一覧に送り返していた)。
 * タブ = 接点と実績 / 案件 / 請求先 / 連絡先 (`?tab=`)。
 * 「請求先」は取引先マスター (`companies`) をここに統合したもの。
 * 同じ会社の情報を2か所で持たないため、`/sales/companies` は廃止した。
 *
 * 左 = やり取りの履歴 (記録欄が先頭・案件に紐づかない会話もここ) / この会社の案件
 * 右 = この会社で待たせているもの / 年ごとの売上 / 来訪・見学の記録 (内覧会を含む)
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Mail, Phone, MapPin, User, Sparkles, Plus, Loader2, CalendarClock,
  Check, Building2, ChevronRight, Pencil, DoorOpen, ReceiptText,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useAuth } from "@/contexts/platform/AuthContext";
import { ProjectStageLabels, ProjectStageColors, type ProjectStage } from "@/types";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

// ── 型 ────────────────────────────────────────────────────
type Rec = Record<string, unknown>;

interface CustomerOverview {
  customer: Rec;
  summary: {
    confirmed_revenue: number | string;
    project_total: number | string;
    project_active: number | string;
    last_contact_date: string | null;
    open_actions: number | string;
  };
  projects: Rec[];
  timeline: Rec[];
  sales_by_year: Array<{ year: string; total: number | string }>;
  open_actions: Rec[];
  visits: Rec[];
  billing: Rec | null;
}

const ACT_LABELS: Record<string, string> = {
  call: "電話", email: "メール", meeting: "打合せ", visit: "訪問",
  proposal: "提案", demo: "デモ", followup: "フォロー", follow_up: "フォロー", other: "その他",
};

const ACTIVITY_TYPES = [
  { value: "call", label: "電話" }, { value: "email", label: "メール" },
  { value: "meeting", label: "打合せ" }, { value: "visit", label: "訪問" },
  { value: "proposal", label: "提案" }, { value: "demo", label: "デモ" },
  { value: "follow_up", label: "フォロー" }, { value: "other", label: "その他" },
];

const TABS = [
  { id: "contact", label: "接点と実績" },
  { id: "projects", label: "案件" },
  { id: "billing", label: "請求先" },
  { id: "profile", label: "連絡先" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const n = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (v == null ? "" : String(v));
const todayStr = () => new Date().toISOString().slice(0, 10);
const dateAfter = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function daysSince(date: string | null): number | null {
  if (!date) return null;
  const t = Date.parse(`${date}T00:00:00`);
  if (Number.isNaN(t)) return null;
  return Math.round((Date.parse(`${todayStr()}T00:00:00`) - t) / 86_400_000);
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "manager");
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some((t) => t.id === sp.get("tab")) ? sp.get("tab") : "contact") as TabId;

  const q = useQuery<CustomerOverview>({
    queryKey: ["customer-overview", id],
    queryFn: async () => (await api.get(`/customers/${id}/overview`)).data.data,
    enabled: !!id,
    refetchOnMount: "always",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["customer-overview", id] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  };

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-screen-2xl px-4 py-6">
        <Delayed><SkeletonRows rows={5} /></Delayed>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> お客様一覧へ
        </Button>
        <ErrorPanel title="このお客様を読み込めませんでした" error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  const d = q.data;
  const c = d.customer;
  const since = daysSince(d.summary.last_contact_date);

  return (
    <PageTransition>
      <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-5 sm:py-7">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> お客様一覧へ
        </Button>

        {/* ヘッダー — 連絡先はその場で直せる */}
        <CustomerHeader customer={c} canEdit={canEdit} onSaved={invalidate} />

        {/* 数字 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="累計売上（確定）" value={formatCurrency(n(d.summary.confirmed_revenue))} />
          <Tile
            label="案件"
            value={`${n(d.summary.project_total)}件`}
            sub={n(d.summary.project_active) > 0 ? `進行中 ${n(d.summary.project_active)}件` : "進行中なし"}
          />
          <Tile
            label="最終接点"
            value={since === null ? "接点なし" : since === 0 ? "今日" : `${since}日前`}
            sub={d.summary.last_contact_date ?? undefined}
            tone={since !== null && since >= 30 ? "warn" : undefined}
          />
          <Tile
            label="待たせているもの"
            value={`${n(d.summary.open_actions)}件`}
            tone={n(d.summary.open_actions) > 0 ? "info" : undefined}
          />
        </div>

        {/* タブ */}
        <div className="flex gap-1 overflow-x-auto border-b border-divider" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                const next = new URLSearchParams(sp);
                if (t.id === "contact") next.delete("tab");
                else next.set("tab", t.id);
                setSp(next, { replace: true });
              }}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[14px] transition-colors",
                tab === t.id
                  ? "border-primary font-bold text-primary"
                  : "border-transparent text-secondary-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "contact" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-4">
              <TimelineCard
                customerId={id!}
                projects={d.projects}
                timeline={d.timeline}
                canEdit={canEdit}
                onChanged={invalidate}
              />
            </div>
            <div className="min-w-0 space-y-4">
              <WaitingCard rows={d.open_actions} canEdit={canEdit} onChanged={invalidate} />
              <SalesByYearCard rows={d.sales_by_year} />
              <VisitsCard rows={d.visits} />
            </div>
          </div>
        )}

        {tab === "projects" && <ProjectsCard rows={d.projects} />}
        {tab === "billing" && (
          <BillingCard customerId={id!} billing={d.billing} canEdit={canEdit} onChanged={invalidate} />
        )}
        {tab === "profile" && <ProfileCard customer={c} canEdit={canEdit} onSaved={invalidate} />}
      </div>
    </PageTransition>
  );
}

// ─────────────────────────────────────────────
// ヘッダー (その場編集)
// ─────────────────────────────────────────────
function CustomerHeader({ customer, canEdit, onSaved }: { customer: Rec; canEdit: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: str(customer.name),
    contact_name: str(customer.contact_name),
    email: str(customer.email),
    phone: str(customer.phone),
  });
  useEffect(() => {
    setForm({
      name: str(customer.name),
      contact_name: str(customer.contact_name),
      email: str(customer.email),
      phone: str(customer.phone),
    });
  }, [customer]);

  const save = useMutation({
    mutationFn: async () => api.put(`/customers/${customer.id}`, form),
    onSuccess: () => {
      setEditing(false);
      onSaved();
    },
  });

  const initial = str(customer.name).replace(/^(株式会社|有限会社|合同会社|一般社団法人)/, "").trim().slice(0, 1) || "・";

  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-[17px] font-bold text-secondary-foreground"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="会社名" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} placeholder="担当者" />
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="メール" />
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="電話" />
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  保存する
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>やめる</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <PageTitle>{str(customer.name)}</PageTitle>
                {!!customer.is_ai_created && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full border border-ai-border bg-ai-surface px-1.5 py-0.5 text-[10px] font-bold text-ai"
                    title={customer.ai_requested_by ? `AI が登録しました（指示: ${customer.ai_requested_by}）` : "AI が登録しました"}
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> AI作成
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-secondary-foreground">
                {customer.contact_name ? (
                  <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" aria-hidden="true" />{str(customer.contact_name)}</span>
                ) : null}
                {customer.email ? (
                  <a href={`mailto:${str(customer.email)}`} className="inline-flex items-center gap-1 hover:text-primary">
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />{str(customer.email)}
                  </a>
                ) : null}
                {customer.phone ? (
                  <a href={`tel:${str(customer.phone)}`} className="inline-flex items-center gap-1 hover:text-primary">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />{str(customer.phone)}
                  </a>
                ) : null}
                {customer.address ? (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{str(customer.address)}</span>
                ) : null}
              </div>
            </>
          )}
        </div>
        {canEdit && !editing && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            直す
          </Button>
        )}
      </div>
      {canEdit && !editing && (
        <p className="mt-2 text-[12px] text-muted-foreground">「直す」でこの場で書き換えられます。</p>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "info" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        tone === "warn" ? "border-warning-strong/40 bg-warning-surface" : "border-border"
      )}
    >
      <div className="text-[12px] text-secondary-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 whitespace-nowrap text-lg font-bold tabular-nums",
          tone === "warn" ? "text-warning-strong" : tone === "info" ? "text-primary" : "text-foreground"
        )}
      >
        {value}
      </div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

// ─────────────────────────────────────────────
// やり取りの履歴 (記録欄が先頭)
// ─────────────────────────────────────────────
function TimelineCard({
  customerId, projects, timeline, canEdit, onChanged,
}: { customerId: string; projects: Rec[]; timeline: Rec[]; canEdit: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("call");
  const [projectId, setProjectId] = useState("none");
  const [subject, setSubject] = useState("");
  const [desc, setDesc] = useState("");
  const [next, setNext] = useState("");
  const [nextDate, setNextDate] = useState("");
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: async () =>
      api.post("/activity-logs", {
        customer_id: customerId,
        project_id: projectId === "none" ? null : projectId,
        activity_type: type,
        activity_date: todayStr(),
        subject: subject.trim(),
        description: desc.trim() || null,
        next_action: next.trim() || null,
        next_action_date: next.trim() ? nextDate || null : null,
      }),
    onSuccess: () => {
      setOpen(false);
      setSubject(""); setDesc(""); setNext(""); setNextDate(""); setProjectId("none");
      onChanged();
    },
  });

  return (
    <section className="rounded-lg border border-border bg-card" aria-label="やり取りの履歴">
      <header className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-foreground">やり取りの履歴</h2>
          <p className="mt-0.5 text-[12px] text-secondary-foreground">案件に紐づかないやり取りもここに入ります</p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1" onClick={() => setOpen((v) => !v)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            やり取りを記録
          </Button>
        )}
      </header>

      <div className="p-4">
        {canEdit && (
          <div className="mb-4">
            {open ? (
              <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/[0.03] p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[12px]">種別</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[12px]">案件（後からでも紐づけられます）</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">案件に紐づけない</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={str(p.id)} value={str(p.id)}>
                            {str(p.gls_number || p.code)} {str(p.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-[12px]">何があったか *</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="例）見積の内容を電話で確認した" className="h-9" />
                </div>
                <div>
                  <Label className="text-[12px]">くわしく</Label>
                  <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className="resize-y" />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-[12px]">次にやること</Label>
                    <Input value={next} onChange={(e) => setNext(e.target.value)} placeholder="例）再提案の日程を決める" className="h-9" />
                  </div>
                  <div>
                    <Label className="text-[12px]">その期限</Label>
                    <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="h-9" disabled={!next.trim()} />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>やめる</Button>
                  <Button size="sm" disabled={!subject.trim() || create.isPending} onClick={() => create.mutate()}>
                    {create.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                    記録する
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full rounded-lg border border-dashed border-border px-3 py-2.5 text-left text-[13px] text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
              >
                電話・メール・打合せの内容を書く（案件は後から紐づけられます）
              </button>
            )}
          </div>
        )}

        {timeline.length === 0 ? (
          <p className="text-[13px] text-secondary-foreground">
            まだ記録がありません。メールは AI が自動で取り込みます。
          </p>
        ) : (
          <ol className="ml-1.5 space-y-4 border-l border-divider pl-5">
            {timeline.map((a) => {
              const overdue = !!a.next_action_date && !a.next_action_done_at && str(a.next_action_date) < todayStr();
              return (
                <li key={str(a.id)} className="relative">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full border-2 bg-card",
                      a.is_ai_created ? "border-ai" : "border-border"
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-secondary-foreground">
                    <span className="font-bold text-foreground">{ACT_LABELS[str(a.activity_type)] ?? "その他"}</span>
                    <span className="tabular-nums">{str(a.activity_date)}</span>
                    {a.user_name ? <span>{str(a.user_name)}</span> : null}
                    {a.project_name ? (
                      <button
                        type="button"
                        className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] hover:text-primary"
                        onClick={() => navigate(`/sales/projects/${a.project_id}`)}
                        title="案件を開く"
                      >
                        {str(a.project_gls)} {str(a.project_name)}
                      </button>
                    ) : null}
                    {a.is_ai_created ? (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full border border-ai-border bg-ai-surface px-1.5 py-0.5 text-[10px] font-bold text-ai"
                        title={a.ai_requested_by ? `AI が記録しました（指示: ${a.ai_requested_by}）` : "AI が記録しました"}
                      >
                        <Sparkles className="h-3 w-3" aria-hidden="true" /> AI作成
                      </span>
                    ) : null}
                    {a.message_id ? (
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px]" title="メールから作られました">✉ メール</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[14px] font-bold text-foreground">{str(a.subject)}</p>
                  {a.description ? (
                    <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[12px] text-secondary-foreground">{str(a.description)}</p>
                  ) : null}
                  {a.next_action ? (
                    <p
                      className={cn(
                        "mt-1 inline-flex items-center gap-1.5 text-[12px]",
                        a.next_action_done_at ? "text-muted-foreground line-through" : overdue ? "font-bold text-destructive" : "text-primary"
                      )}
                    >
                      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {str(a.next_action)}
                      {a.next_action_date ? `（期限 ${str(a.next_action_date)}${overdue ? " · 過ぎています" : ""}）` : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// この会社で待たせているもの
// ─────────────────────────────────────────────
function WaitingCard({ rows, canEdit, onChanged }: { rows: Rec[]; canEdit: boolean; onChanged: () => void }) {
  const [postponeFor, setPostponeFor] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: async (p: { id: string; action: "complete" | "postpone"; date?: string }) =>
      p.action === "complete"
        ? api.post(`/activity-logs/${p.id}/complete-next-action`)
        : api.post(`/activity-logs/${p.id}/postpone-next-action`, { date: p.date }),
    onSuccess: onChanged,
  });

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="この会社で待たせているもの">
      <h2 className="text-[15px] font-bold text-foreground">この会社で待たせているもの</h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-[13px] text-secondary-foreground">待たせているものはありません。</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((r) => {
            const overdue = str(r.next_action_date) < todayStr();
            return (
              <li key={str(r.id)} className="rounded-lg border border-border px-3 py-2">
                <p className="text-[13px] font-bold text-foreground">{str(r.next_action)}</p>
                <p className={cn("mt-0.5 text-[12px] tabular-nums", overdue ? "font-bold text-destructive" : "text-secondary-foreground")}>
                  期限 {str(r.next_action_date)}{overdue ? "（過ぎています）" : ""}
                </p>
                {r.project_name ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{str(r.project_gls)} {str(r.project_name)}</p>
                ) : null}
                {canEdit && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[12px]"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ id: str(r.id), action: "complete" })}>
                      <Check className="h-3 w-3" aria-hidden="true" />もう終わった
                    </Button>
                    {postponeFor === str(r.id) ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[12px]" onClick={() => act.mutate({ id: str(r.id), action: "postpone", date: dateAfter(1) })}>明日</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[12px]" onClick={() => act.mutate({ id: str(r.id), action: "postpone", date: dateAfter(7) })}>1週間</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[12px]" onClick={() => setPostponeFor(null)}>やめる</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => setPostponeFor(str(r.id))}>期限を引き直す</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// 年ごとの売上 / 来訪・見学 / 案件
// ─────────────────────────────────────────────
function SalesByYearCard({ rows }: { rows: Array<{ year: string; total: number | string }> }) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => n(r.total)));
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="年ごとの売上">
      <h2 className="text-[15px] font-bold text-foreground">年ごとの売上（確定）</h2>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.year} className="flex items-center gap-2">
            <span className="w-11 shrink-0 text-[12px] tabular-nums text-secondary-foreground">{r.year}年</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-secondary">
              <div className="h-full rounded bg-primary/70" style={{ width: `${Math.max(2, (n(r.total) / max) * 100)}%` }} />
            </div>
            <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-foreground">{formatCurrency(n(r.total))}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function VisitsCard({ rows }: { rows: Rec[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-label="来訪・見学の記録">
      <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
        <DoorOpen className="h-4 w-4 text-primary" aria-hidden="true" />
        来訪・見学の記録
      </h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-[13px] text-secondary-foreground">まだありません。</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              <span className="w-20 shrink-0 tabular-nums text-secondary-foreground">{str(r.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-foreground">{str(r.what)}</span>
                <span className="block text-[12px] text-muted-foreground">
                  {str(r.kind)}
                  {r.who ? ` ・ ${str(r.who)}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-muted-foreground">内覧会の来場予約もこの会社の記録として入ります。</p>
    </section>
  );
}

function ProjectsCard({ rows }: { rows: Rec[] }) {
  const navigate = useNavigate();
  const active = rows.filter((p) => p.is_active).length;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
        title="この会社の案件はまだありません"
        description="案件をつくると、ここに並びます。"
        action={<Button onClick={() => navigate("/sales/projects/new")}>案件をつくる</Button>}
      />
    );
  }
  return (
    <section className="rounded-lg border border-border bg-card" aria-label="この会社の案件">
      <header className="flex items-center gap-2 border-b border-divider px-4 py-3">
        <h2 className="text-[15px] font-bold text-foreground">この会社の案件</h2>
        <span className="text-[13px] text-secondary-foreground">
          {rows.length}件{active > 0 ? `（進行中 ${active}件）` : ""}
        </span>
      </header>
      <ul className="divide-y divide-divider">
        {rows.map((p) => {
          const rev = n(p.total_revenue);
          const pur = n(p.total_purchase);
          return (
            <li key={str(p.id)}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
                onClick={() => navigate(`/sales/projects/${p.id}`)}
              >
                <Badge
                  className="shrink-0 text-[11px]"
                  style={{ backgroundColor: ProjectStageColors[p.stage as ProjectStage], color: "#fff" }}
                >
                  {ProjectStageLabels[p.stage as ProjectStage] ?? str(p.stage)}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-foreground">{str(p.name)}</span>
                  <span className="mt-0.5 block text-[12px] text-secondary-foreground">
                    {p.event_start ? str(p.event_start) : "実施日 未定"}
                    {p.gls_number || p.code ? ` ・ ${str(p.gls_number || p.code)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[13px] tabular-nums">
                  {rev > 0 || pur > 0 ? (
                    <>
                      <span className="block font-bold text-foreground">{formatCurrency(rev)}</span>
                      <span className="block text-[12px] text-secondary-foreground">粗利 {formatCurrency(rev - pur)}</span>
                    </>
                  ) : n(p.expected_amount) > 0 ? (
                    <>
                      <span className="block font-bold text-foreground">{formatCurrency(n(p.expected_amount))}</span>
                      <span className="block text-[12px] text-secondary-foreground">想定</span>
                    </>
                  ) : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────
// 請求先 (取引先マスターの統合先)
// ─────────────────────────────────────────────
function BillingCard({
  customerId, billing, canEdit, onChanged,
}: { customerId: string; billing: Rec | null; canEdit: boolean; onChanged: () => void }) {
  const [form, setForm] = useState({
    name: str(billing?.name),
    contact_name: str(billing?.contact_name),
    email: str(billing?.email),
    phone: str(billing?.phone),
    address: str(billing?.address),
    invoice_registration_number: str(billing?.invoice_registration_number),
    is_vendor: !!billing?.is_vendor,
    is_sga_payee: !!billing?.is_sga_payee,
    notes: str(billing?.notes),
  });
  useEffect(() => {
    setForm({
      name: str(billing?.name),
      contact_name: str(billing?.contact_name),
      email: str(billing?.email),
      phone: str(billing?.phone),
      address: str(billing?.address),
      invoice_registration_number: str(billing?.invoice_registration_number),
      is_vendor: !!billing?.is_vendor,
      is_sga_payee: !!billing?.is_sga_payee,
      notes: str(billing?.notes),
    });
  }, [billing]);

  const create = useMutation({
    mutationFn: async () => api.post(`/customers/${customerId}/billing-party`),
    onSuccess: onChanged,
  });
  const save = useMutation({
    mutationFn: async () => api.put(`/companies/${billing!.id}`, { ...form, is_customer: true }),
    onSuccess: onChanged,
  });

  if (!billing) {
    return (
      <EmptyState
        icon={<ReceiptText className="h-6 w-6" aria-hidden="true" />}
        title="請求先の情報がまだありません"
        description="請求書に出す名前・住所・適格請求書の登録番号をここで持ちます。この会社の情報から作れます。"
        action={
          canEdit ? (
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              この会社の請求先を作る
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <section className="max-w-3xl space-y-3 rounded-lg border border-border bg-card p-4" aria-label="請求先">
      <div>
        <h2 className="text-[15px] font-bold text-foreground">請求先</h2>
        <p className="mt-0.5 text-[12px] text-secondary-foreground">
          請求書・見積書に出す情報です。同じ会社の情報を2か所で持たないよう、取引先マスターはここに統合しました。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="bp-name">請求先の名前</Label>
          <Input id="bp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="bp-contact">担当者</Label>
          <Input id="bp-contact" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="bp-email">メール</Label>
          <Input id="bp-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="bp-phone">電話</Label>
          <Input id="bp-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} />
        </div>
      </div>
      <div>
        <Label htmlFor="bp-address">住所</Label>
        <Input id="bp-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEdit} />
      </div>
      <div>
        <Label htmlFor="bp-invoice">適格請求書の登録番号</Label>
        <Input
          id="bp-invoice"
          value={form.invoice_registration_number}
          onChange={(e) => setForm({ ...form, invoice_registration_number: e.target.value })}
          placeholder="T0000000000000"
          disabled={!canEdit}
        />
        <p className="mt-1 text-[12px] text-muted-foreground">
          支払期日は売上・仕入の1件ごとに入れます（会社ごとの支払条件はまだ持っていません）。
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={form.is_vendor} onCheckedChange={(v) => setForm({ ...form, is_vendor: v })} disabled={!canEdit} />
          仕入先でもある
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <Switch checked={form.is_sga_payee} onCheckedChange={(v) => setForm({ ...form, is_sga_payee: v })} disabled={!canEdit} />
          販管費の支払先でもある
        </label>
      </div>
      <div>
        <Label htmlFor="bp-notes">メモ</Label>
        <Textarea id="bp-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={!canEdit} />
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            請求先を保存する
          </Button>
        </div>
      )}
      {save.isError && (
        <ErrorPanel title="請求先を保存できませんでした" error={save.error} inputPreserved />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// 連絡先 (顧客レコードそのもの)
// ─────────────────────────────────────────────
function ProfileCard({ customer, canEdit, onSaved }: { customer: Rec; canEdit: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: str(customer.name),
    short_name: str(customer.short_name),
    contact_name: str(customer.contact_name),
    email: str(customer.email),
    phone: str(customer.phone),
    address: str(customer.address),
    notes: str(customer.notes),
  });
  const save = useMutation({
    mutationFn: async () => api.put(`/customers/${customer.id}`, form),
    onSuccess: onSaved,
  });

  return (
    <section className="max-w-3xl space-y-3 rounded-lg border border-border bg-card p-4" aria-label="連絡先">
      <h2 className="text-[15px] font-bold text-foreground">連絡先</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="cp-name">会社名</Label>
          <Input id="cp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="cp-short">略称</Label>
          <Input id="cp-short" value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="cp-contact">担当者</Label>
          <Input id="cp-contact" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="cp-phone">電話</Label>
          <Input id="cp-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} />
        </div>
      </div>
      <div>
        <Label htmlFor="cp-email">メール</Label>
        <Input id="cp-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} />
      </div>
      <div>
        <Label htmlFor="cp-address">住所</Label>
        <Input id="cp-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEdit} />
      </div>
      <div>
        <Label htmlFor="cp-notes">メモ</Label>
        <Textarea id="cp-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={!canEdit} />
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            保存する
          </Button>
        </div>
      )}
      {save.isError && <ErrorPanel title="保存できませんでした" error={save.error} inputPreserved />}
    </section>
  );
}
