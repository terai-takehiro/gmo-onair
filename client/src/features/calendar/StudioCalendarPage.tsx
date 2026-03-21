import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { DatesSetArg, EventClickArg } from "@fullcalendar/core";

const statusColorMap: Record<string, string> = {
  tentative: "#f59e0b",
  confirmed: "#005bac",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

export default function StudioCalendarPage() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    to: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 0).toISOString().split("T")[0],
  });

  const { data: events, isLoading } = useQuery({
    queryKey: ["calendar-events", dateRange.from, dateRange.to],
    queryFn: async () => {
      const res = await api.get("/calendar/events", {
        params: { from: dateRange.from, to: dateRange.to },
      });
      return res.data.data;
    },
  });

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      from: arg.startStr.split("T")[0],
      to: arg.endStr.split("T")[0],
    });
  }, []);

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const projectId = info.event.extendedProps.project_id;
      if (projectId) {
        navigate(`/projects/${projectId}`);
      }
    },
    [navigate]
  );

  const calendarEvents = (events ?? []).map(
    (e: {
      id: string;
      title: string;
      start: string;
      end: string;
      type: string;
      status: string;
      gls_number?: string;
      project_id?: string;
    }) => ({
      id: e.id,
      title: e.gls_number ? `${e.gls_number} ${e.title}` : e.title,
      start: e.start,
      end: e.end,
      backgroundColor: statusColorMap[e.status] || "#6b7280",
      borderColor: statusColorMap[e.status] || "#6b7280",
      textColor: "#ffffff",
      classNames: e.type === "rehearsal" ? ["opacity-75"] : [],
      extendedProps: {
        project_id: e.project_id,
        type: e.type,
        status: e.status,
      },
    })
  );

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">カレンダー</h1>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: "#f59e0b" }} />
          <span>仮</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: "#005bac" }} />
          <span>確定</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: "#22c55e" }} />
          <span>完了</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded" style={{ backgroundColor: "#ef4444" }} />
          <span>中止</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale="ja"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{
                today: "今日",
                month: "月",
                week: "週",
                day: "日",
              }}
              events={calendarEvents}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              height="auto"
              eventDisplay="block"
              dayMaxEvents={3}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
