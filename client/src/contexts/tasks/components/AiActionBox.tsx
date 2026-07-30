// 投入欄「AIに投げる」— 読んだ内容を **ONAiR のどの操作にするか** まで提案する。
//
// ── なぜ作り替えたか ──────────────────────────────────────
//
// 前の投入欄はタスクしか作れなかった。実際に投げられる文には
// 「A社から新規の相談が来た」「9/10 のスタジオを押さえたい」「見積を出したい」が
// 混ざっているのに、そのうちタスクに見える部分だけが残り、残りは要約すら残らず
// 落ちていた。読んだ内容を案件・見積・お客様・予約・活動記録・議事録まで含めた
// 「行動案」にして、人が確認してから実行する。
//
// ── 決めごと ─────────────────────────────────────────────
//
//  - **押すまで何も起きない。** 提案を作るだけでは 1 件も書き込まれない。
//  - 既定チェックは **足りないものが無く、取り消せない操作でもないときだけ ON**。
//    GLS 発番 (番号を1本使う) は必ず OFF から始まる。
//  - **読み取れなかった項目は隠さない。** 橙の印を出し、埋まるまで実行させない。
//  - **AI が読んだ内容の要約は行動案が 0 件でも残す** (投げた文が消えないように)。
//  - AI の接続が無い環境では、この箱は出さず従来のタスク投入欄に戻す
//    (「どの操作にするか」は規則では決められないので、できるふりをしない)。

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { invalidateSchedule } from "@/lib/scheduleQueries";
import { buildBookingTitle } from "@gmo-onair/shared/src/booking/bookingTitle";
import api from "@/lib/api";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import { Money } from "@gmo-onair/shared/src/client/ui";
import { TaskIntakeBox } from "./TaskIntakeBox";
import {
  Send, Loader2, Check, AlertTriangle, Sparkles, X, Info, ExternalLink, Clock,
} from "lucide-react";

// ── 型 ──────────────────────────────────────────────────────

type ActionKind =
  | "create_task" | "create_project" | "create_customer" | "change_project_stage"
  | "issue_gls" | "create_estimate" | "create_studio_booking" | "create_activity_log"
  | "record_inquiry" | "upsert_meeting_minutes" | "append_project_note";

interface EstimateItem {
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  cost_amount: number;
  category: string | null;
}

interface ActionDraft {
  action_key: string;
  kind: ActionKind;
  title: string;
  text: string | null;
  customer_id: string | null;
  customer_name: string | null;
  project_id: string | null;
  project_ref: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  due_at: string | null;
  date: string | null;
  date_end: string | null;
  amount: number;
  stage: string | null;
  gls_category: "A" | "B" | null;
  activity_type: string | null;
  next_action: string | null;
  next_action_date: string | null;
  importance: number;
  urgency: number;
  estimate_items: EstimateItem[];
  minutes_decisions: string[];
  quote: string | null;
  confidence: number;
  asks: string[];
  suggested_default: boolean;
  /** 同じ投入の中で先に作るお客様 / 案件を使う (まだ id が無いので選ばせない) */
  from_previous_customer: boolean;
  from_previous_project: boolean;
}

interface PlanContext {
  users: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  projects: { id: string; name: string; gls_number: string | null; customer_name: string | null; stage: string }[];
  rooms: { id: string; name: string }[];
}

interface PlanResponse {
  id: string;
  raw_text: string;
  summary: string | null;
  actions: ActionDraft[] | null;
  skipped?: { line: string; reason: string }[];
  context: PlanContext;
}

interface ActionResult {
  action_key: string;
  kind: ActionKind;
  ok: boolean;
  message: string;
  error?: string;
  link?: string;
}

interface CatalogEntry {
  kind: ActionKind;
  label: string;
  effects: string[];
  requires: string[];
  opt_out: boolean;
}

interface Row extends ActionDraft {
  checked: boolean;
}

// ── 表示用の語彙 ─────────────────────────────────────────────

const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "neta", label: "ネタ" },
  { value: "d_hold", label: "仮押さえ" },
  { value: "c_proposal", label: "見積提案" },
  { value: "b_verbal", label: "口頭決定" },
  { value: "a_won", label: "受注" },
  { value: "s_completed", label: "完了" },
  { value: "e_lost", label: "失注" },
];

const ACTIVITY_OPTIONS: { value: string; label: string }[] = [
  { value: "visit", label: "訪問" },
  { value: "meeting", label: "打合せ" },
  { value: "call", label: "電話" },
  { value: "email", label: "メール" },
  { value: "other", label: "その他" },
];

/** 何を投げていいのか迷わせない */
const EXAMPLES = ["朝会のメモ", "口で言われた依頼", "議事録", "お客様からのメール"];

/** AI が投入文に対してやっていること。読み取り中に何をしているか見せる */
const READING_STEPS = [
  "何の話かを読んでいます",
  "ONAiR のどの操作になるかを選んでいます",
  "お客様・案件・担当者を照らし合わせています",
  "読み取れなかったところを「聞くこと」にまとめています",
];

/** その操作に「名前」の欄を出すか */
const SHOWS_TITLE: ActionKind[] = [
  "create_task", "create_project", "create_customer", "create_activity_log",
  "create_studio_booking", "record_inquiry",
];

/** その操作で案件を指す必要があるか */
const NEEDS_PROJECT: ActionKind[] = [
  "change_project_stage", "issue_gls", "create_estimate", "append_project_note",
];

function toLocalInput(v?: string | null): string {
  return v ? v.replace(" ", "T").slice(0, 16) : "";
}
function fromLocalInput(v: string): string | null {
  return v ? v.replace("T", " ").slice(0, 16) : null;
}

function itemsTotal(items: EstimateItem[]): number {
  return items.reduce((s, it) => s + Math.round((Number(it.unit_price) || 0) * (Number(it.quantity) || 0)), 0);
}

// ══════════════════════════════════════════════════════════════

export function AiActionBox() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"freeform" | "minutes" | "mail">("freeform");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ActionResult[] | null>(null);
  /** 読んだが操作が 1 件も出なかったとき。投げた文と要約は残す */
  const [nothing, setNothing] = useState<PlanResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // カタログ (名札と「何が起きるか」)。AI が未設定かどうかもここで分かる
  const { data: catalogData, isLoading: catalogLoading } = useQuery({
    queryKey: ["ai-actions-catalog"],
    queryFn: async () => (await api.get("/dailyops/ai/actions/catalog")).data.data as
      { kinds: CatalogEntry[]; ai_configured: boolean },
    staleTime: 10 * 60_000,
  });
  const catalog = useMemo(() => {
    const m = new Map<ActionKind, CatalogEntry>();
    for (const c of catalogData?.kinds ?? []) m.set(c.kind, c);
    return m;
  }, [catalogData]);

  const ctx = plan?.context ?? nothing?.context;

  const planMutation = useMutation({
    mutationFn: async () => {
      abortRef.current = new AbortController();
      return (await api.post(
        "/dailyops/ai/actions/plan",
        { raw_text: text, kind },
        { signal: abortRef.current.signal },
      )).data.data as PlanResponse;
    },
    onSuccess: (data) => {
      setError(null);
      const actions = data.actions ?? [];
      if (actions.length === 0) {
        setNothing(data);
        return;
      }
      setPlan(data);
      setRows(actions.map((a) => ({ ...a, checked: a.suggested_default })));
    },
    onError: (e: unknown) => {
      const err = e as { code?: string; name?: string; response?: { data?: { error?: { message?: string } } } };
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return; // 自分で止めた
      setError(err?.response?.data?.error?.message ?? "読み取りが終わりませんでした。もう一度お試しください");
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const chosen = rows.filter((r) => r.checked).map(({ checked: _checked, ...a }) => a);
      return (await api.post(`/dailyops/ai/actions/plans/${plan!.id}/execute`, { actions: chosen }))
        .data.data as { results: ActionResult[] };
    },
    onSuccess: (data) => {
      setResults(data.results);
      clearAfterRun();
      // 案件・タスク・予定・お客様のどれが増えたか分からないので広めに捨てる
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      invalidateSchedule(qc, "studio", "personal", "partner");
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setError(err?.response?.data?.error?.message ?? "実行できませんでした");
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      const id = plan?.id ?? nothing?.id;
      return (await api.post(`/dailyops/ai/actions/plans/${id}/discard`, {})).data.data;
    },
    onSuccess: () => {
      setResults([{ action_key: "-", kind: "create_task", ok: true, message: "提案を破棄しました（投げた文はそのまま残しています）" }]);
      // 破棄は「この提案が違った」という意味なので、**投げた文は残す** (書き直して投げ直せる)
      closeAll();
    },
  });

  /**
   * 確認をとじる。
   *
   * **投げた文は消さない** (v3.1.0)。v3.0.11 までここで `setText("")` していたため、
   * 確認の画面を Esc で閉じた / 外を押した時点で**貼った文が消えて二度と戻せなかった**。
   * 議事録やメールを貼ってから閉じてしまうと、もう一度どこかから探して貼り直すことになる。
   * 登録が済んだときだけ空にする (`clearAfterRun`)。
   */
  function closeAll() {
    setPlan(null);
    setNothing(null);
    setRows([]);
    setError(null);
  }

  /** 登録まで終わったので投入欄も空にする */
  function clearAfterRun() {
    closeAll();
    setText("");
  }

  const cancelReading = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    planMutation.reset();
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.action_key === key ? { ...r, ...patch } : r)));

  const checkedRows = rows.filter((r) => r.checked);

  /**
   * 実行を止める条件。**足りないものがあるまま実行させない。**
   * サーバーでも同じ前提で止まるが、押してから怒られるのは体験として悪い。
   */
  const blockers = useMemo(() => {
    const out: string[] = [];
    // 「先に作るものを使う」提案は、その作る提案のチェックが外れると実行できない。
    // 押してから失敗するのが一番分かりにくいので、ここで止めて理由を出す。
    const willCreateCustomer = checkedRows.some((r) => r.kind === "create_customer");
    const willCreateProject = checkedRows.some((r) => r.kind === "create_project");

    for (const r of checkedRows) {
      const spec = catalog.get(r.kind);
      const name = spec?.label ?? r.kind;
      const requires = spec?.requires ?? [];
      const hasCustomer = !!r.customer_id || (r.from_previous_customer && willCreateCustomer);
      const hasProject = !!r.project_id || (r.from_previous_project && willCreateProject);

      if (r.from_previous_customer && !r.customer_id && !willCreateCustomer && requires.includes("customer_id")) {
        out.push(`「${name}」は先につくるお客様を使う提案です。「お客様を登録する」も一緒に実行するか、お客様を選んでください`);
      }
      if (r.from_previous_project && !r.project_id && !willCreateProject && requires.includes("project_id")) {
        out.push(`「${name}」は先につくる案件を使う提案です。「案件をつくる」も一緒に実行するか、案件を選んでください`);
      }
      if (requires.includes("title") && !r.title.trim()) out.push(`「${name}」の名前を入れてください`);
      if (requires.includes("customer_id") && !hasCustomer && !r.from_previous_customer) out.push(`「${name}」のお客様を選んでください`);
      if (requires.includes("customer_name") && !(r.customer_name ?? "").trim()) out.push(`「${name}」のお客様の名前を入れてください`);
      if (requires.includes("project_id") && !hasProject && !r.from_previous_project) out.push(`「${name}」の案件を選んでください`);
      if (requires.includes("assignee_id") && !r.assignee_id) out.push(`「${name}」の担当者を選んでください`);
      if (requires.includes("gls_category") && !r.gls_category) out.push(`「${name}」の案件分類を選んでください`);
      if (requires.includes("stage") && !r.stage) out.push(`「${name}」でどのステージにするかを選んでください`);
      if (requires.includes("date") && !r.date) out.push(`「${name}」の日付を入れてください`);
      if (requires.includes("activity_type") && !r.activity_type) out.push(`「${name}」の種別を選んでください`);
      if (requires.includes("text") && !(r.text ?? "").trim()) out.push(`「${name}」の内容を入れてください`);
      if (requires.includes("estimate_items") && r.estimate_items.length === 0) out.push(`「${name}」の明細がありません`);
    }
    return Array.from(new Set(out));
  }, [checkedRows, catalog]);

  // AI の接続が無い環境では、できるふりをせず従来のタスク投入欄に戻す
  if (!catalogLoading && catalogData && !catalogData.ai_configured) {
    return <TaskIntakeBox />;
  }

  return (
    <>
      {/* ── 投入欄 ── */}
      <div className="rounded-xl border border-ai-border bg-ai-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-foreground">AIに投げる</p>
            <p className="mt-0.5 text-[12px] text-secondary-foreground">
              議事録でも、お客様からのメールでも、口で言われたことでも、そのまま貼ってください。
              タスクだけでなく<span className="font-bold text-foreground">案件・見積・お客様・スタジオの仮押さえ・やり取りの記録</span>
              まで、ONAiR のどれにするかを提案します。押すまでは何も登録されません。
            </p>
          </div>
          <div className="ml-auto inline-flex shrink-0 rounded-lg border border-border bg-card p-0.5">
            {([["freeform", "ひとこと"], ["minutes", "議事録"], ["mail", "メール"]] as const).map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                onClick={() => setKind(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  kind === v ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
                aria-pressed={kind === v}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setResults(null); }}
          rows={kind === "freeform" ? 3 : 6}
          className="mt-2 resize-y bg-background text-sm"
          placeholder={
            kind === "freeform"
              ? "例）A社から9/10の配信の相談。スタジオを仮で押さえて、山田さんに明日18時までに見積の下書きをお願いした"
              : "会議のメモ・メールの本文をそのまま貼ってください。\n・B社の件、口頭で決まった\n・9/20 リハ、9/21 本番でワールドスタジオを押さえる\n・方針は A 案で進めることに決定（← 決定事項は操作にしません）"
          }
        />

        <p className="mt-1.5 text-[12px] text-muted-foreground">
          期限や日付は<span className="font-bold text-foreground">何月何日何時何分まで</span>で書くとそのまま入ります。
          「今週中」のような曖昧な書き方は、AIが勝手に日付を決めずに聞いてきます。
          <span className="sm:hidden">キーボードの音声入力（マイク）でそのまま話しても入ります。</span>
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted-foreground">こんなものを:</span>
          <ul className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((e) => (
              <li key={e} className="rounded-full border border-border bg-card px-2 py-0.5 text-[12px] text-secondary-foreground">
                {e}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            className="ml-auto min-h-tap gap-1.5"
            disabled={!text.trim() || planMutation.isPending}
            onClick={() => planMutation.mutate()}
          >
            {planMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Send className="h-4 w-4" aria-hidden="true" />}
            AIに振り分けてもらう
          </Button>
        </div>

        {/* 読んでいる (何をしているか見せる・止められる) */}
        {planMutation.isPending && (
          <div role="status" className="mt-2.5 rounded-control border border-ai-border bg-card px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" aria-hidden="true" />
              AIが読んでいます
            </p>
            <p className="mt-0.5 text-[12px] text-secondary-foreground">
              終わったら確認の画面が出ます。ここで止めても投げた文は残ります。
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {READING_STEPS.map((s) => (
                <li key={s} className="flex items-start gap-1.5 text-[12px] text-secondary-foreground">
                  <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ai" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" variant="outline" className="mt-2 h-ctl-2" onClick={cancelReading}>
              やめる
            </Button>
          </div>
        )}

        {/* 操作が 1 件も出なかった (読んだ内容は捨てない) */}
        {nothing && (
          <div className="mt-2.5 rounded-control border border-warning/35 bg-warning-surface px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning-strong" aria-hidden="true" />
              ONAiR に登録するものは見つかりませんでした
            </p>
            {nothing.summary && (
              <p className="mt-1 text-[12px] leading-relaxed text-foreground">
                AIが読んだ内容: {nothing.summary}
              </p>
            )}
            <p className="mt-1 text-[12px] text-secondary-foreground">
              投げた文はそのまま記録に残してあります。操作にしたいものがあれば、
              誰に何をいつまでにするのかを足して投げ直してください。
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button" size="sm" variant="outline" className="min-h-tap"
                disabled={discardMutation.isPending}
                onClick={() => discardMutation.mutate()}
              >
                投げた文だけ残す
              </Button>
            </div>
          </div>
        )}

        {error && !plan && !nothing && (
          <p className="mt-2 text-[13px] font-bold text-destructive">{error}</p>
        )}

        {/* ── 実行結果 ── */}
        {results && results.length > 0 && (
          <div className="mt-2.5 rounded-control border border-border bg-card px-3 py-2.5">
            <p className="text-[13px] font-bold text-foreground">
              {results.filter((r) => r.ok).length} 件を実行しました
              {results.some((r) => !r.ok) && (
                <span className="ml-1 text-warning-strong">
                  / {results.filter((r) => !r.ok).length} 件はできませんでした
                </span>
              )}
            </p>
            <ul className="mt-1.5 space-y-1">
              {results.map((r) => (
                <li key={r.action_key} className="flex flex-wrap items-start gap-1.5 text-[12px]">
                  {r.ok
                    ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                    : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" aria-hidden="true" />}
                  <span className="text-foreground">{r.message}</span>
                  {r.error && <span className="text-warning-strong">— {r.error}</span>}
                  {r.ok && r.link && (
                    <a href={r.link} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      ひらく<ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" variant="ghost" className="mt-1.5 h-ctl-2" onClick={() => setResults(null)}>
              閉じる
            </Button>
          </div>
        )}
      </div>

      {/* ── 確認モーダル ── */}
      <Dialog open={!!plan} onOpenChange={(o) => { if (!o) closeAll(); }}>
        <DialogContent
          className="grid-cols-1 sm:max-w-[min(96vw,1100px)] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              <span>{rows.length} 件の提案があります。実行しますか？</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ai-border bg-ai-surface px-2 py-0.5 text-[11px] font-bold text-ai">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                AIの提案
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/35 bg-warning-surface px-2 py-0.5 text-[11px] font-bold text-warning-strong">
                <Clock className="h-3 w-3" aria-hidden="true" />
                確認待ち
              </span>
            </DialogTitle>
            {plan?.summary && (
              <p className="text-[13px] text-foreground">AIが読んだ内容: {plan.summary}</p>
            )}
            <p className="text-[13px] text-secondary-foreground">
              「この内容で実行する」を押すまで、1件も登録されません。
              <span className="font-bold text-warning-strong">オレンジの印</span>は読み取れなかったところです。
            </p>
          </DialogHeader>

          <ul className="space-y-2.5">
            {rows.map((r) => (
              <ActionRow
                key={r.action_key}
                row={r}
                spec={catalog.get(r.kind)}
                ctx={ctx}
                onChange={(patch) => update(r.action_key, patch)}
              />
            ))}
          </ul>

          {/* 操作にしなかった行 (決定事項など) を見せる */}
          {plan?.skipped && plan.skipped.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                操作にしなかった行（記録には残ります）
              </p>
              <ul className="mt-1 space-y-0.5">
                {plan.skipped.map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground">{s.line}</span>
                    <span className="ml-1.5">— {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {blockers.length > 0 && (
            <div className="rounded-lg border border-warning/35 bg-warning-surface p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-bold text-warning-strong">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                実行する前に決めてください
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-foreground">
                {blockers.map((b, i) => <li key={i}>・{b}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="text-xs font-bold text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button" variant="outline" size="sm" className="min-h-tap gap-1 text-xs"
              disabled={discardMutation.isPending}
              onClick={() => discardMutation.mutate()}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              全部いらない
            </Button>
            <Button
              type="button" size="sm" className="min-h-tap gap-1.5"
              disabled={checkedRows.length === 0 || blockers.length > 0 || executeMutation.isPending}
              onClick={() => executeMutation.mutate()}
            >
              {executeMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Check className="h-4 w-4" aria-hidden="true" />}
              この内容で実行する（{checkedRows.length} 件）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// 提案 1 件
// ══════════════════════════════════════════════════════════════

function ActionRow({
  row: r, spec, ctx, onChange,
}: {
  row: Row;
  spec: CatalogEntry | undefined;
  ctx: PlanContext | undefined;
  onChange: (patch: Partial<Row>) => void;
}) {
  const requires = spec?.requires ?? [];
  const need = (k: string) => requires.includes(k);
  const users = ctx?.users ?? [];
  const customers = ctx?.customers ?? [];
  const projects = ctx?.projects ?? [];

  /** 埋まっていない必須。橙の枠を出すのに使う */
  const missing = (filled: unknown, key: string) => need(key) && !filled && r.checked;
  /** 先に作るものを使う提案かどうか (まだ id が無いので「選んでいない」を異常にしない) */
  const chainCustomer = r.from_previous_customer && !r.customer_id;
  const chainProject = r.from_previous_project && !r.project_id;

  // スタジオ予約の名前は、案件を選んだら**予約ダイアログと同じ形の既定値**に寄せる (v3.1.2)。
  // AI は「8/12 Aスタ押さえたい」のような読み取り文をそのまま名前にしてくるが、
  // 経路ごとに題名が違うと同じ予定が二重に入っていても突き合わせられない。
  // ただし**人が打ち替えたら上書きしない**。押した結果は人が見て通したものになる。
  const [titleTouched, setTitleTouched] = useState(false);
  const bookingProjectName = projects.find((p) => p.id === r.project_id)?.name;
  useEffect(() => {
    if (r.kind !== "create_studio_booking" || titleTouched) return;
    if (!bookingProjectName) return;
    const next = buildBookingTitle({ projectName: bookingProjectName, date: r.date ?? undefined });
    if (next && next !== r.title) onChange({ title: next });
    // r.title は自分で書き換えるので依存に入れない (入れると1回の変更で止まらなくなる)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.kind, bookingProjectName, r.date, titleTouched]);

  return (
    <li
      className={cn(
        "rounded-lg border p-3 transition-colors",
        r.checked ? "border-primary/40 bg-primary/[0.02]" : "border-border bg-muted/20 opacity-70",
      )}
    >
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          aria-label={r.checked ? "実行しない" : "実行する"}
          onClick={() => onChange({ checked: !r.checked })}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
            r.checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
          )}
        >
          {r.checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          {/* 何をするか + 一緒に起きること */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-bold text-primary">
              {spec?.label ?? r.kind}
            </span>
            {spec?.opt_out && (
              <span className="rounded-full border border-destructive/40 bg-destructive-surface px-2 py-0.5 text-[11px] font-bold text-destructive">
                取り消せません
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              確からしさ {Math.round(r.confidence * 100)}%
            </span>
          </div>
          {spec && spec.effects.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              実行すると: {spec.effects.join(" / ")}
            </p>
          )}

          {/* 読み取れなかったこと */}
          {r.asks.length > 0 && (
            <ul className="space-y-0.5">
              {r.asks.map((a, i) => (
                <li key={i} className="flex items-start gap-1 text-[11px] font-medium text-warning-strong">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  {a}
                </li>
              ))}
            </ul>
          )}

          {/* 名前 */}
          {SHOWS_TITLE.includes(r.kind) && (
            <Input
              value={r.title}
              onChange={(e) => { setTitleTouched(true); onChange({ title: e.target.value }); }}
              className={cn("h-ctl-2 text-sm font-medium", missing(r.title.trim(), "title") && "border-warning")}
              placeholder={r.kind === "create_project" ? "案件名" : r.kind === "create_customer" ? "会社名" : "件名・やること"}
              aria-label="名前"
            />
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* 案件 */}
            {(NEEDS_PROJECT.includes(r.kind) || r.kind === "create_task" || r.kind === "create_activity_log" || r.kind === "create_studio_booking") && (
              <Field label={r.project_ref ? `案件（文中: ${r.project_ref}）` : "案件"}>
                <select
                  value={r.project_id ?? ""}
                  onChange={(e) => onChange({ project_id: e.target.value || null })}
                  className={cn(
                    "h-ctl-2 w-full rounded-md border bg-background px-2 text-sm",
                    missing(r.project_id, "project_id") && !chainProject ? "border-warning" : "border-input",
                  )}
                  aria-label="案件"
                >
                  <option value="">
                    {chainProject ? "（先につくる案件を使います）"
                      : need("project_id") ? "（選んでください）" : "（案件に紐づけない）"}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.gls_number ? `${p.gls_number} ` : ""}{p.name}{p.customer_name ? `（${p.customer_name}）` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {/* お客様 */}
            {(r.kind === "create_project" || r.kind === "create_activity_log") && (
              <Field label={r.customer_name ? `お客様（文中: ${r.customer_name}）` : "お客様"}>
                <select
                  value={r.customer_id ?? ""}
                  onChange={(e) => onChange({ customer_id: e.target.value || null })}
                  className={cn(
                    "h-ctl-2 w-full rounded-md border bg-background px-2 text-sm",
                    missing(r.customer_id, "customer_id") && !chainCustomer ? "border-warning" : "border-input",
                  )}
                  aria-label="お客様"
                >
                  <option value="">
                    {chainCustomer ? `（先につくるお客様${r.customer_name ? `「${r.customer_name}」` : ""}を使います）`
                      : need("customer_id") ? "（選んでください。一覧に無ければ先に「お客様を登録する」を実行）" : "（指定しない）"}
                  </option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            )}

            {/* 担当者 */}
            {r.kind === "create_task" && (
              <Field label={r.assignee_name ? `誰が（文中: ${r.assignee_name}）` : "誰が"}>
                <select
                  value={r.assignee_id ?? ""}
                  onChange={(e) => onChange({ assignee_id: e.target.value || null })}
                  className={cn(
                    "h-ctl-2 w-full rounded-md border bg-background px-2 text-sm",
                    missing(r.assignee_id, "assignee_id") ? "border-warning" : "border-input",
                  )}
                  aria-label="担当者"
                >
                  <option value="">（選んでください）</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            )}

            {/* 期限 (タスクだけ) */}
            {r.kind === "create_task" && (
              <Field label="何月何日何時何分まで">
                <Input
                  type="datetime-local"
                  value={toLocalInput(r.due_at)}
                  onChange={(e) => onChange({ due_at: fromLocalInput(e.target.value) })}
                  className="h-ctl-2 text-sm"
                  aria-label="期限"
                />
              </Field>
            )}

            {/* 日付 */}
            {(r.kind === "create_studio_booking" || r.kind === "create_activity_log"
              || r.kind === "upsert_meeting_minutes" || r.kind === "create_project"
              || r.kind === "record_inquiry") && (
              <Field label={r.kind === "create_activity_log" ? "いつのやり取りか" : r.kind === "upsert_meeting_minutes" ? "会議の日" : "日付"}>
                <Input
                  type="date"
                  value={r.date ?? ""}
                  onChange={(e) => onChange({ date: e.target.value || null })}
                  className={cn("h-ctl-2 text-sm", missing(r.date, "date") && "border-warning")}
                  aria-label="日付"
                />
              </Field>
            )}

            {/* 終了日 */}
            {(r.kind === "create_studio_booking" || r.kind === "create_project") && (
              <Field label="終わりの日（1日なら空でよい）">
                <Input
                  type="date"
                  value={r.date_end ?? ""}
                  onChange={(e) => onChange({ date_end: e.target.value || null })}
                  className="h-ctl-2 text-sm"
                  aria-label="終わりの日"
                />
              </Field>
            )}

            {/* 案件分類 */}
            {r.kind === "create_project" && (
              <Field label="案件分類">
                <div className="inline-flex rounded-md border border-input p-0.5">
                  {([["A", "スタジオを使う"], ["B", "使わない"]] as const).map(([v, lbl]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => onChange({ gls_category: v })}
                      aria-pressed={r.gls_category === v}
                      className={cn(
                        "rounded px-2 py-1 text-[11px] transition-colors",
                        r.gls_category === v ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {/* ステージ */}
            {r.kind === "change_project_stage" && (
              <Field label="どのステージにするか">
                <select
                  value={r.stage ?? ""}
                  onChange={(e) => onChange({ stage: e.target.value || null })}
                  className={cn(
                    "h-ctl-2 w-full rounded-md border bg-background px-2 text-sm",
                    missing(r.stage, "stage") ? "border-warning" : "border-input",
                  )}
                  aria-label="ステージ"
                >
                  <option value="">（選んでください）</option>
                  {STAGE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
            )}

            {/* 活動種別 */}
            {r.kind === "create_activity_log" && (
              <Field label="種別">
                <select
                  value={r.activity_type ?? ""}
                  onChange={(e) => onChange({ activity_type: e.target.value || null })}
                  className={cn(
                    "h-ctl-2 w-full rounded-md border bg-background px-2 text-sm",
                    missing(r.activity_type, "activity_type") ? "border-warning" : "border-input",
                  )}
                  aria-label="種別"
                >
                  <option value="">（選んでください）</option>
                  {ACTIVITY_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </Field>
            )}

            {/* 次にやること */}
            {r.kind === "create_activity_log" && (
              <Field label="次にやること（任意）">
                <Input
                  value={r.next_action ?? ""}
                  onChange={(e) => onChange({ next_action: e.target.value || null })}
                  className="h-ctl-2 text-sm"
                  placeholder="例）見積を送る"
                  aria-label="次にやること"
                />
              </Field>
            )}
          </div>

          {/* 本文・メモ */}
          {(r.text || need("text") || r.kind === "append_project_note" || r.kind === "record_inquiry") && (
            <Field label={r.kind === "append_project_note" ? "メモに書き足す内容" : "内容"}>
              <Textarea
                value={r.text ?? ""}
                onChange={(e) => onChange({ text: e.target.value || null })}
                rows={2}
                className={cn("resize-y text-sm", missing((r.text ?? "").trim(), "text") && "border-warning")}
                aria-label="内容"
              />
            </Field>
          )}

          {/* 見積の明細。**ここでは直さない** —
              金額を1行ずつ直す作業は見積の画面のほうが向いている (料金表・粗利がその場で出る)。
              実行すると下書きとして入るので、続けて見積の画面で直せる。
              人が直した差分はそちら (saveEstimate) で教師データとして回収される。 */}
          {r.kind === "create_estimate" && r.estimate_items.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-2">
              <p className="text-[11px] font-bold text-foreground">
                見積の下書き {r.estimate_items.length} 行 ・ 小計{" "}
                <Money value={itemsTotal(r.estimate_items)} className="inline-flex font-bold" />
              </p>
              <ul className="mt-1 space-y-0.5">
                {r.estimate_items.map((it, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-secondary-foreground">
                    <span className="text-foreground">{it.description}</span>
                    <span>{it.quantity}{it.unit ?? ""}</span>
                    <Money value={it.unit_price} className="inline-flex" />
                    {it.unit_price === 0 && <span className="text-warning-strong">単価が読み取れませんでした</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">
                金額の直しは実行後、見積の画面でどうぞ（料金表から選べて粗利がその場で出ます）。
              </p>
            </div>
          )}

          {/* 議事録の決定事項 */}
          {r.kind === "upsert_meeting_minutes" && r.minutes_decisions.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-2">
              <p className="text-[11px] font-bold text-foreground">決定事項 {r.minutes_decisions.length} 件</p>
              <ul className="mt-1 space-y-0.5">
                {r.minutes_decisions.map((d, i) => (
                  <li key={i} className="text-[11px] text-secondary-foreground">・{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 根拠 */}
          {r.quote && (
            <p className="truncate text-[11px] text-muted-foreground" title={r.quote}>
              元の文: {r.quote}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
