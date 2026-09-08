/**
 * 制作のジャーニー — 案件（`/techops/projects/:id`）・番組（マニュアル・
 * `/techops/programs/:id`）・資料単体（`/techops/docs/:id`）ごとに
 * 「当日の枠 → 番組の流れ → 台本の中身」の3段でいまの状態を見る画面。
 * 実装設計: docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md §6・§8（PR D・PR F）。
 *
 * **進み具合の判定はしない** — サーバーが返すのは数えた事実（件数・最終更新）と
 * 3値の手がかり（`blank` / `touched` / `recent`）だけ。「決まった」と言えるのは
 * 人が `production_journey_marks` にピンを押したときだけ（PR D）。
 *
 * ⚠️ **`scope: "project" | "program"` はミニアプリのタイル（`MiniAppTiles`）へのハブでもある**
 * （2026-08-22 追加）。`/techops/top`（`ProductionTopPage.tsx`）で番組・イベントを選んだ先が
 * ここで、ここから進行台本・スケジュール表・収録配信の設定へ分岐する
 * （`docs/design/v4/qsheet-v4-coding/impl/08-recording-streaming-impl.md` が
 * 「01段（案件詳細のミニアプリ一覧タイル）」と呼んでいたものの実装）。
 * `scope: "document"`（資料単体）にはタイルを出さない — 資料はすでに1つに定まっており、
 * 「どのミニアプリを開くか」を訊く意味が無い。
 */
import { useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft } from "lucide-react";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { notifyError } from "@/lib/notify";
import * as journeyApi from "@/lib/journeyApi";
import type { JourneyMarkRow } from "@/lib/journeyApi";
import type { JourneyStage, Suggestion } from "@gmo-onair/shared/src/production/journey";
import { recordRecentTop } from "@/lib/recentTop";
import { setProductionNavContext } from "@/lib/productionNavContext";
import MiniAppTiles from "@/components/journey/MiniAppTiles";
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
    onError: () => notifyError("記録できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const clearMark = useMutation({
    mutationFn: (markId: string) => journeyApi.clearJourneyMark(markId),
    onSuccess: invalidateMarks,
    onError: () => notifyError("取り消せませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const pending = createMark.isPending || clearMark.isPending;

  // 「続きから」（トップページ）用の閲覧履歴。ハブを開けたら記録する（localStorage・端末ごと）。
  // 資料単体（scope: "document"）は対象外 — トップの一覧に資料単体の項目は無いため。
  useEffect(() => {
    if (scope !== "project" && scope !== "program") return;
    if (!id || !journeyQuery.data) return;
    const name = journeyQuery.data.project?.name;
    if (name) recordRecentTop(scope, id, name);
  }, [scope, id, journeyQuery.data]);

  // サイドバー・スマホ下タブ（buildQsheetNav）へ「いまの案件/番組」を伝える。
  // 資料単体（scope: "document"）は案件/番組の文脈ではないため対象外。
  useEffect(() => {
    if (scope !== "project" && scope !== "program") return;
    if (!id) return;
    setProductionNavContext({ scope, id, label: journeyQuery.data?.project?.name ?? null });
  }, [scope, id, journeyQuery.data]);

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
      <PageShell>
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sub">読み込み中…</span>
        </div>
      </PageShell>
    );
  }

  if (journeyQuery.isError || !journeyQuery.data) {
    return (
      <PageShell>
        <EmptyState title="読み込めませんでした" description="時間を置いてもう一度お試しください。" />
      </PageShell>
    );
  }

  const { project, days } = journeyQuery.data;
  const backTo = scope === "project" ? "/techops/home" : scope === "program" ? "/techops/top" : "/techops/sheets";
  const backLabel = scope === "project" ? "案件を選ぶ画面に戻る" : scope === "program" ? "トップに戻る" : "進行台本の一覧に戻る";
  const title = scope === "document" ? days[0]?.docs[0]?.title || "資料" : project?.name ?? (scope === "program" ? "番組" : "案件");

  return (
    <PageShell>
      {/* **戻る導線は見出しと別の行にする**（1行に押し込むと 375px で見出しが縦に
          折り返る。理由は `_rules.md`「5. ページの外枠」） */}
      <Link
        to={backTo}
        className="inline-flex min-h-tap w-fit items-center gap-1 text-list text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>

      {/*
        ⚠️ **この画面の説明文を `sub` に入れないこと。** `[data-page-sub]` は
        1023px までで1行に切り詰める（`tokens-v4.css`）。件数のように
        「頭だけ読めれば足りる」文のための規則なので、**画面の目的そのもの**を
        入れると 375px で後半が読めなくなる（作り直しの過程で一度そうしてしまい、
        Codex レビュー #647 で指摘された）。`sub` には短い番号だけを置き、
        説明は折り返る段落として見出しの下に出す（AIナレッジと同じ形）。
      */}
      <PageHeader title={title} sub={project?.glsNumber ? `GLS: ${project.glsNumber}` : undefined} />
      <p className="text-note text-muted-foreground">
        {scope === "document"
          ? "この資料の状態を、当日スケジュール・番組進行・進行台本の内容の3段で確認できます。"
          : "当日スケジュール → 番組進行 → 進行台本の内容の3段で、いまの状態を確認できます。"}
      </p>

      {(scope === "project" || scope === "program") && id && <MiniAppTiles scope={scope} id={id} days={days} />}

      {days.length === 0 && (
        <EmptyState title="まだ何もありません" description="当日スケジュールや進行台本ができると、ここに表示されます。" />
      )}

      <div className="flex flex-col gap-4">
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
    </PageShell>
  );
}
