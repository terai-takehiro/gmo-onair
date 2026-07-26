/**
 * 合同案件 — お金 ＞ 合同案件 (デザイン 32章 40a / 40b / 仕様書 §7.14)
 *
 * 1回のイベントを複数社で開き、**総額を分けて各社に請求する**。
 * 株主総会をグループ9社で開いたら請求書は9枚、宛名も9社。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - 作るときに最初に **「請求書が何枚出るか」** を聞く。1枚なら既存の費用分けへ送る
 *    (同じ画面に2つの意味が混ざると必ず間違える)
 *  - **会社を選ぶと案件が自動でできる**。9社なら9案件。手で作らせない
 *  - **あまりの1円の行き先を画面に出す**。既定は幹事、その場で変えられる
 *  - **合計が総額に合わないうちは「請求書を出す」を押せない**
 *  - **出した請求書は消せない**。1社抜けたら取り消しの請求書を1枚出して配り直す
 *  - 「按分」という言葉は出さない
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency } from "@gmo-onair/shared/src/client/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@gmo-onair/shared/src/client/ui/money";
import { NoticeBar, setNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { ErrorPanel, SkeletonCard, EmptyState } from "@gmo-onair/shared/src/client/states";
import { useAuth } from "@/contexts/platform/AuthContext";
import {
  Users, Layers, Plus, Loader2, AlertTriangle, ArrowLeft, Check, X, Building2,
} from "lucide-react";

interface CompanyRow {
  id: string;
  customer_id: string;
  company_name: string;
  billing_customer_id: string | null;
  billing_company_name: string | null;
  billing_differs: boolean;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  ratio_bp: number;
  ratio_percent: number;
  amount: number;
  amount_with_tax: number;
  payment_due_date: string | null;
  revenue_id: string | null;
  billing_key: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_billing_key: string | null;
}

interface JointDetail {
  id: string;
  name: string;
  event_start: string | null;
  organizer_customer_id: string;
  organizer_name: string;
  tax_category: string;
  total_amount: number;
  split_mode: "equal" | "ratio" | "manual";
  remainder_customer_id: string | null;
  payment_due_date: string | null;
  issued_at: string | null;
  companies: CompanyRow[];
  totals: {
    sum: number; total: number; matches: boolean; diff: number;
    total_with_tax: number; revenue: number; purchase: number;
    gross: number; gross_margin: number;
  };
}

const SPLIT_LABELS: Record<string, string> = {
  equal: "均等に分ける",
  ratio: "割合で分ける",
  manual: "金額を直接入れる",
};

const md = (d: string | null) => {
  if (!d) return "—";
  const p = d.slice(0, 10).split("-");
  return p.length >= 3 ? `${Number(p[1])}/${Number(p[2])}` : d;
};

// ───────────────────────────────────────────────────────
// 40a: 2つの「分ける」を区別する
// ───────────────────────────────────────────────────────

const KINDS = [
  {
    key: "cost" as const,
    icon: Layers,
    name: "費用を分け合う",
    tag: "いまの形",
    what: "1社が払い、かかった費用を複数の案件で分けます。社内の原価配分の話です。",
    entry: "案件 ＞ お金 ＞「他の案件と分け合う」",
    rows: [
      ["払う会社", "1社"],
      ["請求書", "1枚"],
      ["分けるもの", "費用（原価）"],
      ["分ける先", "案件（社内）"],
    ],
  },
  {
    key: "joint" as const,
    icon: Users,
    name: "合同案件",
    tag: "こちらで作ります",
    what: "1回のイベントを複数社で開き、総額を分けて各社に請求します。お金を受け取る側の話です。",
    entry: "お金 ＞ 合同案件",
    rows: [
      ["払う会社", "参加した社数（例 9社）"],
      ["請求書", "参加社数ぶん（例 9枚）"],
      ["分けるもの", "総額（売上）"],
      ["分ける先", "会社（社外）"],
    ],
  },
];

function KindPicker({ onPick }: { onPick: (k: "cost" | "joint") => void }) {
  return (
    <section className="rounded-2xl border border-divider bg-card p-4 sm:p-6">
      <h2 className="text-base font-bold">どちらの「分ける」ですか？</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        見分け方は<strong>「請求書が何枚出るか」</strong>です。1枚なら左、参加社数ぶんなら右。
        同じ画面に混ぜると必ず間違えるので、先に選んでください。
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {KINDS.map((k) => {
          const Icon = k.icon;
          const isJoint = k.key === "joint";
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => onPick(k.key)}
              className={`min-h-[44px] rounded-xl border p-4 text-left transition ${
                isJoint
                  ? "border-primary bg-primary/5 hover:bg-primary/10"
                  : "border-divider bg-muted/40 hover:bg-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${isJoint ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
                <span className="font-bold">{k.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  isJoint ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}>{k.tag}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{k.what}</p>
              <dl className="mt-3 space-y-1 text-sm">
                {k.rows.map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-2 border-t border-row pt-1">
                    <dt className="text-muted-foreground">{l}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">画面の入口：{k.entry}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────
// 一覧 + つくる
// ───────────────────────────────────────────────────────

export default function JointEventsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("budget", "editor");

  const [kind, setKind] = useState<"cost" | "joint" | null>(null);
  const [form, setForm] = useState({
    name: "", event_start: "", organizer_customer_id: "",
    payment_due_date: "", total_amount: "",
  });
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: any[] }>({
    queryKey: ["joint-events"],
    queryFn: async () => (await api.get("/joint-events")).data,
  });

  const { data: custData } = useQuery<{ data: any[] }>({
    queryKey: ["customers-for-joint"],
    // 顧客の一覧 (/customers) は sales 権限。経理は読めないので合同案件側の口を使う
    queryFn: async () => (await api.get("/joint-events/companies")).data,
    enabled: kind === "joint",
  });
  const customers = useMemo(() => custData?.data ?? [], [custData]);

  const createMutation = useMutation({
    mutationFn: async () =>
      (await api.post("/joint-events", {
        name: form.name,
        event_start: form.event_start || null,
        organizer_customer_id: form.organizer_customer_id,
        company_ids: [...picked],
        payment_due_date: form.payment_due_date || null,
        total_amount: Number(form.total_amount || 0),
      })).data,
    onSuccess: async (res: any) => {
      await qc.invalidateQueries({ queryKey: ["joint-events"] });
      setNotice({
        tone: "success",
        title: `${picked.size}社ぶんの案件をつくりました`,
        description: "分け方を確かめてから請求書を出してください。",
      });
      navigate(`/finance/joint/${res.data.id}`);
    },
    onError: (e: any) => setNotice({
      tone: "error", title: e?.response?.data?.error?.message ?? "つくれませんでした",
    }),
  });

  if (isLoading) return <div className="p-4"><SkeletonCard /></div>;
  if (isError) {
    return (
      <div className="p-4">
        <ErrorPanel title="合同案件を読めませんでした" error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const events = data?.data ?? [];
  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <NoticeBar />

      <header>
        <h1 className="text-xl font-bold">合同案件</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          1回のイベントを複数社で開き、費用を分けて<strong>各社に請求書を出します</strong>。
          会社を選べば案件は自動でできるので、9社ぶんを手で作る必要はありません。
        </p>
      </header>

      {canEdit && kind === null && (
        <Button className="gap-1" onClick={() => setKind("cost")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          合同案件をつくる
        </Button>
      )}

      {kind === "cost" && (
        <>
          <KindPicker onPick={(k) => setKind(k)} />
          {/* 左を選んだときは既存の費用分けへ送る。ここでは作らない */}
          <p className="text-sm text-muted-foreground">
            「費用を分け合う」を選ぶと、案件の中の「他の案件と分け合う」へ行きます。
            <Button variant="link" className="h-auto p-0 pl-1" onClick={() => navigate("/projects")}>
              案件をさがす
            </Button>
          </p>
        </>
      )}

      {kind === "joint" && (
        <section className="rounded-2xl border border-divider bg-card p-4 sm:p-6">
          <h2 className="text-base font-bold">1 会社を選ぶ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            選んだ会社の数だけ案件が自動でできます。幹事（取りまとめる会社）も参加する会社に含めてください。
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">イベント名</span>
              <Input className="mt-1" value={form.name} placeholder="2026年 定時株主総会"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">実施日</span>
              <Input className="mt-1" type="date" value={form.event_start}
                onChange={(e) => setForm({ ...form, event_start: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">総額（税抜）</span>
              <Input className="mt-1" type="number" inputMode="numeric" value={form.total_amount}
                placeholder="8597278"
                onChange={(e) => setForm({ ...form, total_amount: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">支払期日</span>
              <Input className="mt-1" type="date" value={form.payment_due_date}
                onChange={(e) => setForm({ ...form, payment_due_date: e.target.value })} />
            </label>
          </div>

          <h3 className="mt-5 text-sm font-bold">費用を分け合う会社（{picked.size}社）</h3>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-divider">
            {customers.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">会社を読み込んでいます…</p>
            )}
            {customers.map((c: any) => (
              <label key={c.id}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-row px-3 py-2 last:border-0 hover:bg-muted/40">
                <span className="-m-2 flex min-h-[44px] min-w-[44px] items-center justify-center p-2">
                  <input type="checkbox" className="h-[22px] w-[22px]" checked={picked.has(c.id)}
                    onChange={() => toggle(c.id)} aria-label={`${c.name} を参加する会社にする`} />
                </span>
                <span className="flex-1 text-sm">{c.name}</span>
                <span className="flex min-h-[44px] items-center">
                  <input type="radio" name="organizer" className="h-[18px] w-[18px]"
                    checked={form.organizer_customer_id === c.id}
                    onChange={() => setForm({ ...form, organizer_customer_id: c.id })}
                    aria-label={`${c.name} を幹事にする`} />
                  <span className="pl-1 text-xs text-muted-foreground">幹事</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={createMutation.isPending || picked.size < 2 || !form.name || !form.organizer_customer_id}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {picked.size || 0}社ぶんの案件をつくる
            </Button>
            <Button variant="ghost" onClick={() => { setKind(null); setPicked(new Set()); }}>やめる</Button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-divider bg-card">
        <h2 className="border-b border-divider p-4 text-base font-bold">いまある合同案件</h2>
        {events.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Users className="h-6 w-6" aria-hidden="true" />} title="まだありません"
              description="「合同案件をつくる」から、参加する会社を選んでください。" />
          </div>
        ) : (
          <ul>
            {events.map((e: any) => (
              <li key={e.id} className="border-b border-row last:border-0">
                <button type="button" onClick={() => navigate(`/finance/joint/${e.id}`)}
                  className="flex min-h-[44px] w-full flex-wrap items-center gap-x-3 gap-y-1 p-4 text-left hover:bg-muted/40">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-sm text-muted-foreground">{Number(e.company_count)}社で分ける</span>
                  {e.event_start && <span className="text-sm text-muted-foreground">実施 {md(e.event_start)}</span>}
                  <span className="text-sm text-muted-foreground">幹事 {e.organizer_name}</span>
                  <span className="ml-auto text-sm">
                    {Number(e.issued_count) > 0
                      ? <span className="text-positive">{Number(e.issued_count)}枚 出しました</span>
                      : <span className="text-muted-foreground">まだ出していません</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────
// 40b: 合同案件の中身
// ───────────────────────────────────────────────────────

export function JointEventDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("budget", "editor");

  const [draft, setDraft] = useState<Record<string, string>>({});

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: JointDetail }>({
    queryKey: ["joint-event", id],
    queryFn: async () => (await api.get(`/joint-events/${id}`)).data,
  });
  const ev = data?.data;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["joint-event", id] });
  const onError = (e: any) => setNotice({
    tone: "error", title: e?.response?.data?.error?.message ?? "できませんでした",
  });

  const saveMutation = useMutation({
    mutationFn: async (body: any) => (await api.put(`/joint-events/${id}`, body)).data,
    onSuccess: async () => { setDraft({}); await invalidate(); },
    onError,
  });
  const absorbMutation = useMutation({
    mutationFn: async (body: any) => (await api.post(`/joint-events/${id}/absorb`, body)).data,
    onSuccess: async () => { await invalidate(); setNotice({ tone: "success", title: "合計を総額に合わせました" }); },
    onError,
  });
  const issueMutation = useMutation({
    mutationFn: async () => (await api.post(`/joint-events/${id}/issue`)).data,
    onSuccess: async (res: any) => {
      await invalidate();
      setNotice({
        tone: "success",
        title: `${res.data.count}枚の請求書を出しました`,
        description: "「請求のしごと」の入金待ちに並びます。送るのは自分のメールです（ONAiR は送りません）。",
      });
    },
    onError,
  });
  const cancelMutation = useMutation({
    mutationFn: async (v: { companyId: string; redistribute: string }) =>
      (await api.post(`/joint-events/${id}/companies/${v.companyId}/cancel`, { redistribute: v.redistribute })).data,
    onSuccess: async () => {
      await invalidate();
      setNotice({
        tone: "success", title: "1社を外しました",
        description: "出した請求書は消せないので、取り消しの請求書を1枚出しました。履歴に残ります。",
      });
    },
    onError,
  });

  if (isLoading) return <div className="p-4"><SkeletonCard /></div>;
  if (isError || !ev) {
    return (
      <div className="p-4">
        <ErrorPanel title="合同案件を読めませんでした" error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  const active = ev.companies.filter((c) => !c.cancelled_at);
  const remainderRow =
    active.find((c) => c.customer_id === (ev.remainder_customer_id ?? ev.organizer_customer_id)) ?? active[0];
  const hasRemainder = ev.total_amount % Math.max(1, active.length) !== 0 && ev.split_mode !== "manual";
  const steps = ["会社を選ぶ", "総額を入れる", "分け方を選ぶ", "確認して出す"];
  const currentStep = ev.issued_at ? 4 : ev.total_amount > 0 ? 3 : 2;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <NoticeBar />

      {/* スマホではパンくずを並べず、44px の戻る1つにする */}
      <Button variant="ghost" size="sm" className="min-h-[44px] gap-1 sm:hidden" onClick={() => navigate("/finance/joint")}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        合同案件へ戻る
      </Button>
      <nav className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex" aria-label="いまいる場所">
        <button className="hover:underline" onClick={() => navigate("/finance")}>お金</button>
        <span aria-hidden="true">＞</span>
        <button className="hover:underline" onClick={() => navigate("/finance/joint")}>合同案件</button>
      </nav>

      <header>
        <h1 className="text-xl font-bold">{ev.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {active.length}社で分ける
          {ev.event_start && <> ・ 実施 {md(ev.event_start)}</>}
          {" "}・ 幹事 {ev.organizer_name}
        </p>
      </header>

      {/* 4段 */}
      <ol className="flex flex-wrap gap-2" aria-label="進み具合">
        {steps.map((s, i) => {
          const on = i + 1 <= currentStep;
          return (
            <li key={s} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
              on ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>{i + 1}</span>
              {s}
            </li>
          );
        })}
      </ol>

      {/* グリッドの子は既定で min-width:auto なので、中の表 (min-w-[720px]) に
          引っ張られて画面ごと横に伸びる。min-w-0 を付けて表の中だけで横スクロールさせる。 */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {/* 総額と分け方 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">総額と分け方</h2>
            <p className="mt-1 text-sm text-muted-foreground">総額は1回だけ入れます（見積は全体で1本）。</p>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-sm font-medium">総額（税抜）</span>
                <Input className="mt-1 w-44" type="number" inputMode="numeric"
                  value={draft.total ?? String(ev.total_amount)}
                  disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, total: e.target.value })}
                  onBlur={() => draft.total !== undefined && Number(draft.total) !== ev.total_amount
                    && saveMutation.mutate({ total_amount: Number(draft.total) })} />
              </label>
              <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label="分け方">
                {(["equal", "ratio", "manual"] as const).map((m) => (
                  <button key={m} type="button" disabled={!canEdit}
                    onClick={() => saveMutation.mutate({ split_mode: m })}
                    className={`min-h-[36px] rounded-lg px-3 text-sm ${
                      ev.split_mode === m ? "bg-card font-medium shadow-sm" : "text-muted-foreground"
                    }`}>
                    {SPLIT_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            {hasRemainder && remainderRow && (
              <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
                <p>
                  総額 <Money value={ev.total_amount} className="inline-flex" /> ÷ {active.length}社。
                  <strong>{ev.total_amount % active.length}円あまります</strong>（{active.length}で割り切れません）。
                </p>
                <p className="mt-1">
                  あまりは <strong>{remainderRow.company_name}</strong> に付けます。
                  {canEdit && (
                    <select
                      className="ml-2 min-h-[36px] rounded-lg border border-divider bg-card px-2"
                      aria-label="あまりを付ける先を変える"
                      value={ev.remainder_customer_id ?? ev.organizer_customer_id}
                      onChange={(e) => saveMutation.mutate({ remainder_customer_id: e.target.value })}
                    >
                      {active.map((c) => <option key={c.id} value={c.customer_id}>{c.company_name}</option>)}
                    </select>
                  )}
                </p>
              </div>
            )}
          </section>

          {/* 各社 */}
          <section className="rounded-2xl border border-divider bg-card">
            <h2 className="border-b border-divider p-4 text-base font-bold">会社ごとの請求</h2>
            {/* スマホでは幅の広い表を出さない。
                `min-w-[720px]` の表は overflow-x-auto に入れても画面ごと横に伸びるので
                (実測 277px はみ出し)、375px では下の縦積みを出す。31章と同じ方針。 */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-divider text-left text-muted-foreground">
                    <th className="p-3 font-medium">会社 ／ 請求先</th>
                    <th className="p-3 font-medium">割合</th>
                    <th className="p-3 text-right font-medium">請求する金額</th>
                    <th className="p-3 font-medium">支払期日</th>
                    <th className="p-3 font-medium">請求書</th>
                    <th className="p-3 font-medium">入金</th>
                    {canEdit && <th className="p-3 font-medium"><span className="sr-only">操作</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {ev.companies.map((c) => (
                    <tr key={c.id} className={`border-b border-row last:border-0 ${
                      c.cancelled_at ? "opacity-55" : c.customer_id === ev.organizer_customer_id ? "bg-primary/5" : ""
                    }`}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <div>
                            <div className="font-medium">{c.company_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.customer_id === ev.organizer_customer_id && <span className="pr-1">幹事</span>}
                              {c.billing_differs && (
                                <span className="text-warning">請求先が本社と違います（{c.billing_company_name}）</span>
                              )}
                              {c.cancelled_at && <span className="text-negative">取り消し済み{c.cancel_billing_key ? `（${c.cancel_billing_key}）` : ""}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 tabular-nums">{c.ratio_percent}%</td>
                      <td className="p-3 text-right">
                        {canEdit && !c.revenue_id && !c.cancelled_at ? (
                          <Input className="ml-auto w-32 text-right" type="number" inputMode="numeric"
                            value={draft[c.id] ?? String(c.amount)}
                            aria-label={`${c.company_name} の請求する金額`}
                            onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
                            onBlur={() => draft[c.id] !== undefined && Number(draft[c.id]) !== c.amount
                              && saveMutation.mutate({ split_mode: "manual", entries: [{ id: c.id, amount: Number(draft[c.id]) }] })} />
                        ) : (
                          <Money value={c.amount} className="justify-end" />
                        )}
                      </td>
                      <td className="p-3">{md(c.payment_due_date ?? ev.payment_due_date)}</td>
                      <td className="p-3">
                        {c.cancelled_at ? <span className="text-muted-foreground">—</span>
                          : c.billing_key ? <span className="text-positive">{c.billing_key}</span>
                          : c.billing_differs ? <span className="text-warning">確認して</span>
                          : <span className="text-muted-foreground">出せる</span>}
                      </td>
                      <td className="p-3">
                        {c.paid_at ? <span className="text-positive">入金済み</span>
                          : c.billing_key ? <span className="text-muted-foreground">待ち</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      {canEdit && (
                        <td className="p-3">
                          {!c.cancelled_at && c.customer_id !== ev.organizer_customer_id && (
                            <Button variant="ghost" size="sm" className="min-h-[44px] gap-1 text-negative"
                              disabled={cancelMutation.isPending}
                              onClick={() => cancelMutation.mutate({ companyId: c.id, redistribute: "others" })}>
                              <X className="h-4 w-4" aria-hidden="true" />
                              外す
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-divider font-medium">
                    <td className="p-3">合計</td>
                    <td className="p-3 tabular-nums">100%</td>
                    <td className="p-3 text-right"><Money value={ev.totals.sum} className="justify-end" /></td>
                    <td className="p-3" colSpan={canEdit ? 4 : 3}>
                      {ev.totals.matches
                        ? <span className="text-positive">総額と一致</span>
                        : <span className="text-negative">
                            総額と {formatCurrency(Math.abs(ev.totals.diff))} {ev.totals.diff > 0 ? "多い" : "少ない"}
                          </span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* スマホ: 1社 = 1カード。表の列を上から順に並べる */}
            <ul className="lg:hidden">
              {ev.companies.map((c) => (
                <li key={c.id} className={`border-b border-row p-4 last:border-0 ${
                  c.cancelled_at ? "opacity-55" : c.customer_id === ev.organizer_customer_id ? "bg-primary/5" : ""
                }`}>
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.company_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.customer_id === ev.organizer_customer_id && <span className="pr-1">幹事</span>}
                        {c.billing_differs && (
                          <span className="text-warning">請求先が本社と違います（{c.billing_company_name}）</span>
                        )}
                        {c.cancelled_at && (
                          <span className="text-negative">取り消し済み{c.cancel_billing_key ? `（${c.cancel_billing_key}）` : ""}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">請求する金額</dt>
                      <dd><Money value={c.amount} /></dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">割合</dt>
                      <dd className="tabular-nums">{c.ratio_percent}%</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">支払期日</dt>
                      <dd>{md(c.payment_due_date ?? ev.payment_due_date)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">請求書</dt>
                      <dd>
                        {c.cancelled_at ? "—"
                          : c.billing_key ? <span className="text-positive">{c.billing_key}</span>
                          : c.billing_differs ? <span className="text-warning">確認して</span>
                          : "出せる"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">入金</dt>
                      <dd>
                        {c.paid_at ? <span className="text-positive">入金済み</span>
                          : c.billing_key ? "待ち" : "—"}
                      </dd>
                    </div>
                  </dl>
                  {canEdit && !c.cancelled_at && c.customer_id !== ev.organizer_customer_id && (
                    <Button variant="ghost" size="sm" className="mt-1 min-h-[44px] gap-1 text-negative"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate({ companyId: c.id, redistribute: "others" })}>
                      <X className="h-4 w-4" aria-hidden="true" />
                      外す
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between gap-2 border-t border-divider p-4 font-medium lg:hidden">
              <span>合計</span>
              <span className="text-right">
                <Money value={ev.totals.sum} className="justify-end" />
                <span className={`block text-xs ${ev.totals.matches ? "text-positive" : "text-negative"}`}>
                  {ev.totals.matches
                    ? "総額と一致"
                    : `総額と ${formatCurrency(Math.abs(ev.totals.diff))} ${ev.totals.diff > 0 ? "多い" : "少ない"}`}
                </span>
              </span>
            </div>

            {!ev.totals.matches && canEdit && (
              <div className="border-t border-divider p-4">
                <p className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  合計が総額に合っていないので、まだ請求書を出せません。差額の始末を選んでください。
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="min-h-[44px]"
                    onClick={() => absorbMutation.mutate({ company_id: active[active.length - 1]?.id, how: "others" })}>
                    残りの社で割り直す
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-[44px]"
                    onClick={() => absorbMutation.mutate({ company_id: active[active.length - 1]?.id, how: "organizer" })}>
                    幹事に寄せる
                  </Button>
                </div>
              </div>
            )}

            {canEdit && (
              <div className="border-t border-divider p-4">
                {/* 全社ぶん出し終わったら「0社ぶんの請求書を出す」ではなく済んだと言う */}
                {active.every((c) => c.revenue_id) ? (
                  <p className="flex items-center gap-2 text-sm text-positive">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {active.length}社ぶんの請求書は出し終わっています。入金は「請求のしごと」で確かめられます。
                  </p>
                ) : (
                  <Button
                    disabled={!ev.totals.matches || issueMutation.isPending}
                    onClick={() => issueMutation.mutate()}
                  >
                    {issueMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                    {active.filter((c) => !c.revenue_id).length}社ぶんの請求書を出す
                  </Button>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  出した請求書は消せません。1社抜けたときは取り消しの請求書を1枚出して、残りの社に配り直します。
                </p>
              </div>
            )}
          </section>
        </div>

        {/* 全体の数字 */}
        <aside className="space-y-4">
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">全体の数字</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">売上（{active.length}社合計・税抜）</dt>
                <dd className="font-bold"><Money value={ev.totals.revenue} /></dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">仕入</dt>
                <dd><Money value={ev.totals.purchase} /></dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t border-row pt-2">
                <dt className="text-muted-foreground">粗利</dt>
                <dd className="text-lg font-bold text-positive"><Money value={ev.totals.gross} /></dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">粗利率</dt>
                <dd className="font-bold text-positive tabular-nums">{ev.totals.gross_margin}%</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              1社ぶんだけ見ても全体が分かりません。合同案件の粗利はここで見ます。
            </p>
          </section>

          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">決めたこと</h2>
            <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />会社を選ぶと、その社数ぶんの案件が自動でできます。</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />金額は税抜で持ちます。消費税と支払額は表示のときに足します。</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />あまりは幹事に付けます。付ける先は画面で変えられます。</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />請求書の番号は1枚ごとに採ります。9枚出せば9本です。</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />出した請求書は消せません。取り消しは1枚出して履歴に残します。</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
