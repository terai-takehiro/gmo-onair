// 会場図面の一覧（`/techops/venue-layouts`・段A）。`ManualListPage.tsx` と同じ作法
// （react-query・`?project=`/`?program=` の絞り込み・PageShell/PageHeader・状態チップ）。
// 設計: docs/design/v4/venue-layout.md §6①・モック `mockups/native/venue-layout/Main.dc.html`。
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpenText, Copy, MapPin, MoreHorizontal, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { FilterChips } from "@gmo-onair/shared/src/client/ui/filterChips";
import type { VenueLayoutSummary, VenueLayoutStatus } from "@gmo-onair/shared/src/venue/types";
import * as venueApi from "@/lib/venueApi";
import * as programsApi from "@/lib/programsApi";
import * as scheduleApi from "@/lib/scheduleApi";
import { notifyError, notifySuccess } from "@/lib/notify";
import { VENUE_STATUS_LABEL, VENUE_STATUS_BADGE_VARIANT } from "./venueStatus";
import CreateVenueLayoutDialog from "./CreateVenueLayoutDialog";

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type StatusFilter = "all" | VenueLayoutStatus;

function VenueRow({
  layout,
  onOpen,
  onDuplicate,
  duplicating,
}: {
  layout: VenueLayoutSummary;
  onOpen: (id: string) => void;
  onDuplicate: (layout: VenueLayoutSummary) => void;
  duplicating: boolean;
}) {
  const placeLabel = [layout.floorLabel, layout.areaLabel ?? "階全体"].filter(Boolean).join(" ・ ");
  const ownerLabel = layout.projectName
    ? `${layout.glsNumber ? `${layout.glsNumber} ・ ` : ""}${layout.projectName}`
    : layout.programName ?? "";
  const bookedManual = layout.linkedManuals?.[0];

  return (
    <div className="flex w-full items-start gap-1 rounded-card border border-border bg-card p-4 hover:bg-accent">
      <button
        type="button"
        onClick={() => onOpen(layout.id)}
        className="flex min-h-tap min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <div className="flex w-full flex-wrap items-center gap-2">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-cardtitle text-foreground">{layout.title || "（無題）"}</span>
          {layout.docNo && <span className="font-number text-sub-sm text-muted-foreground">{layout.docNo}</span>}
          {layout.planLabel && (
            <span className="rounded-badge-xs bg-muted px-1.5 text-badge text-muted-foreground">{layout.planLabel}</span>
          )}
          <Badge variant={VENUE_STATUS_BADGE_VARIANT[layout.status]} className="ml-auto">
            {VENUE_STATUS_LABEL[layout.status]}
            {layout.status === "fixed" && layout.rev > 0 && <span className="font-number ml-1">rev.{layout.rev}</span>}
          </Badge>
        </div>
        {ownerLabel && <div className="text-sub text-muted-foreground">{ownerLabel}</div>}
        <div className="flex flex-wrap gap-x-3 text-sub-sm text-muted-foreground">
          {placeLabel && <span>{placeLabel}</span>}
          <span>更新 {formatUpdatedAt(layout.updatedAt)}</span>
          {layout.updaterName && <span>{layout.updaterName}</span>}
        </div>
        {bookedManual && (
          <div className="mt-0.5 flex items-center gap-1.5 rounded-note bg-success-surface px-2 py-1 text-sub-sm text-success">
            <BookOpenText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            冊子 {bookedManual.docNo ?? bookedManual.title} に載っています
            {bookedManual.status !== "draft" && "（確定済）"}
          </div>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="min-h-tap min-w-tap"
          onClick={() => onDuplicate(layout)}
          disabled={duplicating}
          title="複製"
          aria-label="複製"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="min-h-tap min-w-tap"
          disabled
          title="その他の操作（削除・確定を解く）は編集画面から"
          aria-label="その他"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export default function VenueListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const projectFilter = searchParams.get("project");
  const programFilter = searchParams.get("program");
  const hasOwnerFilter = !!(projectFilter || programFilter);

  const listQuery = useQuery({
    queryKey: ["venue-layouts", "list", projectFilter, programFilter],
    queryFn: () => venueApi.listVenueLayouts({
      project: projectFilter || undefined,
      program: programFilter || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: rows.length, draft: 0, fixed: 0, archived: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    next.delete("program");
    setSearchParams(next);
  };

  // 名前の表示だけに使う（`ScheduleListPage.tsx`/`ManualListPage.tsx` と同じ `/lookup` 系）
  const projectCtxQuery = useQuery({
    queryKey: ["lookup", "project-context", projectFilter],
    queryFn: () => scheduleApi.getProjectContext(projectFilter as string),
    enabled: !!projectFilter,
  });
  const programQuery = useQuery({
    queryKey: ["techops", "program", programFilter],
    queryFn: () => programsApi.getProgram(programFilter as string),
    enabled: !!programFilter,
  });
  const ownerName = projectCtxQuery.data?.name ?? programQuery.data?.name ?? null;

  const duplicateMutation = useMutation({
    mutationFn: (layout: VenueLayoutSummary) => venueApi.copyVenueLayout(layout.id, {
      title: `${layout.title}（複製）`,
      plan_label: layout.planLabel,
    }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["venue-layouts", "list"] });
      notifySuccess(`${row.docNo ?? row.title} を作りました`, { description: "複製した図面の編集画面を開けます。" });
    },
    onError: () => notifyError("複製できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  return (
    <PageShell>
      <PageHeader
        title="会場図面"
        sub="会場の下敷きに品目を実寸で置き、運営マニュアルに縮尺つきで載せます。"
        primaryAction={
          <Button className="min-h-tap" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />会場図面を作る
          </Button>
        }
      />

      {hasOwnerFilter && (
        <div className="flex items-center gap-2 rounded-note border border-border bg-primary/5 px-4 py-2.5" role="status">
          <span className="text-sub">
            <span>{ownerName ?? "…"}</span>
            の会場図面
          </span>
          <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={clearFilter} aria-label="絞り込み解除">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <FilterChips
        label="状態で絞り込む"
        value={statusFilter}
        onChange={setStatusFilter}
        items={[
          { key: "all", label: "すべて", count: counts.all },
          { key: "draft", label: "下書き", count: counts.draft },
          { key: "fixed", label: "確定", count: counts.fixed },
          { key: "archived", label: "過去の版", count: counts.archived },
        ]}
      />

      {listQuery.isLoading && (
        <Delayed>
          <SkeletonRows rows={4} />
        </Delayed>
      )}

      {listQuery.isError && (
        <ErrorPanel title="会場図面を読み込めませんでした" error={listQuery.error} onRetry={() => listQuery.refetch()} />
      )}

      {!listQuery.isLoading && !listQuery.isError && filteredRows.length === 0 && (
        <EmptyState
          icon={<MapPin />}
          title="この条件に合う会場図面はありません"
          description="「会場図面を作る」から最初の1枚を作れます。"
        />
      )}

      <div className="space-y-2">
        {filteredRows.map((layout) => (
          <VenueRow
            key={layout.id}
            layout={layout}
            onOpen={(id) => navigate(`/techops/venue-layouts/${id}`)}
            onDuplicate={(l) => duplicateMutation.mutate(l)}
            duplicating={duplicateMutation.isPending}
          />
        ))}
      </div>

      <CreateVenueLayoutDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lockedOwner={hasOwnerFilter ? { projectId: projectFilter, programId: programFilter, label: ownerName ?? "" } : undefined}
        onCreated={(row) => {
          queryClient.invalidateQueries({ queryKey: ["venue-layouts", "list"] });
          navigate(`/techops/venue-layouts/${row.id}`);
        }}
      />
    </PageShell>
  );
}
