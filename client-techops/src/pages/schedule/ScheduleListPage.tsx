// スケジュール表の一覧。実装設計: 04-schedule-impl.md §5-2
// 「進んでいる／遅れている」という形容詞は出さない。出すのは日付・拠点・題・案件・件数・最終更新だけ。
//
// ⚠️ `?project=` / `?program=` フィルタは 2026-08-22 追加（`JourneyPage.tsx` の
// ミニアプリタイルから来る）。`SheetListPage.tsx` の `?project=` と揃えたクエリ名
// （API 側は `project_id`/`program_id`）。新規作成もそのままこの案件・番組に紐付ける
// （フィルタで来ている時点で owner は決まっているので、選び直すダイアログは設けない）。
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Plus, Calendar, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardHeader, EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { notifyError } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";

export default function ScheduleListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));

  const projectFilter = searchParams.get("project");
  const programFilter = searchParams.get("program");

  const listQuery = useQuery({
    queryKey: ["schedules", "list", projectFilter, programFilter],
    queryFn: () => scheduleApi.listSchedules({
      date_from: projectFilter || programFilter ? undefined : new Date().toISOString().slice(0, 10),
      project_id: projectFilter || undefined,
      program_id: programFilter || undefined,
    }),
  });

  const createMutation = useMutation({
    mutationFn: () => scheduleApi.createSchedule({
      title: title || "無題のスケジュール表",
      service_date: serviceDate,
      project_id: projectFilter || null,
      program_id: programFilter || null,
    }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
      setCreateOpen(false);
      navigate(`/qsheet/schedules/${row.id}`);
    },
    onError: () => notifyError("作成に失敗しました"),
  });

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    next.delete("program");
    setSearchParams(next);
  };

  const filterLabel = (listQuery.data ?? []).find((s) => s.project_name || s.program_name);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <DashboardHeader
        title="スケジュール表"
        description="会場×時間軸で当日の動きを1日1枚に置きます。"
        controls={
          <Button className="min-h-[44px]" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />新しく作る
          </Button>
        }
      />

      {(projectFilter || programFilter) && filterLabel && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-primary/5 px-4 py-2.5" role="status">
          <span className="text-sm">
            <span className="font-medium">{filterLabel.project_name ?? filterLabel.program_name}</span>
            のスケジュール表
          </span>
          <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={clearFilter} aria-label="絞り込み解除">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {listQuery.isLoading && (
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">読み込み中…</span>
        </div>
      )}

      {!listQuery.isLoading && (listQuery.data?.length ?? 0) === 0 && (
        <div className="mt-8">
          <EmptyState title="まだスケジュール表がありません" description="「新しく作る」から最初の1枚を作れます。" />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {(listQuery.data ?? []).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/qsheet/schedules/${s.id}`)}
            className="flex w-full min-h-[44px] flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent"
          >
            <div className="flex w-full items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-base font-semibold text-foreground">{s.service_date}</span>
              {s.location_name && <span className="text-sm text-muted-foreground">・ {s.location_name}</span>}
            </div>
            <div className="text-sm text-foreground">{s.title || "（無題）"}</div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {s.project_name && <span>案件: {s.gls_number ? `${s.gls_number} ` : ""}{s.project_name}</span>}
              {s.program_name && <span>番組: {s.program_name}</span>}
              <span>項目 {s.item_count ?? 0} 件</span>
              <span>共有 {s.share_count ?? 0} 人</span>
              <span>更新 {new Date(s.updated_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>スケジュール表を新しく作る</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-schedule-title">題</Label>
              <Input id="new-schedule-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 min-h-[44px]" placeholder="例: 本番当日" />
            </div>
            <div>
              <Label htmlFor="new-schedule-date">日付</Label>
              <Input id="new-schedule-date" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className="mt-1 min-h-[44px]" />
            </div>
          </div>
          <DialogFooter>
            <Button className="min-h-[44px]" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>作る</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
