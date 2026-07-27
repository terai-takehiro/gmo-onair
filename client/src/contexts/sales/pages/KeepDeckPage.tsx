/**
 * 隔週キープをつくる — ふりかえり ＞ 隔週キープ（デザイン 29章 35a/35b / 仕様書 §7.3）
 *
 * GMO流会議フォーマット **Ver.2.5 の11の型は変えない**。変えるのは「誰が埋めるか」だけ。
 * 前回 6.5時間かかっていた作成を 45分にする。
 *
 * ── この画面の決めごと ────────────────────────────────
 *  - 左でページを見て、**右で足りないものだけ書く**（上から順に片づく）
 *  - AIが集めた事実は**直さなくて済む**ところとして別に置く
 *  - ①②③は毎回、**④以降は議題があるときだけ足す**（無い回はページも作らない）
 *  - ③の6テーマと担当は固定。人が書くのはテーマごとに1行だけ
 *  - チェックリストは**落ちている項目だけ**赤で出す
 *  - **配布はPDFだけ**（PowerPoint 出力は作らない）
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoticeBar, setNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { useAuth } from "@/contexts/platform/AuthContext";
import {
  Check, Pencil, Plus, X, Loader2, Printer, Sparkles, CircleAlert, Presentation,
} from "lucide-react";

interface Page {
  no: string; label: string; by: "ai" | "fixed" | "ai_human" | "human";
  from: string; human: string; needs_human: boolean; done: boolean;
}
interface Theme {
  no: number; theme: string; owner: string;
  human_line: string | null; consult_line: string | null; written: boolean; auto: string;
}
interface Deck {
  meeting_date: string;
  format_version: string;
  confirmed_at: string | null;
  next_meeting_date: string | null;
  answers: { moved: string | null; stuck: string | null; consult: string | null };
  pages: Page[];
  page_count: number;
  ai_filled: number;
  needs_human_count: number;
  agenda: Array<{ no: string; label: string; minutes: number; detail: string; kind: string; id?: string }>;
  total_minutes: number;
  optional_agenda: Array<{ kind: string; label: string; note: string; auto: string }>;
  extra_agenda: Array<{ id: string; kind: string; label: string; note: string | null; minutes: number }>;
  themes: Theme[];
  facts: Array<{ label: string; value: string; src: string }>;
  checklist: Array<{ key: string; label: string; ok: boolean }>;
  diffs: Array<{ what: string; detail: string }>;
  prev_agenda_kinds: Array<{ kind: string; label: string }>;
}

const BY_LABEL: Record<Page["by"], string> = {
  ai: "AI", fixed: "固定", ai_human: "AI＋人", human: "人",
};

const ANSWER_QUESTIONS = [
  { key: "moved" as const, q: "①この2週間で何が動きましたか（1行）", hint: "事実だけ書いてください。数字はもう入っています。" },
  { key: "stuck" as const, q: "②うまくいっていないことは何ですか（1行）", hint: "数字はAIが入れました。理由だけ書いてください。" },
  { key: "consult" as const, q: "③社長に相談したいことはありますか（1行）", hint: "空でも進めます。書かないという判断も記録されます。" },
];

/** 直近の水曜（隔週キープの開催日の目安） */
function defaultDate(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function KeepDeckPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");

  const [sp, setSp] = useSearchParams();
  const date = sp.get("date") ?? defaultDate();
  const setDate = (v: string) => {
    const next = new URLSearchParams(sp);
    next.set("date", v);
    setSp(next, { replace: true });
  };

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [newAgenda, setNewAgenda] = useState({ kind: "", label: "", note: "" });

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: Deck }>({
    queryKey: ["keep-deck", date],
    queryFn: async () => (await api.get(`/keep/deck/${date}`)).data,
  });
  const deck = data?.data;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["keep-deck", date] });
  const onError = (e: any) => setNotice({
    tone: "error", title: e?.response?.data?.error?.message ?? "書けませんでした",
  });

  const saveAnswers = useMutation({
    mutationFn: async (body: any) => (await api.put(`/keep/deck/${date}/answers`, body)).data,
    onSuccess: async () => { setDraft({}); await invalidate(); },
    onError,
  });
  const saveTheme = useMutation({
    mutationFn: async (v: { no: number; body: any }) =>
      (await api.put(`/keep/deck/${date}/themes/${v.no}`, v.body)).data,
    onSuccess: async () => { setDraft({}); await invalidate(); },
    onError,
  });
  const addAgenda = useMutation({
    mutationFn: async () => (await api.post(`/keep/deck/${date}/agenda`, newAgenda)).data,
    onSuccess: async () => {
      setNewAgenda({ kind: "", label: "", note: "" });
      await invalidate();
      setNotice({ tone: "success", title: "議題を足しました", description: "番号・時間配分・ページは自動で付きます。" });
    },
    onError,
  });
  const removeAgenda = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/keep/deck/${date}/agenda/${id}`)).data,
    onSuccess: async () => { await invalidate(); },
    onError,
  });
  const confirm = useMutation({
    mutationFn: async () => (await api.post(`/keep/deck/${date}/confirm`)).data,
    onSuccess: async (res: any) => {
      await invalidate();
      const missing: string[] = res?.data?.missing_checks ?? [];
      setNotice({
        tone: missing.length > 0 ? "warning" : "success",
        title: "この回を確定しました",
        description: missing.length > 0
          ? `落ちている項目: ${missing.join(" / ")}`
          : "Ver.2.5 のチェックリストは全部満たしています。",
      });
    },
    onError,
  });

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/keep/deck/${date}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = `keep-${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { onError(e); }
  };

  const missingChecks = useMemo(
    () => (deck?.checklist ?? []).filter((c) => !c.ok), [deck],
  );

  if (isLoading) return <div className="p-4"><SkeletonCard /></div>;
  if (isError || !deck) {
    return (
      <div className="p-4">
        <ErrorPanel title="隔週キープを読めませんでした" error={error} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <NoticeBar />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">隔週キープ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            フォーマット {deck.format_version}（型は変えません）・
            AIが埋めた <strong>{deck.ai_filled} / 全 {deck.page_count}ページ</strong>・
            人が書くところ <strong>{deck.needs_human_count}件</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-xs text-muted-foreground">開催日</span>
            <Input type="date" className="mt-1 w-40" value={date}
              aria-label="開催日" onChange={(e) => setDate(e.target.value)} />
          </label>
          <Button variant="outline" className="min-h-[44px] gap-1" onClick={downloadPdf}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            PDFにする
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* 左: ページ一覧。赤は人が書くところ */}
        <aside className="min-w-0">
          <section className="rounded-2xl border border-divider bg-card">
            <h2 className="border-b border-divider p-3 text-sm font-bold">ページ</h2>
            <p className="px-3 pt-2 text-xs text-muted-foreground">
              赤は人が書くところ。上から順に片づきます。
            </p>
            <ul className="p-2">
              {deck.pages.map((p) => (
                <li key={`${p.no}-${p.label}`}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                    p.needs_human ? "bg-warning/10 font-medium" : ""
                  }`}>
                  {p.needs_human
                    ? <Pencil className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                    : <Check className="h-3.5 w-3.5 shrink-0 text-positive" aria-hidden="true" />}
                  <span className="w-6 shrink-0 text-xs text-muted-foreground">{p.no}</span>
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{BY_LABEL[p.by]}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        {/* 右: 足りないものだけ書く */}
        <div className="min-w-0 space-y-4">
          {/* AIが集めた事実 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="flex items-center gap-1 text-base font-bold">
              <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />
              AIが集めた事実
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">ここは直さなくて済みます。</p>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {deck.facts.map((f) => (
                <div key={f.label} className="border-t border-row pt-2">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd className="font-bold">{f.value}</dd>
                  <dd className="text-xs text-muted-foreground">{f.src}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ① 人が書く3行 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">あなたが書くのはここだけ</h2>
            <p className="mt-1 text-sm text-muted-foreground">3行。数字はもう入っています。</p>
            <div className="mt-3 space-y-3">
              {ANSWER_QUESTIONS.map((a) => (
                <label key={a.key} className="block">
                  <span className="text-sm font-medium">{a.q}</span>
                  <textarea
                    className="mt-1 min-h-[56px] w-full rounded-xl border border-divider bg-card p-2 text-sm"
                    aria-label={a.q}
                    disabled={!canEdit}
                    value={draft[a.key] ?? deck.answers[a.key] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [a.key]: e.target.value })}
                    onBlur={() => draft[a.key] !== undefined
                      && draft[a.key] !== (deck.answers[a.key] ?? "")
                      && saveAnswers.mutate({ [a.key]: draft[a.key] })} />
                  <span className="text-xs text-muted-foreground">{a.hint}</span>
                </label>
              ))}
              <label className="block">
                <span className="text-sm font-medium">次回開催日</span>
                <Input type="date" className="mt-1 w-44" disabled={!canEdit}
                  aria-label="次回開催日"
                  value={draft.next ?? deck.next_meeting_date ?? ""}
                  onChange={(e) => setDraft({ ...draft, next: e.target.value })}
                  onBlur={() => draft.next && draft.next !== deck.next_meeting_date
                    && saveAnswers.mutate({ next_meeting_date: draft.next })} />
              </label>
            </div>
          </section>

          {/* ③ 重点取組課題 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">③ 重点取組課題（毎回）</h2>
              <span className="text-sm text-muted-foreground">
                未記入 {deck.themes.filter((t) => !t.written).length}件
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              6テーマ。テーマと担当は固定なので毎回作り直しません。進捗はタスクから自動、打ち手だけ人が1行。
            </p>
            <ul className="mt-3 space-y-3">
              {deck.themes.map((t) => (
                <li key={t.no} className="border-t border-row pt-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">{t.no}</span>
                    <span className="font-medium">{t.theme}</span>
                    <span className="text-xs text-muted-foreground">／ {t.owner}</span>
                    <span className={`ml-auto text-xs ${t.written ? "text-positive" : "text-warning"}`}>
                      {t.written ? "書いた" : "未記入"}
                    </span>
                  </div>
                  <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-ai" aria-hidden="true" />
                    AIが入れる進捗: {t.auto}
                  </p>
                  <Input className="mt-1" disabled={!canEdit}
                    aria-label={`${t.theme} の打ち手`}
                    placeholder="打ち手を1行で"
                    value={draft[`t${t.no}`] ?? t.human_line ?? ""}
                    onChange={(e) => setDraft({ ...draft, [`t${t.no}`]: e.target.value })}
                    onBlur={() => draft[`t${t.no}`] !== undefined
                      && draft[`t${t.no}`] !== (t.human_line ?? "")
                      && saveTheme.mutate({ no: t.no, body: { human_line: draft[`t${t.no}`] } })} />
                </li>
              ))}
            </ul>
          </section>

          {/* ④以降の議題 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">アジェンダ（合計 {deck.total_minutes}分）</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ①②③は毎回。<strong>④以降は議題があるときだけ足します</strong>
              （無い回はページも作りません）。
            </p>
            <ul className="mt-3 space-y-1">
              {deck.agenda.map((a) => (
                <li key={`${a.no}-${a.label}`} className="flex flex-wrap items-center gap-2 border-t border-row pt-2 text-sm">
                  <span className="w-6 shrink-0">{a.no}</span>
                  <span className="min-w-0 flex-1">{a.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{a.minutes}分</span>
                  {canEdit && a.id && (
                    <Button variant="ghost" size="sm" className="min-h-[44px] shrink-0 text-negative"
                      aria-label={`${a.label} を外す`}
                      onClick={() => removeAgenda.mutate(a.id as string)}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {canEdit && (
              <div className="mt-4 rounded-xl bg-muted/50 p-3">
                <p className="text-sm font-medium">＋ ④以降を足す</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {deck.optional_agenda.map((o) => (
                    <button key={o.kind} type="button"
                      onClick={() => setNewAgenda({ kind: o.kind, label: o.kind === "other" ? "" : o.label, note: "" })}
                      aria-pressed={newAgenda.kind === o.kind}
                      className={`min-h-[44px] rounded-xl border px-3 text-left text-sm ${
                        newAgenda.kind === o.kind ? "border-primary bg-primary/5" : "border-divider bg-card"
                      }`}>
                      <span className="block font-medium">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.note}</span>
                    </button>
                  ))}
                </div>
                {newAgenda.kind && (
                  <div className="mt-2 space-y-2">
                    <Input placeholder={newAgenda.kind === "other" ? "議題の名前（必須）" : "名前を変えるとき"}
                      aria-label="議題の名前"
                      value={newAgenda.label}
                      onChange={(e) => setNewAgenda({ ...newAgenda, label: e.target.value })} />
                    <Input placeholder="どんな話か（任意）" aria-label="議題の内容"
                      value={newAgenda.note}
                      onChange={(e) => setNewAgenda({ ...newAgenda, note: e.target.value })} />
                    <Button className="min-h-[44px] gap-1"
                      disabled={addAgenda.isPending || (newAgenda.kind === "other" && !newAgenda.label.trim())}
                      onClick={() => addAgenda.mutate()}>
                      {addAgenda.isPending
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Plus className="h-4 w-4" aria-hidden="true" />}
                      この議題を足す
                    </Button>
                  </div>
                )}
                {deck.prev_agenda_kinds.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    前回足した議題: {deck.prev_agenda_kinds.map((k) => k.label).join(" / ")}
                    （続く話題は1クリックで戻せます）
                  </p>
                )}
              </div>
            )}
          </section>

          {/* フォーマットの確認 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">フォーマットの確認</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {deck.format_version} のチェックリスト（11項目）を自動で見ます。落ちている項目だけ出します。
            </p>
            {missingChecks.length === 0 ? (
              <p className="mt-3 flex items-center gap-1 text-sm text-positive">
                <Check className="h-4 w-4" aria-hidden="true" />
                11項目すべて満たしています。
              </p>
            ) : (
              <ul className="mt-3 space-y-1">
                {missingChecks.map((c) => (
                  <li key={c.key} className="flex items-start gap-1 text-sm text-negative">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {c.label}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 前回からの変更 */}
          <section className="rounded-2xl border border-divider bg-card p-4">
            <h2 className="text-base font-bold">前回からの変更（赤字にします）</h2>
            {deck.diffs.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">前回からの変更はありません。</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {deck.diffs.map((d) => (
                  <li key={d.what} className="border-t border-row pt-1">
                    <span className="font-medium text-negative">{d.what}</span>
                    <span className="pl-2 text-muted-foreground">{d.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              フォーマットの決まりどおり、変わった箇所だけ赤字で出します（人が塗り直しません）。
            </p>
          </section>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button className="min-h-[44px] gap-1" disabled={confirm.isPending}
                onClick={() => confirm.mutate()}>
                {confirm.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Presentation className="h-4 w-4" aria-hidden="true" />}
                この回を確定する
              </Button>
              {deck.confirmed_at && (
                <span className="text-sm text-positive">確定しました</span>
              )}
              <span className="text-xs text-muted-foreground">
                落ちている項目があっても確定できます（止めると会議が始められないため）。
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
