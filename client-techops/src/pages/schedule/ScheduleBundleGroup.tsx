// 一覧の1束（イベント）分。14-schedule-v2-plan.md §3-3・§4-2 (a)
import { useNavigate } from "react-router-dom";
import { Calendar } from "lucide-react";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { formatDateJp } from "@/lib/dateFmt";
import { SCHEDULE_STATUS_LABEL, SCHEDULE_STATUS_BADGE_VARIANT } from "@/components/schedule/scheduleStatus";
import type { ScheduleBundle } from "./scheduleBundles";

export default function ScheduleBundleGroup({ bundle }: { bundle: ScheduleBundle }) {
  const navigate = useNavigate();
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-1.5">
        <h2 className="text-sm font-bold text-foreground">{bundle.label}</h2>
        <span className="text-xs text-muted-foreground">
          {bundle.schedules.length} 日
          {bundle.memberCount != null && ` ・ メンバー ${bundle.memberCount} 人`}
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {bundle.schedules.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/techops/schedules/${s.id}`)}
            className="flex w-full min-h-[44px] flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent"
          >
            <div className="flex w-full flex-wrap items-center gap-2">
              <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-base font-semibold text-foreground">{formatDateJp(s.service_date)}</span>
              {s.location_name && <span className="text-sm text-muted-foreground">・ {s.location_name}</span>}
              <Badge variant={SCHEDULE_STATUS_BADGE_VARIANT[s.status]} className="ml-auto">
                {SCHEDULE_STATUS_LABEL[s.status]}
              </Badge>
            </div>
            <div className="text-sm text-foreground">{s.title || "（無題）"}</div>
            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>項目 {s.item_count ?? 0} 件</span>
              <span>共有 {s.share_count ?? 0} 人</span>
              <span>更新 {new Date(s.updated_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
