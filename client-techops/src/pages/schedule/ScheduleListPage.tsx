// スケジュール表の一覧。実装設計: 04-schedule-impl.md §5-2
// 「進んでいる／遅れている」という形容詞は出さない。出すのは日付・拠点・題・案件・件数・最終更新だけ。
//
// ⚠️ `?project=` / `?program=` フィルタは 2026-08-22 追加（`JourneyPage.tsx` の
// ミニアプリタイルから来る）。`SheetListPage.tsx` の `?project=` と揃えたクエリ名
// （API 側は `project_id`/`program_id`）。新規作成もそのままこの案件・番組に紐付ける
// （フィルタで来ている時点で owner は決まっているので、選び直すダイアログは設けない）。
//
// 2026-09-06 決定（14-schedule-v2-plan.md §3-3・§3 B6）:
// 「イベント（案件・番組）ごとにまとめる」＋拠点・状態・検索の絞り込みを追加した。
import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { useDebounced } from "@gmo-onair/shared/src/client/hooks/useDebounced";
import * as scheduleApi from "@/lib/scheduleApi";
import CreateScheduleDialog from "@/components/schedule/CreateScheduleDialog";
import ScheduleListFilters, { type StatusFilter } from "./ScheduleListFilters";
import ScheduleBundleGroup from "./ScheduleBundleGroup";
import { bundleSchedules } from "./scheduleBundles";

export default function ScheduleListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  const projectFilter = searchParams.get("project");
  const programFilter = searchParams.get("program");
  const locationFilter = searchParams.get("location") || "";
  // "保管" は既定の絞り込みから外れる（§4-4）。ここでは「すべて」を選んでいるときだけ
  // 取得したあとで保管を除く（サーバーには status を送らず、取り違えたら怖いので明示フィルタは
  // サーバー任せ・除外だけ画面側で行う）
  const statusFilter = (searchParams.get("status") as StatusFilter | null) || "all";

  const setQueryParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const locationsQuery = useQuery({
    queryKey: ["studio-rooms"],
    queryFn: scheduleApi.listStudioRooms,
    staleTime: 5 * 60 * 1000,
  });

  const listQuery = useQuery({
    queryKey: ["schedules", "list", projectFilter, programFilter, locationFilter, statusFilter, debouncedSearch],
    queryFn: () => scheduleApi.listSchedules({
      date_from: projectFilter || programFilter ? undefined : new Date().toISOString().slice(0, 10),
      project_id: projectFilter || undefined,
      program_id: programFilter || undefined,
      location_id: locationFilter || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      search: debouncedSearch || undefined,
    }),
    // 遅らせた検索語が切り替わる瞬間に一覧を骨組みへ戻さない（`SheetListPage.tsx` と同じ形）
    placeholderData: keepPreviousData,
  });

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    next.delete("program");
    setSearchParams(next);
  };

  // 「すべて」選択中は保管を隠す（§4-4「保管は一覧の既定絞り込みから外れる」）。
  // 「保管」を明示的に選んだときはサーバー側の status フィルタでちょうど保管だけが返る
  const visibleRows = (listQuery.data ?? []).filter((s) => statusFilter !== "all" || s.status !== "archived");
  const bundles = bundleSchedules(visibleRows);

  const filterLabel = visibleRows.find((s) => s.project_name || s.program_name);
  const lockedOwner = (projectFilter || programFilter) && filterLabel
    ? { projectId: projectFilter, programId: programFilter, label: filterLabel.project_name ?? filterLabel.program_name ?? "" }
    : undefined;

  return (
    <PageShell>
      <PageHeader
        title="スケジュール表"
        sub="会場×時間軸で当日の動きを1日1枚に置きます。"
        primaryAction={
          <Button className="min-h-tap" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />新しく作る
          </Button>
        }
      />

      {(projectFilter || programFilter) && filterLabel && (
        <div className="flex items-center gap-2 rounded-note border border-border bg-primary/5 px-4 py-2.5" role="status">
          <span className="text-sub">
            <span>{filterLabel.project_name ?? filterLabel.program_name}</span>
            のスケジュール表
          </span>
          <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={clearFilter} aria-label="絞り込み解除">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <ScheduleListFilters
        locations={locationsQuery.data ?? []}
        locationId={locationFilter}
        onLocationChange={(v) => setQueryParam("location", v)}
        status={statusFilter}
        onStatusChange={(v) => setQueryParam("status", v === "all" ? "" : v)}
        search={search}
        onSearchChange={setSearch}
      />

      {listQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sub">読み込み中…</span>
        </div>
      )}

      {!listQuery.isLoading && bundles.length === 0 && (
        <EmptyState
          title="この条件に合う表はありません"
          description={debouncedSearch || locationFilter || statusFilter !== "all" ? "絞り込みを変えるか、「新しく作る」から最初の1枚を作れます。" : "「新しく作る」から最初の1枚を作れます。"}
        />
      )}

      <div className="space-y-6">
        {bundles.map((b) => <ScheduleBundleGroup key={b.key} bundle={b} />)}
      </div>

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lockedOwner={lockedOwner}
        onCreated={(row) => {
          queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
          navigate(`/techops/schedules/${row.id}`);
        }}
      />
    </PageShell>
  );
}
