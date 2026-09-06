// 制作のジャーニー — 1日ぶんのカード。実装設計: impl/03-app-structure-impl.md §6
//
// 「進み具合」の画一的な判定式は作らない。サーバーが返すのは数えた事実（`facts`）と
// 3値の手がかり（`tone`）だけ。「決まった」と言えるのは人がピンを押したときだけ。
//
// 見た目の作り直し（2026-08-22）: 折りたためるようにし（既定は開いた状態）、
// 「決まった」「要注意」の2ボタンは 44×44px のアイコンのみに変えた。
// データ・ハンドラ・条件分岐は変えていない。
import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, CheckCircle2, Eye, X, FileText, AlertTriangle, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { itemKindLabel } from "@gmo-onair/shared/src/schedule/kinds";
import { formatDocNo } from "@gmo-onair/shared/src/production/docNo";
import { docPathOf } from "@gmo-onair/shared/src/production/miniapps";
import type { JourneyDay, JourneyStage, HintTone, Suggestion, SuggestionKey } from "@gmo-onair/shared/src/production/journey";
import type { JourneyMarkRow } from "@/lib/journeyApi";

const STAGE_LABEL: Record<JourneyStage, string> = {
  day: "当日スケジュール",
  flow: "番組進行",
  script: "進行台本の内容",
};

const TONE_LABEL: Record<HintTone, string> = {
  blank: "まだ何もありません",
  touched: "資料があります",
  recent: "直近7日で更新",
};

const TONE_DOT_CLASS: Record<HintTone, string> = {
  blank: "bg-muted-foreground/25",
  touched: "bg-info",
  recent: "bg-success",
};

// 「無視する」を押すときに使う段。手がかりの主題に一番近い段に固定する
const SUGGESTION_STAGE: Record<SuggestionKey, JourneyStage> = {
  no_schedule: "day",
  no_sheet: "flow",
  sheet_no_rows: "script",
  duration_gap: "flow",
  mic_unassigned: "script",
};

function markKey(targetDate: string | null, stage: JourneyStage, kind: string, hintKey: string | null): string {
  return `${targetDate ?? ""}|${stage}|${kind}|${hintKey ?? ""}`;
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatAt(at: string | undefined): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) + " " + d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function formatDayHeading(date: string | null, label: string | null): string {
  if (!date) return "日が決まっていない資料";
  const d = new Date(`${date}T00:00:00`);
  const dateStr = Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  return label ? `${dateStr}（${label}）` : dateStr;
}

interface JourneyDayCardProps {
  day: JourneyDay;
  marksByKey: Map<string, JourneyMarkRow>;
  onTogglePin: (targetDate: string | null, stage: JourneyStage, kind: "settled" | "watch") => void;
  onDismiss: (targetDate: string | null, suggestion: Suggestion, stage: JourneyStage) => void;
  pending: boolean;
}

export default function JourneyDayCard({ day, marksByKey, onTogglePin, onDismiss, pending }: JourneyDayCardProps) {
  const [open, setOpen] = useState(true);

  const visibleSuggestions = day.suggestions.filter((s) => {
    const stage = SUGGESTION_STAGE[s.key];
    return !marksByKey.get(markKey(day.date, stage, "dismissed", s.key));
  });

  // `day.docs` は進行台本以外（スケジュール表そのもの）も混ざる（MiniAppTiles の件数バッジ用）。
  // この見出しは「進行台本」専用なので、ここだけは絞り込む
  const sheetDocs = day.docs.filter((doc) => doc.app === "sheet");

  return (
    <section className="rounded-card border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-tap w-full items-center gap-2 px-4 py-3 text-left hover:bg-background sm:px-6"
      >
        <ChevronRight
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:text-base">
          {formatDayHeading(day.date, day.label)}
        </h2>
        {/* 3値の濃さだけを見せる要約（塗りつぶしの割合にしない） */}
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {day.stages.map((s) => (
            <span key={s.stage} className={`h-2 w-2 rounded-full ${TONE_DOT_CLASS[s.tone]}`} title={STAGE_LABEL[s.stage]} />
          ))}
        </div>
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="divide-y divide-border">
            {day.stages.map((stageHint) => {
              const settled = marksByKey.get(markKey(day.date, stageHint.stage, "settled", null));
              const watch = marksByKey.get(markKey(day.date, stageHint.stage, "watch", null));
              return (
                <div key={stageHint.stage} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT_CLASS[stageHint.tone]}`} aria-hidden="true" />
                      <span className="text-sm font-medium text-foreground">{STAGE_LABEL[stageHint.stage]}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stageHint.facts.length > 0
                        ? stageHint.facts.map((f, i) => (
                            <span key={f.key}>
                              {i > 0 ? " ・ " : ""}
                              {f.label}
                              {typeof f.count === "number" ? ` ${f.count}件` : ""}
                              {f.at ? `（${formatAt(f.at)} 更新）` : ""}
                            </span>
                          ))
                        : TONE_LABEL[stageHint.tone]}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="icon"
                      variant={settled ? "success" : "outline"}
                      className="h-11 w-11"
                      disabled={pending}
                      onClick={() => onTogglePin(day.date, stageHint.stage, "settled")}
                      aria-pressed={!!settled}
                      aria-label="決まった"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className={cn(
                        "h-11 w-11",
                        watch && "border-warning-border bg-warning-surface text-warning hover:bg-warning-surface",
                      )}
                      disabled={pending}
                      onClick={() => onTogglePin(day.date, stageHint.stage, "watch")}
                      aria-pressed={!!watch}
                      aria-label="要注意"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {day.frames.length > 0 && (
            <div className="border-t border-border px-4 py-3 sm:px-6">
              <h3 className="text-xs font-semibold text-muted-foreground">当日スケジュール</h3>
              <ul className="mt-2 space-y-1.5">
                {day.frames.map((f) => (
                  <li key={f.itemId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-number shrink-0 tabular-nums text-xs text-muted-foreground">
                      {formatMinutes(f.startMin)}–{formatMinutes(f.endMin)}
                    </span>
                    <Badge variant="outline" className="shrink-0">{f.columnLabel}</Badge>
                    <Badge variant="outline" className="shrink-0">{itemKindLabel(f.kind)}</Badge>
                    <span className="min-w-0 flex-1 truncate text-foreground">{f.title}</span>
                    {f.documentId && !f.linkBroken && (
                      <Link to={docPathOf("sheet", f.documentId)} className="shrink-0 text-xs text-primary hover:underline">
                        台本を開く
                      </Link>
                    )}
                    {f.documentId && f.linkBroken && (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />台本が見つかりません
                      </span>
                    )}
                    {!f.documentId && <span className="shrink-0 text-xs text-muted-foreground">台本なし</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sheetDocs.length > 0 && (
            <div className="border-t border-border px-4 py-3 sm:px-6">
              <h3 className="text-xs font-semibold text-muted-foreground">進行台本</h3>
              <ul className="mt-2 space-y-1.5">
                {sheetDocs.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Link to={docPathOf(doc.app, doc.id)} className="min-w-0 flex-1 truncate text-primary hover:underline">
                      {doc.title || "（無題）"}
                    </Link>
                    {doc.docNo && <span className="shrink-0 text-xs text-muted-foreground">{formatDocNo(doc.docNo)}</span>}
                    <span className="shrink-0 text-xs text-muted-foreground">{formatAt(doc.updatedAt)} 更新</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleSuggestions.length > 0 && (
            <div className="border-t border-border bg-muted/30 px-4 py-3 sm:px-6">
              <h3 className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />次に決めること
              </h3>
              <ul className="mt-2 space-y-2">
                {visibleSuggestions.map((s) => (
                  <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 text-foreground">{s.label}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.to && (
                        <Link to={s.to}>
                          <Button size="sm" variant="outline" className="min-h-[44px]">見る</Button>
                        </Link>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-[44px] text-muted-foreground"
                        disabled={pending}
                        onClick={() => onDismiss(day.date, s, SUGGESTION_STAGE[s.key])}
                      >
                        <X className="mr-1 h-4 w-4" />無視する
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
