// 投入欄 + 確認モーダル — すべての依頼はここから入る。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D4 / D9)
//
// GMO イズムに従う点:
//   - 目標達成10カ条 2-3「会話だけでなく、形に残さないとメンバーは動かない」
//     → 朝会・ミーティング・隣の席で出た依頼を、その場で形に残す入口。
//   - 同 1-1「期限は何日何時何分まで。『今週中』などの曖昧な表現を使うな」
//     → 期限が曖昧なものは登録前に必ず聞く。AI が時刻を補完したら印を見せる。
//   - 同 1-1「期限はできるだけ短く設定する」
//     → クイック選択は短い順。遠い期限には注意を添える。
//
// 設計の要点:
//   - 投げた直後に**同じ画面のモーダル**で確認させる (別ページに飛ばすと離脱する)
//   - 既定はチェック済み (opt-out)。ただし宛先・期限が足りないものは既定 OFF
//   - 確定するまで受け手には見えない (AI の誤読がそのまま相手に飛ぶのを防ぐ)

import { useState, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import {
  Send, Loader2, Check, AlertTriangle, Clock, User, Sparkles, X, Info, CalendarClock,
} from "lucide-react";

interface Draft {
  draft_key: string;
  title: string;
  assigned_to?: string | null;
  requester_id?: string | null;
  due_at?: string | null;
  importance?: number;
  urgency?: number;
  due_time_assumed?: boolean;
  due_unclear?: boolean;
  assignee_unclear?: boolean;
  suggested_default?: boolean;
  quote?: string | null;
}

interface IntakeResponse {
  id: string;
  raw_text: string;
  kind: string;
  drafts: Draft[] | null;
  skipped?: { line: string; reason: string }[];
  far_due_keys?: string[];
  users?: { id: string; name: string }[];
}

/** 編集中の行。checked = 登録するか */
interface Row extends Draft {
  checked: boolean;
}

const IMPORTANCE_LABEL: Record<number, string> = { 3: "高", 2: "中", 1: "低" };
const URGENCY_LABEL: Record<number, string> = { 3: "高", 2: "中", 1: "低" };

/** 9 マスの打ち手 (要件 D2)。同点でも打ち手が違うことを画面で示す */
const CELL_ACTION: Record<string, string> = {
  "3x3": "今すぐやる", "3x2": "今日中に着手", "3x1": "予定を取って守る",
  "2x3": "早めに片づける", "2x2": "順番にやる", "2x1": "空いた時間で",
  "1x3": "任せる・即片づけ", "1x2": "まとめて処理", "1x1": "やらない候補",
};

function scoreOf(r: Row): number {
  const imp = r.importance ?? 2;
  const urg = r.due_at ? (r.urgency ?? 2) : 1;
  return imp * urg;
}
function cellOf(r: Row): string {
  const imp = r.importance ?? 2;
  const urg = r.due_at ? (r.urgency ?? 2) : 1;
  return `${imp}x${urg}`;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

/** datetime-local 用の 'YYYY-MM-DDTHH:mm' に変換 */
function toLocalInput(v?: string | null): string {
  if (!v) return "";
  return v.replace(" ", "T").slice(0, 16);
}
/** サーバーに渡す 'YYYY-MM-DD HH:mm' に戻す */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  return v.replace("T", " ").slice(0, 16);
}

/**
 * 期限クイック選択。**短い順**に並べる (イズム: 期限はできるだけ短く設定する)。
 */
function quickDueOptions(): { label: string; value: string }[] {
  const now = new Date();
  const mk = (addDays: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + addDays);
    d.setHours(hour, minute, 0, 0);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
  };
  // 今週の金曜 (すでに金曜以降なら来週の金曜)
  const toFriday = (() => {
    let delta = (5 - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return delta;
  })();
  return [
    { label: "今日 18:00", value: mk(0, 18) },
    { label: "明日 10:00", value: mk(1, 10) },
    { label: "明日 18:00", value: mk(1, 18) },
    { label: `金曜 18:00`, value: mk(toFriday, 18) },
    { label: "来週月曜 10:00", value: mk(((1 - now.getDay() + 7) % 7) + 7, 10) },
  ];
}

/** その期限が遠いか (イズム: 期限は短く。14 日より先は注意を添える) */
function isFarDue(dueAt?: string | null): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt.replace(" ", "T")).getTime();
  if (Number.isNaN(t)) return false;
  return (t - Date.now()) / 86400000 > 14;
}

/** 何を投げていいのか迷わせない。デザイン 4a の「こんなものを:」 */
const INTAKE_EXAMPLES = ["朝会のメモ", "口で言われた依頼", "議事録", "メールの本文"];

/** AI が投入文に対してやっていること。読み取り中に何をしているか見せる (§4.3 状態2) */
const READING_STEPS = [
  "誰に頼んだのかを探しています",
  "何をするのかを1行にまとめています",
  "いつまでか（何月何日何時何分）を読んでいます",
  "決定事項や報告はタスクにしないよう分けています",
];

export function TaskIntakeBox() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"freeform" | "minutes">("freeform");
  const [intake, setIntake] = useState<IntakeResponse | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  /** 読み取ったが1件も取れなかったとき (§4.3 読み取り失敗)。投げた文は消さない */
  const [unread, setUnread] = useState<IntakeResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const users = intake?.users ?? unread?.users ?? [];

  const submitMutation = useMutation({
    mutationFn: async () => {
      abortRef.current = new AbortController();
      return (
        await api.post(
          "/dailyops/tasks/intake",
          { raw_text: text, kind },
          { signal: abortRef.current.signal }
        )
      ).data.data as IntakeResponse;
    },
    onSuccess: (data) => {
      setError(null);
      const drafts = data.drafts ?? [];
      if (drafts.length === 0) {
        // 読めなかった。捨てずに残して人に聞く (捨てると依頼そのものが消えて元の課題に戻る)
        setUnread(data);
        return;
      }
      setIntake(data);
      setRows(drafts.map((d) => ({ ...d, checked: d.suggested_default !== false })));
    },
    onError: (e: any) => {
      if (e?.code === "ERR_CANCELED" || e?.name === "CanceledError") return; // 自分で止めた
      setError(e?.response?.data?.error?.message ?? "読み取りが終わりませんでした");
    },
  });

  const cancelReading = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    submitMutation.reset();
  };

  /** 読めなかった投入から、自分で1件だけ作る (宛先と期限は人が入れる) */
  const startManualRow = () => {
    if (!unread) return;
    setIntake(unread);
    setRows([
      {
        draft_key: "manual-1",
        title: unread.raw_text.split("\n")[0].slice(0, 120),
        assigned_to: null,
        requester_id: null,
        due_at: null,
        importance: 2,
        urgency: 2,
        assignee_unclear: true,
        due_unclear: true,
        checked: true,
      },
    ]);
    setUnread(null);
  };

  const commitMutation = useMutation({
    mutationFn: async () => {
      const tasks = rows
        .filter((r) => r.checked)
        .map((r) => ({
          draft_key: r.draft_key,
          title: r.title,
          assigned_to: r.assigned_to ?? undefined,
          requester_id: r.requester_id ?? undefined,
          due_at: r.due_at ?? undefined,
          importance: r.importance ?? 2,
          urgency: r.due_at ? (r.urgency ?? 2) : 1,
        }));
      return (await api.post(`/dailyops/tasks/intake/${intake!.id}/commit`, { tasks })).data.data;
    },
    onSuccess: (data: any) => {
      setDoneMsg(`${data.created_ids.length} 件を登録しました`);
      closeAll();
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: (e: any) => setError(e?.response?.data?.error?.message ?? "登録に失敗しました"),
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      const id = intake?.id ?? unread?.id;
      return (await api.post(`/dailyops/tasks/intake/${id}/discard`, {})).data.data;
    },
    onSuccess: () => {
      setDoneMsg("下書きを破棄しました（投げた文は記録に残っています）");
      closeAll();
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });

  function closeAll() {
    setIntake(null);
    setUnread(null);
    setRows([]);
    setText("");
    setError(null);
  }

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.draft_key === key ? { ...r, ...patch } : r)));

  const checkedRows = rows.filter((r) => r.checked);

  // 登録を止める条件: チェックされているのに宛先か期限(依頼のみ)が欠けている
  const blockers = useMemo(
    () =>
      checkedRows
        .map((r) => {
          if (!r.assigned_to) return `「${r.title || "(無題)"}」の担当者を選んでください`;
          if (r.requester_id && !r.due_at)
            return `「${r.title}」は依頼なので期限が必要です（何月何日何時何分まで）`;
          if (!r.title.trim()) return "内容が空の行があります";
          return null;
        })
        .filter((x): x is string => x !== null),
    [checkedRows]
  );

  return (
    <>
      {/* ── 投入欄 (トップページ最上部) ── */}
      <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-3 sm:p-4">
        <div className="flex flex-wrap items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-foreground">AIに投げる</p>
            <p className="mt-0.5 text-[12px] text-secondary-foreground">
              議事録でも、口で言われた依頼でも、そのまま貼ってください。宛先と期限はAIが整えます。
            </p>
          </div>
          <div className="ml-auto inline-flex shrink-0 rounded-lg border border-border p-0.5">
            {([["freeform", "ひとこと"], ["minutes", "議事録"]] as const).map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                onClick={() => setKind(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  kind === v ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setDoneMsg(null); }}
          rows={kind === "minutes" ? 5 : 2}
          className="mt-2 resize-y bg-background text-sm"
          placeholder={
            kind === "minutes"
              ? "朝会や会議のメモをそのまま貼ってください。\n・山田さんに 7/31 17:00 までに見積書の作成をお願いした\n・方針は A 案で進めることに決定（← 決定事項はタスクにしません）"
              : "例）山田さんに 明日18時までに 請求書の送付をお願いした"
          }
        />

        <p className="mt-1.5 text-[12px] text-muted-foreground">
          期限は<span className="font-bold text-foreground">何月何日何時何分まで</span>で書くと、そのまま登録できます。
          {/*
            スマホは声で入れられる (§4.19)。独自の音声入力は作らない —
            端末のキーボードにある音声入力がそのまま使え、精度も端末側の方が良い。
          */}
          <span className="sm:hidden">キーボードの音声入力（マイク）でそのまま話しても入ります。</span>
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted-foreground">こんなものを:</span>
          <ul className="flex flex-wrap gap-1.5">
            {INTAKE_EXAMPLES.map((e) => (
              <li
                key={e}
                className="rounded-full border border-border bg-card px-2 py-0.5 text-[12px] text-secondary-foreground"
              >
                {e}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            className="ml-auto h-9 gap-1.5"
            disabled={!text.trim() || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" aria-hidden="true" />}
            AIに振り分けてもらう
          </Button>
        </div>

        {/* ── 状態2: AI が読んでいる (何をしているか見せる・止められる) ── */}
        {submitMutation.isPending && (
          <div
            role="status"
            className="mt-2.5 rounded-control border border-ai-border bg-ai-surface px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" aria-hidden="true" />
              AIが読んでいます
            </p>
            <p className="mt-0.5 text-[12px] text-secondary-foreground">
              終わったらこの下に「確認待ち」で出ます。閉じても消えません。
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {READING_STEPS.map((sline) => (
                <li key={sline} className="flex items-start gap-1.5 text-[12px] text-secondary-foreground">
                  <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-ai" aria-hidden="true" />
                  {sline}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={cancelReading}>
                やめる
              </Button>
              <p className="text-[12px] text-muted-foreground">
                投げた文はこのまま残るので、やめてもやり直せます。
              </p>
            </div>
          </div>
        )}

        {/* ── 状態4: 読めなかった (捨てずに残して人に聞く) ── */}
        {unread && (
          <div className="mt-2.5 rounded-control border border-warning/35 bg-warning-surface px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning-strong" aria-hidden="true" />
              読み取れなかったときも捨てません
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">
              宛先や期限が読めなかったので、投げた文はそのまま残してあります。分かるところだけ入れて1件つくるか、
              文だけ残して後で見てください。
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" className="h-9" onClick={startManualRow}>
                自分で埋める
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={discardMutation.isPending}
                onClick={() => discardMutation.mutate()}
              >
                投げた文だけ残す
              </Button>
            </div>
          </div>
        )}

        {doneMsg && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold text-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />{doneMsg}
          </p>
        )}
        {error && !intake && !unread && (
          <p className="mt-2 text-[13px] font-bold text-destructive">{error}</p>
        )}
      </div>

      {/* ── 確認モーダル (投げた直後・その場で確認させる) ── */}
      <Dialog open={!!intake} onOpenChange={(o) => { if (!o) closeAll(); }}>
        <DialogContent
          className="grid-cols-1 sm:max-w-[min(96vw,1100px)] max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              <span>
                {rows.length > 0
                  ? `${rows.length} 件みつけました。登録しますか？`
                  : "タスクは見つかりませんでした"}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ai-border bg-ai-surface px-2 py-0.5 text-[11px] font-bold text-ai">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                AI作成
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-warning/35 bg-warning-surface px-2 py-0.5 text-[11px] font-bold text-warning-strong">
                <Clock className="h-3 w-3" aria-hidden="true" />
                確認待ち
              </span>
            </DialogTitle>
            <p className="text-[13px] text-secondary-foreground">
              「この内容で確定する」を押すまで、相手には出ません。
              <span className="font-bold text-warning-strong">オレンジの印</span>は AI が補ったところです。
            </p>
          </DialogHeader>

          {/* 拾わなかった行 (決定事項など) を見せる */}
          {intake?.skipped && intake.skipped.length > 0 && (
            <div className="rounded-lg border bg-muted/40 p-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                タスクにしなかった行（記録には残ります）
              </p>
              <ul className="mt-1 space-y-0.5">
                {intake.skipped.map((s, i) => (
                  <li key={i} className="text-muted-foreground">
                    <span className="text-foreground/70">{s.line}</span>
                    <span className="ml-1.5">— {s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              やることが読み取れませんでした。文を分けて書き直すか、「タスク・依頼」から直接登録してください。
            </p>
          ) : (
            <ul className="space-y-2.5">
              {rows.map((r) => {
                const needsAssignee = !r.assigned_to;
                const needsDue = !r.due_at;
                const far = isFarDue(r.due_at);
                return (
                  <li
                    key={r.draft_key}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      r.checked ? "border-primary/40 bg-primary/[0.02]" : "border-border bg-muted/20 opacity-70"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        aria-label={r.checked ? "登録しない" : "登録する"}
                        onClick={() => update(r.draft_key, { checked: !r.checked })}
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                          r.checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                        )}
                      >
                        {r.checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>

                      <div className="min-w-0 flex-1 space-y-2">
                        <Input
                          value={r.title}
                          onChange={(e) => update(r.draft_key, { title: e.target.value })}
                          className="h-9 text-sm font-medium"
                          placeholder="やること"
                        />

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {/* 担当者 */}
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              <User className="mr-1 inline h-3 w-3" aria-hidden="true" />
                              誰が
                            </Label>
                            <select
                              value={r.assigned_to ?? ""}
                              onChange={(e) => update(r.draft_key, { assigned_to: e.target.value || null })}
                              className={cn(
                                "mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm",
                                needsAssignee && r.checked ? "border-amber-400" : "border-input"
                              )}
                            >
                              <option value="">（選んでください）</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                            {r.assignee_unclear && needsAssignee && (
                              <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                                誰に頼んだか読み取れませんでした
                              </p>
                            )}
                          </div>

                          {/* 期限 */}
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                              何月何日何時何分まで
                            </Label>
                            <Input
                              type="datetime-local"
                              value={toLocalInput(r.due_at)}
                              onChange={(e) =>
                                update(r.draft_key, { due_at: fromLocalInput(e.target.value) })
                              }
                              className={cn(
                                "mt-0.5 h-9 text-sm",
                                needsDue && r.checked && r.requester_id ? "border-amber-400" : ""
                              )}
                            />
                            {/* 短い順のクイック選択 (イズム: 期限はできるだけ短く) */}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {quickDueOptions().map((o) => (
                                <button
                                  key={o.value}
                                  type="button"
                                  onClick={() => update(r.draft_key, { due_at: fromLocalInput(o.value) })}
                                  className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                                >
                                  {o.label}
                                </button>
                              ))}
                            </div>
                            {r.due_unclear && needsDue && (
                              <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                                「今週中」などは期限になりません。日時を決めてください
                              </p>
                            )}
                            {r.due_time_assumed && r.due_at && (
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-sky-700">
                                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                                時刻は 18:00 として入れました。合っていますか？
                              </p>
                            )}
                            {far && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                期限は短いほうが動きます
                              </p>
                            )}
                          </div>
                        </div>

                        {/* 重要度 × 緊急度 + 打ち手 */}
                        <div className="flex flex-wrap items-center gap-2">
                          {([["importance", "重要度", IMPORTANCE_LABEL], ["urgency", "緊急度", URGENCY_LABEL]] as const).map(
                            ([field, label, dict]) => (
                              <div key={field} className="flex items-center gap-1">
                                <span className="text-[11px] text-muted-foreground">{label}</span>
                                <div className="inline-flex rounded-md border border-input p-0.5">
                                  {[3, 2, 1].map((v) => (
                                    <button
                                      key={v}
                                      type="button"
                                      onClick={() => update(r.draft_key, { [field]: v } as Partial<Row>)}
                                      className={cn(
                                        "rounded px-2 py-0.5 text-[11px] transition-colors",
                                        (r[field] ?? 2) === v
                                          ? "bg-primary text-primary-foreground font-medium"
                                          : "text-muted-foreground hover:bg-muted"
                                      )}
                                    >
                                      {dict[v]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          )}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                            スコア {scoreOf(r)} · {CELL_ACTION[cellOf(r)]}
                          </span>
                          {r.requester_id && (
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">
                              依頼
                            </span>
                          )}
                        </div>

                        {r.quote && (
                          <p className="truncate text-[11px] text-muted-foreground" title={r.quote}>
                            元の文: {r.quote}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {blockers.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                登録する前に決めてください
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                {blockers.map((b, i) => <li key={i}>・{b}</li>)}
              </ul>
            </div>
          )}
          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1 text-xs"
              disabled={discardMutation.isPending}
              onClick={() => discardMutation.mutate()}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              全部いらない
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-9 gap-1.5"
              disabled={checkedRows.length === 0 || blockers.length > 0 || commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              {commitMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Check className="h-4 w-4" aria-hidden="true" />}
              この内容で確定する（{checkedRows.length} 件）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
