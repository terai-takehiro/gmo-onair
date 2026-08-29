import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  SLOT_HEIGHT, SLOTS_PER_HOUR, SLOT_START, TOTAL_SLOTS,
  formatTime, toLocalDateStr, extractDatePart, minutesOnDate, minutesToSlot, assignColumns,
  getLocationTab, bookingTypeColors, type LocationTab,
} from "./koubanLayout";

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
  room_abbreviation?: string | null;
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
  const gridRef = useRef<HTMLDivElement>(null);
  /** 8:00 まで送るのは**開いた1回だけ**（日を送るたびに戻すと、深夜を見ている人の位置が飛ぶ） */
  const scrolledRef = useRef(false);

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

  // Map bookings to room slots (重なりは列分けして全部押せるようにする)
  const roomBookings = useMemo(() => {
    const raw = new Map<string, { booking: StudioBooking; room: BookingRoom; startSlot: number; endSlot: number }[]>();

    for (const room of filteredRooms) {
      raw.set(room.id, []);
    }

    for (const b of bookings) {
      const bStartDate = extractDatePart(b.start_time);
      const bEndDate = extractDatePart(b.end_time);
      // Check if booking overlaps with current date
      if (bStartDate > dateStr || bEndDate < dateStr) continue;

      for (const room of b.rooms) {
        if (!raw.has(room.room_id)) continue;

        let startSlot: number;
        let endSlot: number;

        if (b.all_day) {
          startSlot = 0;
          endSlot = TOTAL_SLOTS;
        } else {
          // **表示日から見た分**で置く（時刻だけ見ると日またぎ予約が誤った位置に描かれる）
          const startMin = minutesOnDate(b.start_time, dateStr, 0);
          const endMin = minutesOnDate(b.end_time, dateStr, TOTAL_SLOTS * 30);
          startSlot = minutesToSlot(startMin, false);
          endSlot = minutesToSlot(endMin, true);
        }

        if (endSlot <= startSlot) endSlot = startSlot + 1;

        raw.get(room.room_id)!.push({
          booking: b,
          room,
          startSlot,
          endSlot,
        });
      }
    }

    const map = new Map<string, ReturnType<typeof assignColumns<{ booking: StudioBooking; room: BookingRoom; startSlot: number; endSlot: number }>>>();
    for (const [roomId, items] of raw) map.set(roomId, assignColumns(items));
    return map;
  }, [bookings, filteredRooms, dateStr]);

  // Location tabs with counts
  // 正式名称は「GMOサムライスタジオ用賀/渋谷/青山」— タブは地名で省略表記
  const tabConfig: { key: LocationTab; label: string }[] = [
    { key: "yoga", label: "用賀" },
    { key: "shibuya", label: "渋谷" },
    { key: "aoyama", label: "青山" },
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
    const start = `${dateStr}T${formatTime(hour, min)}:00`;
    const endMin = Math.min(24 * 60 - 1, (hour + 1) * 60 + min); // 23時台のマスで「24:00」台（time 入力に無い不正値）にしない
    const end = `${dateStr}T${formatTime(Math.floor(endMin / 60), endMin % 60)}:00`;
    onSlotClick(roomId, start, end);
  };

  /**
   * **開いた瞬間に 8:00 が見えるようにする。**
   *
   * 00:00 起点のまま出すと、画面に映るのは深夜の空マスだけで
   * 「この日は予定が無い」と読めてしまう（10 時の予約は 2 画面下）。
   * 表そのものを縦にスクロールさせる箱にして、8:00 の位置まで送る。
   */
  useEffect(() => {
    const el = gridRef.current;
    if (!el || scrolledRef.current || filteredRooms.length === 0) return;
    // 8px 手前で止める。**時刻ラベルは罫線に合わせて 8px 上へ出ている**ので、
    // ぴったり合わせると 8:00 の字が sticky の部屋ヘッダーに隠れる
    el.scrollTop = (8 - SLOT_START) * SLOTS_PER_HOUR * SLOT_HEIGHT - 10;
    scrolledRef.current = true;
  }, [filteredRooms.length]);

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
      ) : (
        <div className="space-y-3">
          {/* その他タブは実部屋があっても外現場予約を必ず出す（以前は実部屋があると
              下の部屋グリッドに押し出されて外現場予約がどこにも出なくなっていた） */}
          {activeTab === "other" && (otherBookings.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">外現場の予約はありません</p>
          ) : (
            <div className="space-y-2">
              {otherBookings.map((b) => (
                <div key={b.id} className="rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onBookingClick(b)}>
                  <div className="font-medium">{b.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {b.location_note || "場所未定"} / {b.start_time.split("T")[1]?.slice(0, 5) || "終日"} - {b.end_time.split("T")[1]?.slice(0, 5) || ""}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* **縦にもスクロールする箱にする。** 24時間ぶん (2,300px 超) をページに
              そのまま流すと、開いた瞬間は深夜の空マスしか見えない。中で送るので
              部屋ヘッダーの sticky もこの箱の上端に留まる */}
          {filteredRooms.length > 0 && (
        <div ref={gridRef} className="overflow-auto border rounded-lg max-h-[70vh]">
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
                    {/* ラベルは罫線に合わせて上へ引き上げるが、**先頭 (00:00) だけは
                        引き上げない** — 上に罫線が無く、sticky の部屋ヘッダーへ
                        潜り込んで上半分が隠れる (実測 8px 重なり) */}
                    {slot.label && <span className={cn(i > 0 && "-mt-2")}>{slot.label}</span>}
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

                    {/* Booking blocks. **列分け（col/cols）で重なりを横に割る** —
                        以前は全件 left-1/right-1 の全幅固定で、同室同時間帯の2件目が
                        完全に隠れて押せなかった */}
                    {entries.map((entry, idx) => {
                      const top = entry.startSlot * SLOT_HEIGHT;
                      const height = (entry.endSlot - entry.startSlot) * SLOT_HEIGHT;
                      const color = entry.booking.booking_type === "maintenance" || entry.booking.booking_type === "tour"
                        ? bookingTypeColors[entry.booking.booking_type]
                        : entry.room.room_color;

                      return (
                        <div
                          key={`${entry.booking.id}-${idx}`}
                          className="absolute overflow-hidden"
                          style={{
                            top,
                            height: Math.max(height, SLOT_HEIGHT / 2),
                            left: `${(entry.col / entry.cols) * 100}%`,
                            width: `${100 / entry.cols}%`,
                            zIndex: 5,
                          }}
                        >
                          <div
                            className="mx-0.5 h-full rounded px-1.5 py-1 cursor-pointer overflow-hidden transition-opacity hover:opacity-90"
                            style={{ backgroundColor: color, color: "#fff" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onBookingClick(entry.booking);
                            }}
                          >
                            <div className="text-xs font-medium leading-tight truncate">
                              {entry.booking.title}
                            </div>
                            {height >= SLOT_HEIGHT && (
                              <div className="text-xs leading-tight opacity-80 truncate">
                                {/* **この日から見た時刻**を出す（`entry.startSlot`/`endSlot` は
                                    日またぎ考慮済み）。生の start_time/end_time をそのまま
                                    出すと、翌日側で「23:00 - 02:00」のような誤った時刻になる */}
                                {formatTime(Math.floor((entry.startSlot * 30) / 60), (entry.startSlot * 30) % 60)}
                                {" - "}
                                {formatTime(Math.floor((entry.endSlot * 30) / 60), (entry.endSlot * 30) % 60)}
                              </div>
                            )}
                            {height >= SLOT_HEIGHT * 2 && entry.booking.gls_number && (
                              <div className="text-xs leading-tight opacity-70 truncate mt-0.5">
                                {entry.booking.gls_number}
                              </div>
                            )}
                          </div>
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
      )}
    </div>
  );
}
