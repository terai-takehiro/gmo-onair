/**
 * 制作のジャーニー — 案件（`/qsheet/projects/:id`）・番組（マニュアル・
 * `/qsheet/programs/:id`）・資料単体（`/qsheet/docs/:id`）ごとに
 * 「当日の枠 → 番組の流れ → 台本の中身」の3段でいまの状態を見る画面。
 * 実装設計: docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md §6・§8（PR D・PR F）。
 *
 * **進み具合の判定はしない** — サーバーが返すのは数えた事実（件数・最終更新）と
 * 3値の手がかり（`blank` / `touched` / `recent`）だけ。「決まった」と言えるのは
 * 人が `production_journey_marks` にピンを押したときだけ（PR D）。
 *
 * ⚠️ **`scope: "project" | "program"` はミニアプリのタイル（`MiniAppTiles`）へのハブでもある**
 * （2026-08-22 追加）。`/qsheet/top`（`ProductionTopPage.tsx`）で番組・イベントを選んだ先が
 * ここで、ここから進行台本・スケジュール表・収録配信の設定へ分岐する
 * （`docs/design/v4/qsheet-v4-coding/impl/08-recording-streaming-impl.md` が
 * 「01段（案件詳細のミニアプリ一覧タイル）」と呼んでいたものの実装）。
 * `scope: "document"`（資料単体）にはタイルを出さない — 資料はすでに1つに定まっており、
 * 「どのミニアプリを開くか」を訊く意味が無い。
 */
import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, FileText, CalendarDays, Settings2, Package, ChevronRight } from "lucide-react";
import type { ElementType } from "react";
import { DashboardHeader, EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { notifyError } from "@/lib/notify";
import * as journeyApi from "@/lib/journeyApi";
import type { JourneyMarkRow } from "@/lib/journeyApi";
import type { JourneyStage, Suggestion } from "@gmo-onair/shared/src/production/journey";
import { MINI_APP_BY_KEY, panelPathOf } from "@gmo-onair/shared/src/production/miniapps";
import JourneyDayCard from "@/components/journey/JourneyDayCard";

export type JourneyScope = "project" | "document" | "program";

interface JourneyPageProps {
  scope: JourneyScope;
}

function markKey(targetDate: string | null, stage: JourneyStage, kind: string, hintKey: string | null): string {
  return `${targetDate ?? ""}|${stage}|${kind}|${hintKey ?? ""}`;
}

export default function JourneyPage({ scope }: JourneyPageProps) {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const journeyQuery = useQuery({
    queryKey: ["qsheet-journey", scope, id],
    queryFn: () => {
      if (scope === "project") return journeyApi.getProjectJourney(id!);
      if (scope === "program") return journeyApi.getProgramJourney(id!);
      return journeyApi.getDocumentJourney(id!);
    },
    enabled: !!id,
  });

  const marksQuery = useQuery({
    queryKey: ["qsheet-journey-marks", scope, id],
    queryFn: () => journeyApi.listJourneyMarks(scope, id!),
    enabled: !!id,
  });

  const marksByKey = useMemo(() => {
    const map = new Map<string, JourneyMarkRow>();
    for (const m of marksQuery.data ?? []) {
      map.set(markKey(m.target_date, m.stage, m.kind, m.hint_key), m);
    }
    return map;
  }, [marksQuery.data]);

  const invalidateMarks = () => queryClient.invalidateQueries({ queryKey: ["qsheet-journey-marks", scope, id] });

  const createMark = useMutation({
    mutationFn: (payload: journeyApi.CreateMarkPayload) => journeyApi.createJourneyMark(payload),
    onSuccess: invalidateMarks,
    onError: () => notifyError("記録に失敗しました"),
  });

  const clearMark = useMutation({
    mutationFn: (markId: string) => journeyApi.clearJourneyMark(markId),
    onSuccess: invalidateMarks,
    onError: () => notifyError("取り消しに失敗しました"),
  });

  const pending = createMark.isPending || clearMark.isPending;

  const handleTogglePin = (targetDate: string | null, stage: JourneyStage, kind: "settled" | "watch") => {
    if (!id) return;
    const existing = marksByKey.get(markKey(targetDate, stage, kind, null));
    if (existing) {
      clearMark.mutate(existing.id);
    } else {
      createMark.mutate({ scope_type: scope, scope_id: id, target_date: targetDate, stage, kind });
    }
  };

  const handleDismiss = (targetDate: string | null, suggestion: Suggestion, stage: JourneyStage) => {
    if (!id) return;
    createMark.mutate({
      scope_type: scope,
      scope_id: id,
      target_date: targetDate,
      stage,
      kind: "dismissed",
      hint_key: suggestion.key,
    });
  };

  if (!id) return null;

  if (journeyQuery.isLoading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center gap-2 px-4 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">読み込み中…</span>
      </div>
    );
  }

  if (journeyQuery.isError || !journeyQuery.data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <EmptyState title="読み込めませんでした" description="時間を置いてもう一度お試しください。" />
      </div>
    );
  }

  const { project, days } = journeyQuery.data;
  const backTo = scope === "project" ? "/qsheet/home" : scope === "program" ? "/qsheet/top" : "/qsheet/sheets";
  const backLabel = scope === "project" ? "案件を選ぶ画面に戻る" : scope === "program" ? "トップに戻る" : "進行台本の一覧に戻る";
  const title = scope === "document" ? days[0]?.docs[0]?.title || "資料" : project?.name ?? (scope === "program" ? "番組" : "案件");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={backTo}
        className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>

      <DashboardHeader
        title={title}
        description={
          scope === "document"
            ? "この資料の状態を、当日の枠・番組の流れ・台本の中身の3段で確認できます。"
            : "当日の枠 → 番組の流れ → 台本の中身の3段で、いまの状態を確認できます。"
        }
        period={project?.glsNumber ? `GLS: ${project.glsNumber}` : undefined}
      />

      {(scope === "project" || scope === "program") && id && <MiniAppTiles scope={scope} id={id} />}

      {days.length === 0 && (
        <div className="mt-8">
          <EmptyState title="まだ何もありません" description="当日の枠や進行台本ができると、ここに表示されます。" />
        </div>
      )}

      <div className="mt-6 space-y-4">
        {days.map((day) => (
          <JourneyDayCard
            key={day.date ?? "undated"}
            day={day}
            marksByKey={marksByKey}
            onTogglePin={handleTogglePin}
            onDismiss={handleDismiss}
            pending={pending}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * ミニアプリのタイル。案件・番組（マニュアル）どちらのハブでも同じ形。
 *
 * 進行台本・スケジュール表は**一覧を絞り込んだ形**（`?project=` / `?program=`）で開く
 * — 「案件が見えていない」ではなく「その案件の分だけ見せる」ため（`SheetListPage.tsx` /
 * `ScheduleListPage.tsx` が読む）。収録設定・配信設定は一覧を持たない道具
 * （`kind: 'panel'`）なので、`panelPathOf` で直接その番組・案件の設定画面へ送る
 * （`DeviceSettingsHome.tsx` の GLS番号入力を経由しない — ここでは owner が既に分かっている）。
 */
function MiniAppTiles({ scope, id }: { scope: "project" | "program"; id: string }) {
  const filterKey = scope === "project" ? "project" : "program";
  const tiles: { key: string; label: string; description: string; icon: ElementType; to: string }[] = [
    {
      key: "sheet",
      label: MINI_APP_BY_KEY.sheet.label,
      description: "台本づくりと本番進行",
      icon: FileText,
      to: `/qsheet/sheets?${filterKey}=${encodeURIComponent(id)}`,
    },
    {
      key: "schedule",
      label: MINI_APP_BY_KEY.schedule.label,
      description: "香盤表",
      icon: CalendarDays,
      to: `/qsheet/schedules?${filterKey}=${encodeURIComponent(id)}`,
    },
    {
      key: "recording",
      label: MINI_APP_BY_KEY.recording.label,
      description: "収録の機材構成",
      icon: Settings2,
      to: `/qsheet/recording/${encodeURIComponent(id)}`,
    },
    {
      key: "streaming",
      label: MINI_APP_BY_KEY.streaming.label,
      description: "配信先・WEB会議",
      icon: Settings2,
      to: `/qsheet/streaming/${encodeURIComponent(id)}`,
    },
    {
      key: "rental",
      label: MINI_APP_BY_KEY.rental.label,
      description: "機材の横断検索と予約リスト",
      icon: Package,
      to: panelPathOf("rental", id),
    },
  ];

  return (
    <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.key}
          to={t.to}
          className="min-h-tap group flex flex-col items-start gap-1.5 rounded-card border border-border bg-card p-3 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-control bg-primary-surface-weak text-primary">
            <t.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex items-center gap-1">
            <span className="text-sub font-bold">{t.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="text-sub-sm text-muted-foreground">{t.description}</span>
        </Link>
      ))}
    </div>
  );
}
