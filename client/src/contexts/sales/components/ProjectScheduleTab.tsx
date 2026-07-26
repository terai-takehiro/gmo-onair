/**
 * 案件の「予定」タブ (デザイン 13章 7a / 仕様書 §7.12)
 *
 * この案件に紐づく予約だけを出す。
 * **仮押さえが残っていれば、いつまでに本予約へ切り替えるか**をサーバーが返した日付で出す
 * (画面で日付を計算すると、案件一覧と違う期限が出る)。
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ErrorPanel, SkeletonCard, EmptyState } from "@gmo-onair/shared/src/client/states";
import { CalendarDays, Plus, AlertTriangle, DoorOpen, Table2, BookOpen } from "lucide-react";

interface Booking {
  id: string; label: string; booking_type: string; status: string;
  all_day: boolean; start_time: string | null; end_time: string | null;
  rooms: string | null; no_room: boolean;
}
interface ScheduleView {
  event_start: string | null;
  event_end: string | null;
  bookings: Booking[];
  dates: Array<{ date: string; label: string | null }>;
  hold_count: number;
  hold_deadline: string | null;
  missing_room_count: number;
}

const DOT: Record<string, string> = {
  performance: "bg-negative",
  rehearsal: "bg-warning",
  hold: "bg-warning/60",
  setup: "bg-primary",
  other: "bg-muted-foreground",
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 「10/03（土）9:00〜20:00」の形。終日なら時刻を出さない */
function when(b: Booking): string {
  if (!b.start_time) return "日付未定";
  const s = new Date(b.start_time);
  const md = `${s.getMonth() + 1}/${String(s.getDate()).padStart(2, "0")}（${WD[s.getDay()]}）`;
  if (b.all_day) return `${md} 終日`;
  const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const e = b.end_time ? new Date(b.end_time) : null;
  return e ? `${md} ${hm(s)}〜${hm(e)}` : `${md} ${hm(s)}`;
}

const md = (d: string) => {
  const p = d.slice(0, 10).split("-");
  return p.length >= 3 ? `${Number(p[1])}/${Number(p[2])}` : d;
};

export default function ProjectScheduleTab({
  projectId, canEdit,
}: { projectId: string; canEdit: boolean }) {
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: ScheduleView }>({
    queryKey: ["project-schedule", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/schedule`)).data,
  });
  const view = data?.data;

  if (isLoading) return <SkeletonCard />;
  if (isError || !view) {
    return <ErrorPanel title="予定を読めませんでした" error={error} onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          この案件のスタジオの日程です。カレンダーからも同じものが見えます。
        </p>
        <div className="flex flex-wrap gap-2">
          {/* 香盤表 (21章)。当日の動きは予定の続きなのでここから開く */}
          <Button variant="outline" size="sm" className="min-h-[44px] gap-1"
            onClick={() => navigate(`/sales/projects/${projectId}/call-sheet`)}>
            <Table2 className="h-4 w-4" aria-hidden="true" />
            香盤表
          </Button>
          <Button variant="outline" size="sm" className="min-h-[44px] gap-1"
            onClick={() => navigate(`/sales/projects/${projectId}/manual`)}>
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            運営マニュアル
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" className="min-h-[44px] gap-1"
              onClick={() => navigate(`/schedule?project_id=${projectId}`)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              足す
            </Button>
          )}
        </div>
      </div>

      {view.bookings.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
          title="まだ日程が押さえられていません"
          description="仮押さえにするときに、日付と部屋をその場で聞きます。"
          action={canEdit ? (
            <Button size="sm" className="min-h-[44px]"
              onClick={() => navigate(`/schedule?project_id=${projectId}`)}>
              カレンダーで押さえる
            </Button>
          ) : undefined}
        />
      ) : (
        <ul className="rounded-xl border border-divider">
          {view.bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-row p-3 last:border-0">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[b.booking_type] ?? DOT.other}`} aria-hidden="true" />
              <span className="w-28 shrink-0 text-sm font-medium">{b.label}</span>
              <span className="text-sm">{when(b)}</span>
              <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
                <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {b.rooms ?? <span className="text-warning">部屋が決まっていません</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 仮押さえが残っているときの期限 */}
      {view.hold_count > 0 && view.hold_deadline && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          仮押さえが {view.hold_count}件あります。
          <strong>{md(view.hold_deadline)} までに本予約へ切り替えてください。</strong>
        </p>
      )}

      {/* 部屋の付いていない予約 (既存データに残っている分) */}
      {view.missing_room_count > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          部屋が決まっていない予約が {view.missing_room_count}件あります。
          どの部屋が埋まったか分からないので、カレンダーで部屋を選んでください。
        </p>
      )}

      {/* 案件そのものが持つ日程 (飛び日を含む) */}
      {view.dates.length > 0 && (
        <div>
          <h3 className="text-sm font-bold">案件の日程</h3>
          <ul className="mt-1 flex flex-wrap gap-2">
            {view.dates.map((d) => (
              <li key={d.date} className="rounded-lg border border-divider px-2 py-1 text-sm">
                {md(d.date)}
                {d.label && <span className="pl-1 text-xs text-muted-foreground">{d.label}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
