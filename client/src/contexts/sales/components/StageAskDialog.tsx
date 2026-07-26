/**
 * 進んだ段で聞く — デザイン 14章 27c / 仕様書 §7.1
 *
 * ステージを動かすときに、**その段で要る1〜2問だけ**を出す。
 * 聞く項目はサーバー1か所 (`GET /projects/:id/stage-ask`) が決めているので、
 * 画面とサーバーでずれない。すでに入っている項目は聞かない。
 *
 * ── この部品の決めごと ────────────────────────────────
 *  - **なぜここで聞くか**を項目ごとに出す（言われた通りに埋める作業にしない）
 *  - **自動で起きること**も出す（人が入れなくてよいものを明示する）
 *  - 「聞くことはありません」のときは押すだけ（空のフォームを出さない）
 *  - 必須が足りないまま押せない。押せてもサーバーが同じ定義で止める
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { setNotice } from "@gmo-onair/shared/src/client/ui/notice";
import { Loader2, Sparkles, HelpCircle, Plus, X } from "lucide-react";

interface AskField {
  key: string;
  label: string;
  kind: "date_range" | "money" | "rooms" | "check" | "lost_reason" | "text" | "dates";
  required: "required" | "optional" | "conditional";
  why: string;
}

interface StageAskView {
  to: string;
  toLabel: string;
  question: string;
  fields: AskField[];
  auto: string[];
  filled: Record<string, boolean>;
  missing: string[];
  /** 部屋の候補。部屋の一覧は studio 権限なので、営業でも読めるようここに載る */
  room_choices: Array<{ id: string; name: string; location: string | null }>;
}

const LOST_REASONS = [
  { value: "budget", label: "予算が合わなかった" },
  { value: "schedule", label: "日程が合わなかった" },
  { value: "competitor", label: "他社に決まった" },
  { value: "postponed", label: "見送りになった" },
];

const REQ_LABEL: Record<AskField["required"], string> = {
  required: "必須",
  optional: "任意",
  conditional: "案件による",
};

export default function StageAskDialog({
  projectId, toStage, open, onClose, onDone,
}: {
  projectId: string;
  toStage: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [extraDates, setExtraDates] = useState<Array<{ date: string; label: string }>>([]);

  const { data, isLoading } = useQuery<{ data: StageAskView }>({
    queryKey: ["stage-ask", projectId, toStage],
    queryFn: async () =>
      (await api.get(`/projects/${projectId}/stage-ask`, { params: { to: toStage } })).data,
    enabled: open && !!toStage,
  });
  const ask = data?.data;

  // 部屋の候補は stage-ask の応答に入っている
  // (部屋の一覧は studio 権限で、ステージを動かす営業は読めないため)
  const rooms = useMemo(() => ask?.room_choices ?? [], [ask]);

  useEffect(() => {
    if (!open) { setAnswers({}); setExtraDates([]); }
  }, [open, toStage]);

  const change = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = { stage: toStage, ...answers };
      if (extraDates.length > 0) {
        body.extra_dates = extraDates.filter((d) => d.date);
      }
      return (await api.patch(`/projects/${projectId}/stage`, body)).data;
    },
    onSuccess: () => {
      setNotice({
        tone: "success",
        title: `${ask?.toLabel ?? "次の段"}にしました`,
        description: ask?.auto?.length ? `自動で: ${ask.auto.join(" / ")}` : undefined,
      });
      onClose();
      onDone();
    },
    onError: (e: any) => setNotice({
      tone: "error",
      title: e?.response?.data?.error?.message ?? "変えられませんでした",
    }),
  });

  /** まだ聞く必要がある項目だけ (すでに入っているものは出さない) */
  const toAsk = useMemo(
    () => (ask?.fields ?? []).filter((f) => !ask?.filled[f.key] || f.required === "optional"),
    [ask],
  );

  const filledOk = useMemo(() => {
    if (!ask) return false;
    return ask.fields.every((f) => {
      if (f.required !== "required") return true;
      if (ask.filled[f.key]) return true;
      switch (f.key) {
        case "event_dates": return !!answers.event_start;
        case "room_ids": return Array.isArray(answers.room_ids) && answers.room_ids.length > 0;
        case "expected_amount": return Number(answers.expected_amount) > 0;
        case "application_form": return !!answers.application_form;
        case "lost_reason": return !!answers.lost_reason;
        default: return !!answers[f.key];
      }
    });
  }, [ask, answers]);

  const toggleRoom = (id: string) => {
    const cur: string[] = answers.room_ids ?? [];
    setAnswers({
      ...answers,
      room_ids: cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id],
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? "読み込んでいます…" : ask?.question ?? ""}
          </DialogTitle>
        </DialogHeader>

        {ask && (
          <div className="space-y-4">
            {toAsk.length === 0 && (
              <p className="text-sm text-muted-foreground">
                この段で聞くことはありません。「{ask.toLabel}にする」を押すだけです。
              </p>
            )}

            {toAsk.map((f) => (
              <div key={f.key}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-bold">{f.label}</span>
                  <span className={`text-xs ${
                    f.required === "required" ? "text-negative"
                      : f.required === "conditional" ? "text-warning" : "text-muted-foreground"
                  }`}>{REQ_LABEL[f.required]}</span>
                </div>
                <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                  <HelpCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  {f.why}
                </p>

                {f.kind === "date_range" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs text-muted-foreground">本番日</span>
                      <Input type="date" className="mt-1" value={answers.event_start ?? ""}
                        aria-label="本番日"
                        onChange={(e) => setAnswers({ ...answers, event_start: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted-foreground">終了日（1日なら空でよい）</span>
                      <Input type="date" className="mt-1" value={answers.event_end ?? ""}
                        aria-label="終了日"
                        onChange={(e) => setAnswers({ ...answers, event_end: e.target.value })} />
                    </label>
                  </div>
                )}

                {f.kind === "rooms" && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-divider">
                    {rooms.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground">部屋を読み込んでいます…</p>
                    )}
                    {rooms.map((r) => (
                      <label key={r.id}
                        className="flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-row px-3 last:border-0 hover:bg-muted/40">
                        <span className="-m-2 flex min-h-[44px] min-w-[44px] items-center justify-center p-2">
                          <input type="checkbox" className="h-[22px] w-[22px]"
                            checked={(answers.room_ids ?? []).includes(r.id)}
                            onChange={() => toggleRoom(r.id)}
                            aria-label={`${r.name} を使う`} />
                        </span>
                        <span className="text-sm">
                          {r.name}
                          {r.location && <span className="pl-1 text-xs text-muted-foreground">{r.location}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {f.kind === "money" && (
                  <Input type="number" inputMode="numeric" className="mt-2"
                    aria-label={f.label} placeholder="3000000"
                    value={answers.expected_amount ?? ""}
                    onChange={(e) => setAnswers({ ...answers, expected_amount: e.target.value })} />
                )}

                {f.kind === "check" && (
                  <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-3">
                    <span className="-m-2 flex min-h-[44px] min-w-[44px] items-center justify-center p-2">
                      <input type="checkbox" className="h-[22px] w-[22px]"
                        checked={!!answers[f.key]}
                        onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.checked })}
                        aria-label={f.label} />
                    </span>
                    <span className="text-sm">揃っています</span>
                  </label>
                )}

                {f.kind === "lost_reason" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {LOST_REASONS.map((r) => (
                      <button key={r.value} type="button"
                        onClick={() => setAnswers({ ...answers, lost_reason: r.value })}
                        aria-pressed={answers.lost_reason === r.value}
                        className={`min-h-[44px] rounded-xl border px-3 text-left text-sm ${
                          answers.lost_reason === r.value
                            ? "border-primary bg-primary/5" : "border-divider hover:bg-muted/40"
                        }`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}

                {f.kind === "text" && (
                  <textarea className="mt-2 min-h-[72px] w-full rounded-xl border border-divider bg-card p-2 text-sm"
                    aria-label={f.label} value={answers[f.key] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />
                )}

                {f.kind === "dates" && (
                  <div className="mt-2 space-y-2">
                    {extraDates.map((d, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <Input type="date" className="w-40" value={d.date} aria-label={`追加の日程 ${i + 1}`}
                          onChange={(e) => setExtraDates(extraDates.map((x, j) =>
                            j === i ? { ...x, date: e.target.value } : x))} />
                        <Input className="w-32" placeholder="ラベル" value={d.label}
                          aria-label={`追加の日程 ${i + 1} のラベル`}
                          onChange={(e) => setExtraDates(extraDates.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x))} />
                        <Button variant="ghost" size="sm" className="min-h-[44px]"
                          onClick={() => setExtraDates(extraDates.filter((_, j) => j !== i))}
                          aria-label={`追加の日程 ${i + 1} を消す`}>
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="min-h-[44px] gap-1"
                      onClick={() => setExtraDates([...extraDates, { date: "", label: "" }])}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      日程を足す
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {ask.auto.length > 0 && (
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="flex items-center gap-1 text-xs font-bold">
                  <Sparkles className="h-3 w-3 text-ai" aria-hidden="true" />
                  自動で起きること（入れなくてよいもの）
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {ask.auto.map((a) => <li key={a}>・{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" className="min-h-[44px]" onClick={onClose}>やめる</Button>
          <Button disabled={!ask || !filledOk || change.isPending}
            onClick={() => change.mutate()}>
            {change.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {ask?.toLabel ?? ""}にする
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
