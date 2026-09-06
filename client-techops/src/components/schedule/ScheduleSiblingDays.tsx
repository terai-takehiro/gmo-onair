// 表のヘッダーに出す「同じイベントの他の日」チップ。14-schedule-v2-plan.md §3-3・§4-2 (b)
//
// 1日しか無いイベントではチップを出さない。前日／翌日の矢印は付けない
// （飛び日のイベントで意味がずれるため・§3-3）。
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDateJp } from "@/lib/dateFmt";
import { cn } from "@/lib/utils";
import * as scheduleApi from "@/lib/scheduleApi";

interface Props {
  projectId: string | null | undefined;
  programId: string | null | undefined;
  currentId: string;
}

export default function ScheduleSiblingDays({ projectId, programId, currentId }: Props) {
  const navigate = useNavigate();
  const enabled = !!(projectId || programId);

  // 一覧ページの絞り込み結果とは別の鍵にしてある — こちらは拠点・状態・検索の
  // 絞り込みを一切かけない「そのイベントの全日」が要るため（一覧側の鍵と混ぜると、
  // 一覧の絞り込み次第でここの日数が減ってしまう）
  const siblingsQuery = useQuery({
    queryKey: ["schedule-siblings", projectId, programId],
    queryFn: () => scheduleApi.listSchedules({
      project_id: projectId || undefined,
      program_id: programId || undefined,
    }),
    enabled,
  });

  const days = [...(siblingsQuery.data ?? [])].sort((a, b) => a.service_date.localeCompare(b.service_date));
  if (days.length <= 1) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="同じイベントの他の日">
      {days.map((d) => {
        const current = d.id === currentId;
        return (
          <button
            key={d.id}
            type="button"
            disabled={current}
            onClick={() => navigate(`/techops/schedules/${d.id}`)}
            className={cn(
              "min-h-[44px] rounded-full border px-2.5 text-xs",
              current ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {formatDateJp(d.service_date)}
          </button>
        );
      })}
    </div>
  );
}
