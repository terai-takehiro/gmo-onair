/**
 * 請求のしごと — お金 ＞ 請求のしごと (デザイン 31章 31a / 仕様書 §7.5)
 *
 * 毎月やることが決まっている仕事なので、**対象を集めて → 確認して → まとめて出す**
 * を1画面で終わらせる。入金の確認も同じ画面に置く
 * (別画面にすると「出したのに入ったか分からない」が起きる)。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - **申込書が揃っていない案件は選べない**（チェックが灰色）。何が足りないかを行に出す
 *  - 入金は**期日を過ぎたものが上**。その場で「入金を記録」まで行ける
 *  - **ONAiR はメールを送らない**。「催促する」は次にやることを立てるだけ
 *  - 月次運用は**先月と金額が違うものだけ印**を付ける
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency } from "@gmo-onair/shared/src/client/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@gmo-onair/shared/src/client/ui/money";
import { NoticeBar, setNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { EmptyState, ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { useAuth } from "@/contexts/platform/AuthContext";
import {
  Receipt, Wallet, ClipboardCheck, Loader2, AlertTriangle, RefreshCw, Repeat, Printer,
} from "lucide-react";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface BillRow {
  id: string;
  billing_key: string | null;
  project_id: string | null;
  project_name: string;
  episode_code: string | null;
  gls_number: string | null;
  customer_name: string;
  subtitle: string | null;
  amount: number;
  amount_with_tax: number;
  recognition_date: string | null;
  payment_due_date: string | null;
  invoice_issued: boolean;
  invoice_issued_at: string | null;
  paid_at: string | null;
  inspection_issued_at: string | null;
  missing: string[];
  can_issue: boolean;
  overdue?: boolean;
}

interface RecurringRow {
  id: string; project_id: string; project_name: string; customer_name: string;
  amount: number; prev_amount: number; invoice_issued: boolean;
}

interface BillingView {
  month: string | null;
  to_issue: BillRow[];
  to_collect: BillRow[];
  to_inspect: BillRow[];
  recently_paid: BillRow[];
  counts: { to_issue: number; to_collect: number; to_inspect: number; blocked: number };
  recurring: RecurringRow[];
}

type Tab = "issue" | "collect" | "inspect";
const pad2 = (n: number) => String(n).padStart(2, "0");

/** 計上月ラベル。「7月」のように短く出す (年は必要なときだけ) */
function monthLabel(date: string | null): string {
  if (!date) return "—";
  const m = Number(date.slice(5, 7));
  return Number.isFinite(m) ? `${m}月` : "—";
}

/** M/D。年は出さない */
function md(date: string | null): string {
  if (!date) return "—";
  const p = date.slice(0, 10).split("-");
  return p.length >= 3 ? `${Number(p[1])}/${pad2(Number(p[2]))}` : date;
}

export default function BillingWorkPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("budget", "editor");

  const now = new Date();
  const [sp, setSp] = useSearchParams();
  const month = sp.get("month") ?? `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const tab = (sp.get("tab") as Tab) || "issue";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    next.set(k, v);
    setSp(next, { replace: true });
  };

  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ data: BillingView }>({
    queryKey: ["billing-work", month],
    queryFn: async () => (await api.get("/billing", { params: { month } })).data,
    placeholderData: (prev) => prev,
  });
  const view = data?.data;

  const rows: BillRow[] = useMemo(() => {
    if (!view) return [];
    return tab === "issue" ? view.to_issue : tab === "collect" ? view.to_collect : view.to_inspect;
  }, [view, tab]);

  const pickedRows = useMemo(
    () => (view?.to_issue ?? []).filter((r) => picked.has(r.id)),
    [view, picked],
  );
  const pickedTotal = pickedRows.reduce((s, r) => s + r.amount, 0);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["billing-work"] });

  const issueMutation = useMutation({
    mutationFn: async () => (await api.post("/billing/issue", { ids: [...picked] })).data,
    onSuccess: async () => {
      const ids = [...picked];
      setPicked(new Set());
      await invalidate();
      setNotice({
        tone: "success",
        title: `${ids.length}件を「請求書を出した」と記録しました`,
        description: "続けて PDF をダウンロードします。送るのは自分のメールです（ONAiR は送りません）。",
      });
      // PDF は1枚ずつ落とす (まとめて1つの箱にはしない — 宛先ごとに送るため)
      for (const id of ids) await downloadPdf(id, "invoice");
    },
    onError: (e: any) => setNotice({
      tone: "error",
      title: e?.response?.data?.error?.message ?? "記録できませんでした",
    }),
  });

  const simple = (path: string, okTitle: string) => ({
    mutationFn: async (id: string) => (await api.post(`/billing/${id}/${path}`)).data,
    onSuccess: async () => { await invalidate(); setNotice({ tone: "success" as const, title: okTitle }); },
    onError: (e: any) => setNotice({
      tone: "error" as const, title: e?.response?.data?.error?.message ?? "記録できませんでした",
    }),
  });

  const paidMutation = useMutation(simple("paid", "入金を記録しました"));
  const unpaidMutation = useMutation(simple("unpaid", "入金の記録を外しました"));
  const unissueMutation = useMutation(simple("unissue", "発行を取り消しました（番号は残ります）"));
  const inspectedMutation = useMutation(simple("inspected", "検収書を出したと記録しました"));
  const dunMutation = useMutation({
    ...simple("dun", "催促を次にやることに立てました"),
    onSuccess: async () => {
      await invalidate();
      setNotice({
        tone: "success", title: "催促を次にやることに立てました",
        description: "ONAiR はメールを送りません。送るのは自分のメールです。",
      });
    },
  });

  async function downloadPdf(id: string, type: "invoice" | "inspection") {
    try {
      const res = await api.get(`/revenues/${id}/pdf`, { params: { type }, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type === "invoice" ? "請求書" : "検収書"}_${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ tone: "warning", title: "PDF を作れませんでした", description: "記録は残っています。もう一度お試しください。" });
    }
  }

  if (isLoading && !view) return <div className="p-6"><SkeletonCard /></div>;
  if (isError || !view) {
    return <div className="p-6"><ErrorPanel title="請求のしごとを読み込めませんでした" error={error} onRetry={() => refetch()} /></div>;
  }

  const TABS: Array<{ key: Tab; label: string; count: number; icon: typeof Receipt }> = [
    { key: "issue", label: "請求書を出す", count: view.counts.to_issue, icon: Receipt },
    { key: "collect", label: "入金の確認", count: view.counts.to_collect, icon: Wallet },
    { key: "inspect", label: "検収書を出す", count: view.counts.to_inspect, icon: ClipboardCheck },
  ];

  return (
    <div className="min-h-full bg-background">
      <NoticeBar />

      {/* ヘッダー */}
      <div className="border-b border-divider bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2 text-[13.5px] text-muted-foreground">
            <button type="button" onClick={() => navigate("/finance")} className="flex h-11 items-center hover:underline">お金</button>
            <span>›</span>
            <span className="font-bold text-foreground">請求のしごと</span>
          </div>
          <div className="flex-1" />
          <Input
            type="month"
            value={month}
            onChange={(e) => setParam("month", e.target.value)}
            className="h-10 w-[160px]"
            aria-label="締めの月"
          />
          <Button variant="outline" size="sm" className="h-10" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />最新にする
          </Button>
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {month.replace("-", "年")}月締め ・ 未発行 {view.counts.to_issue}件 ・ 入金待ち {view.counts.to_collect}件
          {view.counts.blocked > 0 && (
            <span className="ml-2 rounded-md bg-warning-surface px-2 py-0.5 text-warning-strong">
              書類が揃っていない {view.counts.blocked}件
            </span>
          )}
        </p>
      </div>

      <div className="px-4 py-5 sm:px-6">
        {/* タブ */}
        <div className="mb-4 flex flex-wrap gap-1 rounded-control bg-secondary p-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setParam("tab", t.key)}
                aria-pressed={active}
                className={`flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-[9px] px-3 text-[13.5px] font-bold transition-colors ${
                  active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                <span className={`rounded-md px-1.5 text-xs ${active ? "bg-secondary" : ""}`}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* まとめて出すバー (請求書を出すタブのみ) */}
        {tab === "issue" && canEdit && picked.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gmo-blue-100 bg-accent/40 px-4 py-3">
            <span className="text-[13.5px] font-bold">{picked.size}件を選択中</span>
            <Money value={pickedTotal} className="w-[160px] text-[15px] font-bold" />
            <span className="text-xs text-muted-foreground">税抜</span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-10" onClick={() => setPicked(new Set())}>選択を外す</Button>
            <Button size="sm" className="h-10" onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}>
              {issueMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
              選んだ{picked.size}件をまとめて出す
            </Button>
          </div>
        )}

        {/* 一覧 */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {/* 列見出し (PC のみ) */}
          <div className="hidden min-h-[44px] items-center gap-3.5 border-b border-divider bg-muted/40 px-[18px] text-[12.5px] font-bold text-muted-foreground lg:flex">
            {tab === "issue" && <span className="w-[24px] shrink-0" />}
            <span className="min-w-0 flex-1">案件 ／ 請求先</span>
            <span className="w-[128px] shrink-0 text-right">金額（税抜）</span>
            <span className="w-[72px] shrink-0 text-center">計上月</span>
            <span className="w-[96px] shrink-0 text-center">支払期日</span>
            <span className="w-[128px] shrink-0">{tab === "issue" ? "揃っていないもの" : "状態"}</span>
            <span className="w-[160px] shrink-0 text-right" />
          </div>

          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={
                  tab === "issue" ? "この月に出す請求はありません"
                    : tab === "collect" ? "入金待ちはありません"
                    : "検収書を出すものはありません"
                }
                description={
                  tab === "issue"
                    ? "確定した売上ができると、ここに出ます。締めの月を変えると別の月を見られます。"
                    : tab === "collect"
                    ? "請求書を出すと、入金の確認がここに並びます。"
                    : "請求書を出した売上のうち、検収書がまだのものが並びます。"
                }
              />
            </div>
          ) : rows.map((r) => {
            const blocked = tab === "issue" && !r.can_issue;
            const isPicked = picked.has(r.id);
            return (
              <div
                key={r.id}
                className={`flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-row px-[18px] py-3 lg:flex-nowrap lg:py-0 lg:min-h-[56px] ${
                  r.overdue ? "bg-destructive-surface/30" : blocked ? "bg-muted/30" : "hover:bg-accent/20"
                }`}
              >
                {tab === "issue" && (
                  <button
                    type="button"
                    disabled={blocked || !canEdit}
                    onClick={() => setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                      return next;
                    })}
                    aria-pressed={isPicked}
                    aria-label={blocked ? "書類が揃っていないので選べません" : "この請求を選ぶ"}
                    className="-m-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center p-2 lg:m-0 lg:min-h-0 lg:min-w-0 lg:p-0"
                  >
                    {/* 見た目は 22px の四角。タップ領域だけスマホで 44px に広げる */}
                    <span
                      className={`flex h-[22px] w-[22px] items-center justify-center rounded border text-xs ${
                        blocked ? "cursor-not-allowed border-border bg-secondary text-muted-foreground"
                          : isPicked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                      }`}
                    >
                      {isPicked ? "✓" : ""}
                    </span>
                  </button>
                )}

                <div className="min-w-0 flex-1 basis-full lg:basis-auto">
                  <button
                    type="button"
                    onClick={() => r.project_id && navigate(`/sales/projects/${r.project_id}`)}
                    className="flex min-h-[44px] max-w-full items-center text-left text-[13.5px] font-bold hover:underline lg:min-h-0"
                  >
                    <span className="truncate">{r.project_name || "（案件名なし）"}</span>
                  </button>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.customer_name || "（請求先なし）"}
                    {r.episode_code ? ` ・ ${r.episode_code}` : r.gls_number ? ` ・ ${r.gls_number}` : ""}
                  </p>
                </div>

                <Money value={r.amount} className="w-[128px] shrink-0 text-[14.5px] font-bold" />
                <span className="w-[72px] shrink-0 text-center text-[12.5px] text-muted-foreground">
                  {monthLabel(r.recognition_date)}
                </span>
                <span className={`font-number w-[96px] shrink-0 text-center text-[12.5px] ${
                  r.overdue ? "font-bold text-destructive" : "text-secondary-foreground"
                }`}>
                  {md(r.payment_due_date)}{r.overdue ? " 超過" : ""}
                </span>

                <span className="w-[128px] shrink-0 text-[12.5px]">
                  {tab === "issue" ? (
                    r.missing.length ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive-surface px-2 py-0.5 font-bold text-destructive">
                        <AlertTriangle className="h-3 w-3" />{r.missing.join("・")}
                      </span>
                    ) : (
                      <span className="rounded-md bg-success-surface px-2 py-0.5 font-bold text-success">出せる</span>
                    )
                  ) : tab === "collect" ? (
                    <span className={`rounded-md px-2 py-0.5 font-bold ${
                      r.overdue ? "bg-destructive-surface text-destructive" : "bg-warning-surface text-warning-strong"
                    }`}>
                      {r.overdue ? "期日を過ぎています" : "入金待ち"}
                    </span>
                  ) : (
                    <span className="rounded-md bg-secondary px-2 py-0.5 font-bold text-secondary-foreground">請求済み</span>
                  )}
                </span>

                <span className="flex w-full shrink-0 justify-end gap-2 lg:w-[160px]">
                  {tab === "issue" && (
                    <Button variant="ghost" size="sm" className="h-9" onClick={() => downloadPdf(r.id, "invoice")}>
                      PDFを見る
                    </Button>
                  )}
                  {tab === "collect" && canEdit && (
                    <>
                      {r.overdue && (
                        <Button size="sm" className="h-9" onClick={() => dunMutation.mutate(r.id)} disabled={dunMutation.isPending}>
                          催促する
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-9" onClick={() => paidMutation.mutate(r.id)} disabled={paidMutation.isPending}>
                        入金を記録
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-9 text-muted-foreground"
                        title="発行を取り消します（請求書の番号は残ります）"
                        onClick={async () => {
                          if (!(await confirmAction({ title: "この請求の「出した」記録を取り消します。請求書の番号は残ります。よろしいですか？", confirmLabel: '削除する', tone: 'danger' }))) return;
                          unissueMutation.mutate(r.id);
                        }}
                        disabled={unissueMutation.isPending}
                      >
                        取り消す
                      </Button>
                    </>
                  )}
                  {tab === "inspect" && canEdit && (
                    <Button
                      variant="outline" size="sm" className="h-9"
                      onClick={async () => { await downloadPdf(r.id, "inspection"); inspectedMutation.mutate(r.id); }}
                      disabled={inspectedMutation.isPending}
                    >
                      検収書を出す
                    </Button>
                  )}
                </span>
              </div>
            );
          })}

          {tab === "issue" && (
            <p className="px-[18px] py-3 text-[12.5px] text-muted-foreground">
              申込書が揃っていない案件は選べません。何が足りないかは案件の書類と同じものを見ています。
            </p>
          )}
          {tab === "collect" && (
            <p className="px-[18px] py-3 text-[12.5px] text-muted-foreground">
              期日を過ぎたものが上に出ます。「催促する」は次にやることを立てるだけです（ONAiR はメールを送りません）。
            </p>
          )}
        </div>

        {/* 最近入金した分 — 記録した直後に消えてしまうと打ち間違いを直せない */}
        {tab === "collect" && (view.recently_paid?.length ?? 0) > 0 && (
          <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex min-h-[48px] flex-wrap items-center gap-2 border-b border-divider px-[18px] py-2">
              <Wallet className="h-4 w-4 text-success" />
              <p className="text-[15px] font-bold">最近入金した分</p>
              <span className="text-[12.5px] text-muted-foreground">直近14日ぶん。間違えたらここで外せます</span>
            </div>
            {view.recently_paid.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-row px-[18px] py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{r.project_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.customer_name}</p>
                </div>
                <span className="font-number w-[96px] text-center text-[12.5px] text-success">
                  {md(r.paid_at)} 入金
                </span>
                <Money value={r.amount} className="w-[128px] text-[13.5px] font-bold" />
                {canEdit && (
                  <Button
                    variant="ghost" size="sm" className="h-9 text-muted-foreground"
                    onClick={() => unpaidMutation.mutate(r.id)}
                    disabled={unpaidMutation.isPending}
                  >
                    入金を外す
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 月次運用 */}
        {view.recurring.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex min-h-[48px] flex-wrap items-center gap-2 border-b border-divider px-[18px] py-2">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <p className="text-[15px] font-bold">毎月同じ請求（月次運用）</p>
              <span className="text-[12.5px] text-muted-foreground">先月と金額が違うものだけ印を付けます</span>
            </div>
            {view.recurring.map((r) => {
              const changed = Number(r.amount) !== Number(r.prev_amount);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 border-b border-row px-[18px] py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{r.project_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.customer_name}</p>
                  </div>
                  {changed && (
                    <span className="rounded-md bg-warning-surface px-2 py-0.5 text-xs font-bold text-warning-strong">
                      先月と違う
                    </span>
                  )}
                  <Money value={r.amount} className="w-[128px] text-[13.5px] font-bold" />
                  {changed && (
                    <span className="font-number w-[128px] text-right text-xs text-muted-foreground">
                      先月 {formatCurrency(r.prev_amount)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          金額はすべて税抜です。消費税と支払額は請求書に出るときに足します。
          {view.month && ` 締めの月を変えると別の月の対象を見られます（いまは ${monthLabel(`${view.month}-01`)}）。`}
        </p>
      </div>
    </div>
  );
}
