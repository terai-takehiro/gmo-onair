import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface StudioLocation {
  id: string;
  name: string;
  sort_order: number;
  rooms: StudioRoom[];
}

interface BookingRoom {
  room_id: string;
  room_name: string;
  room_color: string;
  room_type?: string;
  location_id: string;
  occupant?: string;
  usage_note?: string;
}

interface StudioBooking {
  id: string;
  title: string;
  booking_type: string;
  project_id: string | null;
  episode_id: string | null;
  all_day: number;
  start_time: string;
  end_time: string;
  location_note: string | null;
  notes: string | null;
  project_name: string | null;
  gls_number: string | null;
  episode_code: string | null;
  rooms: BookingRoom[];
}

const bookingTypeColors: Record<string, string> = {
  project: "#3b82f6",
  maintenance: "#ef4444",
  tour: "#8b5cf6",
  internal: "#f59e0b",
  other: "#6b7280",
};

const SLOT_START = 0; // 00:00
const SLOT_END = 24; // 24:00
const SLOT_HEIGHT = 48; // px per 30min slot
const SLOTS_PER_HOUR = 2;
const TOTAL_SLOTS = (SLOT_END - SLOT_START) * SLOTS_PER_HOUR;

type LocationTab = "yoga" | "shibuya" | "other";

function getLocationTab(locationName: string): LocationTab {
  if (locationName.includes("用賀")) return "yoga";
  if (locationName.includes("渋谷")) return "shibuya";
  return "other";
}

function formatTime(hour: number, min: number): string {
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractDatePart(timeStr: string): string {
  // Handle both "2026-03-29" and "2026-03-29T10:00:00" formats
  return timeStr.split("T")[0];
}

function timeToSlot(timeStr: string): number {
  // Parse time part from string like "2026-03-29T10:00:00" or "10:00:00"
  const timePart = timeStr.includes("T") ? timeStr.split("T")[1] : null;
  if (!timePart) return 0; // Date-only string = start of day
  const [hh, mm] = timePart.split(":").map(Number);
  const totalMin = (hh - SLOT_START) * 60 + mm;
  return Math.max(0, Math.min(TOTAL_SLOTS, Math.round(totalMin / 30)));
}

interface KoubanViewProps {
  date: Date;
  locations: StudioLocation[];
  bookings: StudioBooking[];
  onDateChange: (date: Date) => void;
  onBookingClick: (booking: StudioBooking) => void;
  onSlotClick?: (roomId: string, start: string, end: string) => void;
}

export default function KoubanView({
  date,
  locations,
  bookings,
  onDateChange,
  onBookingClick,
  onSlotClick,
}: KoubanViewProps) {
  const [activeTab, setActiveTab] = useState<LocationTab>("yoga");

  const dateStr = toLocalDateStr(date);
  const dateLabel = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const weekDay = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];

  // Get rooms for active tab
  const filteredRooms = useMemo(() => {
    const rooms: StudioRoom[] = [];
    for (const loc of locations) {
      if (getLocationTab(loc.name) === activeTab) {
        rooms.push(...loc.rooms);
      }
    }
    rooms.sort((a, b) => a.sort_order - b.sort_order);
    return rooms;
  }, [locations, activeTab]);

  // Get "other" bookings (no rooms, external locations)
  const otherBookings = useMemo(() => {
    if (activeTab !== "other") return [];
    return bookings.filter((b) => {
      const bStartDate = extractDatePart(b.start_time);
      const bEndDate = extractDatePart(b.end_time);
      return bStartDate <= dateStr && bEndDate >= dateStr && b.rooms.length === 0;
    });
  }, [bookings, dateStr, activeTab]);

  // Map bookings to room slots
  const roomBookings = useMemo(() => {
    const map = new Map<string, { booking: StudioBooking; room: BookingRoom; startSlot: number; endSlot: number }[]>();

    for (const room of filteredRooms) {
      map.set(room.id, []);
    }

    for (const b of bookings) {
      const bStartDate = extractDatePart(b.start_time);
      const bEndDate = extractDatePart(b.end_time);
      // Check if booking overlaps with current date
      if (bStartDate > dateStr || bEndDate < dateStr) continue;

      for (const room of b.rooms) {
        if (!map.has(room.room_id)) continue;

        let startSlot: number;
        let endSlot: number;

        if (b.all_day) {
          startSlot = 0;
          endSlot = TOTAL_SLOTS;
        } else {
          startSlot = timeToSlot(b.start_time);
          endSlot = timeToSlot(b.end_time);
        }

        if (endSlot <= startSlot) endSlot = startSlot + 1;

        map.get(room.room_id)!.push({
          booking: b,
          room,
          startSlot,
          endSlot,
        });
      }
    }

    return map;
  }, [bookings, filteredRooms, dateStr]);

  // Location tabs with counts
  const tabConfig: { key: LocationTab; label: string }[] = [
    { key: "yoga", label: "用賀" },
    { key: "shibuya", label: "渋谷" },
    { key: "other", label: "その他" },
  ];

  const prevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onDateChange(d);
  };

  const nextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    onDateChange(d);
  };

  const today = () => onDateChange(new Date());

  const handleSlotClick = (roomId: string, slotIndex: number) => {
    if (!onSlotClick) return;
    const hour = SLOT_START + Math.floor(slotIndex / SLOTS_PER_HOUR);
    const min = (slotIndex % SLOTS_PER_HOUR) * 30;
    const endHour = hour + 1;
    const start = `${dateStr}T${formatTime(hour, min)}:00`;
    const end = `${dateStr}T${formatTime(endHour, min)}:00`;
    onSlotClick(roomId, start, end);
  };

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const hour = SLOT_START + Math.floor(i / SLOTS_PER_HOUR);
      const min = (i % SLOTS_PER_HOUR) * 30;
      slots.push({ hour, min, label: min === 0 ? formatTime(hour, 0) : "" });
    }
    return slots;
  }, []);

  return (
    <div className="space-y-3">
      {/* Date navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={today}>
            今日
          </Button>
          <span className="text-lg font-bold ml-2">
            {dateLabel}（{weekDay}）
          </span>
        </div>
      </div>

      {/* Location tabs */}
      <div className="flex gap-1 border-b">
        {tabConfig.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timetable grid */}
      {filteredRooms.length === 0 && activeTab !== "other" ? (
        <p className="text-center text-muted-foreground py-8">このロケーションにはスタジオがありません</p>
      ) : activeTab === "other" && filteredRooms.length === 0 ? (
        /* "Other" tab: show external bookings as list */
        <div className="space-y-2">
          {otherBookings.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">外現場の予約はありません</p>
          ) : (
            otherBookings.map((b) => (
              <div
                key={b.id}
                className="rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onBookingClick(b)}
              >
                <div className="font-medium">{b.title}</div>
                <div className="text-sm text-muted-foreground">
                  {b.location_note || "場所未定"} / {b.start_time.split("T")[1]?.slice(0, 5) || "終日"} - {b.end_time.split("T")[1]?.slice(0, 5) || ""}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <div className="min-w-[600px]">
            {/* Room headers */}
            <div className="flex border-b bg-muted/30 sticky top-0 z-10">
              <div className="w-16 shrink-0 border-r p-2 text-xs font-medium text-muted-foreground">
                時間
              </div>
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex-1 min-w-[120px] border-r last:border-r-0 p-2 text-center"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: room.color }}
                    />
                    <span className="text-sm font-medium truncate">{room.name}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div className="relative flex">
              {/* Time labels */}
              <div className="w-16 shrink-0 border-r">
                {timeSlots.map((slot, i) => (
                  <div
                    key={i}
                    className={cn(
                      "border-b text-right pr-2 text-xs text-muted-foreground flex items-start justify-end",
                      slot.min === 0 ? "border-b-border" : "border-b-border/30"
                    )}
                    style={{ height: SLOT_HEIGHT }}
                  >
                    {slot.label && <span className="-mt-2">{slot.label}</span>}
                  </div>
                ))}
              </div>

              {/* Room columns */}
              {filteredRooms.map((room) => {
                const entries = roomBookings.get(room.id) || [];
                return (
                  <div key={room.id} className="flex-1 min-w-[120px] border-r last:border-r-0 relative">
                    {/* Slot backgrounds */}
                    {timeSlots.map((slot, i) => (
                      <div
                        key={i}
                        className={cn(
                          "border-b cursor-pointer hover:bg-primary/5 transition-colors",
                          slot.min === 0 ? "border-b-border" : "border-b-border/30"
                        )}
                        style={{ height: SLOT_HEIGHT }}
                        onClick={() => handleSlotClick(room.id, i)}
                      />
                    ))}

                    {/* Booking blocks */}
                    {entries.map((entry, idx) => {
                      const top = entry.startSlot * SLOT_HEIGHT;
                      const height = (entry.endSlot - entry.startSlot) * SLOT_HEIGHT;
                      const color = entry.booking.booking_type === "maintenance" || entry.booking.booking_type === "tour"
                        ? bookingTypeColors[entry.booking.booking_type]
                        : entry.room.room_color;

                      return (
                        <div
                          key={`${entry.booking.id}-${idx}`}
                          className="absolute left-1 right-1 rounded px-1.5 py-1 cursor-pointer overflow-hidden transition-opacity hover:opacity-90"
                          style={{
                            top,
                            height: Math.max(height, SLOT_HEIGHT / 2),
                            backgroundColor: color,
                            color: "#fff",
                            zIndex: 5,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onBookingClick(entry.booking);
                          }}
                        >
                          <div className="text-xs font-medium leading-tight truncate">
                            {entry.booking.title}
                          </div>
                          {height >= SLOT_HEIGHT && (
                            <div className="text-[10px] leading-tight opacity-80 truncate">
                              {entry.booking.start_time.split("T")[1]?.slice(0, 5)} - {entry.booking.end_time.split("T")[1]?.slice(0, 5)}
                            </div>
                          )}
                          {height >= SLOT_HEIGHT * 2 && entry.booking.gls_number && (
                            <div className="text-[10px] leading-tight opacity-70 truncate mt-0.5">
                              {entry.booking.gls_number}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
