/**
 * 制作のジャーニー — 案件（`/qsheet/projects/:id`）または資料単体
 * （`/qsheet/docs/:id`）ごとに「当日の枠 → 番組の流れ → 台本の中身」の3段で
 * いまの状態を見る画面。実装設計: docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md §6・§8（PR D・PR F）。
 *
 * **進み具合の判定はしない** — サーバーが返すのは数えた事実（件数・最終更新）と
 * 3値の手がかり（`blank` / `touched` / `recent`）だけ。「決まった」と言えるのは
 * 人が `production_journey_marks` にピンを押したときだけ（PR D）。
 */
import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft } from "lucide-react";
import { DashboardHeader, EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { notifyError } from "@/lib/notify";
import * as journeyApi from "@/lib/journeyApi";
import type { JourneyMarkRow } from "@/lib/journeyApi";
import type { JourneyStage, Suggestion } from "@gmo-onair/shared/src/production/journey";
import JourneyDayCard from "@/components/journey/JourneyDayCard";

export type JourneyScope = "project" | "document";

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
    queryFn: () => (scope === "project" ? journeyApi.getProjectJourney(id!) : journeyApi.getDocumentJourney(id!)),
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
  const backTo = scope === "project" ? "/qsheet/home" : "/qsheet/sheets";
  const backLabel = scope === "project" ? "案件を選ぶ画面に戻る" : "進行台本の一覧に戻る";
  const title = scope === "project" ? project?.name ?? "案件" : days[0]?.docs[0]?.title || "資料";

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
          scope === "project"
            ? "当日の枠 → 番組の流れ → 台本の中身の3段で、いまの状態を確認できます。"
            : "この資料の状態を、当日の枠・番組の流れ・台本の中身の3段で確認できます。"
        }
        period={project?.glsNumber ? `GLS: ${project.glsNumber}` : undefined}
      />

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
