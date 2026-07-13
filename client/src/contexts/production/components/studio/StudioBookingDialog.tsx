import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DP from "@radix-ui/react-dialog";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, MapPin, User } from "lucide-react";
import { formatShortDate } from "@/lib/format";

interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
  abbreviation?: string | null;
  room_type?: string;
  color: string;
}

interface StudioLocation {
  id: string;
  name: string;
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
  status?: string;
  rooms: BookingRoom[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StudioLocation[];
  editingBooking: StudioBooking | null;
  presetDate: { start: string; end: string; allDay: boolean } | null;
  presetRoomIds?: string[];
  presetProjectId?: string;
}

const bookingTypeOptions = [
  { value: "performance", label: "本番" },
  { value: "rehearsal", label: "リハーサル" },
  { value: "hold", label: "仮押さえ" },
  { value: "tour", label: "内覧" },
  { value: "consultation", label: "相談" },
  { value: "setup", label: "設営/準備" },
  { value: "maintenance", label: "メンテナンス" },
  { value: "internal", label: "社内利用" },
  { value: "other", label: "その他" },
];

const SINGLE_DATE_TYPES = new Set(["performance", "rehearsal"]);
const LOCATION_NOTE_HISTORY_KEY = "studio_location_note_history";

function loadLocationHistory(): string[] {
  try {
    const raw = localStorage.getItem(LOCATION_NOTE_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveLocationHistory(value: string) {
  if (!value.trim()) return;
  const prev = loadLocationHistory();
  const updated = [value, ...prev.filter((h) => h !== value)].slice(0, 15);
  try { localStorage.setItem(LOCATION_NOTE_HISTORY_KEY, JSON.stringify(updated)); } catch {}
}

export default function StudioBookingDialog({
  open,
  onOpenChange,
  locations,
  editingBooking,
  presetDate,
  presetRoomIds,
  presetProjectId,
}: Props) {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [bookingType, setBookingType] = useState("performance");
  const [status, setStatus] = useState<"confirmed" | "tentative">("tentative");
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [multiDay, setMultiDay] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [roomDetails, setRoomDetails] = useState<Record<string, { occupant: string; usage_note: string }>>({});
  const [locationNote, setLocationNote] = useState("");
  const [notes, setNotes] = useState("");

  const [locationHistory] = useState<string[]>(() => loadLocationHistory());
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const isSingleDateType = SINGLE_DATE_TYPES.has(bookingType);

  const roomLocations = (() => {
    const seen = new Set<string>();
    const deduped: StudioLocation[] = [];
    for (const loc of locations) {
      if (!seen.has(loc.name)) { seen.add(loc.name); deduped.push(loc); }
    }
    return deduped.filter((loc) => loc.rooms.length > 0);
  })();

  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const { data: projectsData } = useQuery({
    queryKey: ["projects-booking-search", projectSearchQuery],
    queryFn: async () =>
      (await api.get("/projects", { params: { search: projectSearchQuery, limit: 100 } })).data,
    enabled: open,
    placeholderData: (prev) => prev, // デバウンス中に以前の結果を保持しフリッカー防止
  });
  const projects: any[] = projectsData?.data ?? [];

  // 選択中の案件が一覧に無い場合は単体で取得して候補に追加
  const { data: selectedProjectSingle } = useQuery({
    queryKey: ["project-single", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data.data,
    enabled: open && !!projectId && !projects.some((p) => p.id === projectId),
  });

  const projectOptions: any[] = (() => {
    const all = [...projects];
    if (selectedProjectSingle && !all.some((p) => p.id === selectedProjectSingle.id)) {
      all.unshift(selectedProjectSingle);
    }
    return all;
  })();

  const { data: episodesData } = useQuery({
    queryKey: ["episodes", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`)).data,
    enabled: open && !!projectId,
  });
  const episodes: any[] = episodesData?.data ?? [];

  useEffect(() => {
    if (!open) return;
    if (editingBooking) {
      const b = editingBooking;
      setTitle(b.title);
      setBookingType(b.booking_type);
      setStatus((b.status as "confirmed" | "tentative") || "tentative");
      setProjectId(b.project_id || "");
      setEpisodeId(b.episode_id || "");
      setAllDay(!!b.all_day);
      setLocationNote(b.location_note || "");
      setNotes(b.notes || "");
      setSelectedRoomIds(new Set(b.rooms.map((r) => r.room_id)));
      const details: Record<string, { occupant: string; usage_note: string }> = {};
      for (const r of b.rooms) {
        if (r.occupant || r.usage_note) {
          details[r.room_id] = { occupant: r.occupant || "", usage_note: r.usage_note || "" };
        }
      }
      setRoomDetails(details);
      if (b.all_day) {
        const sd = b.start_time.split("T")[0];
        const ed = b.end_time.split("T")[0];
        setStartDate(sd); setEndDate(ed); setMultiDay(sd !== ed);
        setStartTime("09:00"); setEndTime("18:00");
      } else {
        const [sd, st] = b.start_time.split("T");
        const [ed, et] = b.end_time.split("T");
        setStartDate(sd); setEndDate(ed); setMultiDay(sd !== ed);
        setStartTime(st?.slice(0, 5) || "09:00");
        setEndTime(et?.slice(0, 5) || "18:00");
      }
    } else {
      setTitle(""); setBookingType("performance"); setStatus("tentative");
      setProjectId(presetProjectId || ""); setEpisodeId("");
      setLocationNote(""); setNotes("");
      setSelectedRoomIds(presetRoomIds ? new Set(presetRoomIds) : new Set());
      setRoomDetails({}); setMultiDay(false);
      if (presetDate) {
        setAllDay(presetDate.allDay);
        if (presetDate.allDay) {
          setStartDate(presetDate.start);
          const endD = new Date(presetDate.end);
          endD.setDate(endD.getDate() - 1);
          const ed = endD.toISOString().split("T")[0];
          setEndDate(ed); setMultiDay(presetDate.start !== ed);
          setStartTime("09:00"); setEndTime("18:00");
        } else {
          const sd = presetDate.start.split("T")[0];
          const ed = presetDate.end.split("T")[0];
          setStartDate(sd); setEndDate(ed); setMultiDay(sd !== ed);
          setStartTime(presetDate.start.split("T")[1]?.slice(0, 5) || "09:00");
          setEndTime(presetDate.end.split("T")[1]?.slice(0, 5) || "18:00");
        }
      } else {
        setAllDay(true);
        const today = new Date().toISOString().split("T")[0];
        setStartDate(today); setEndDate(today);
        setStartTime("09:00"); setEndTime("18:00");
      }
    }
  }, [open, editingBooking, presetDate, presetRoomIds, presetProjectId]);

  useEffect(() => {
    if (isSingleDateType && !multiDay) setEndDate(startDate);
  }, [isSingleDateType, multiDay, startDate]);

  useEffect(() => {
    if (bookingType === "hold" || bookingType === "consultation") setStatus("tentative");
  }, [bookingType]);

  useEffect(() => {
    if (projectId && !editingBooking) {
      const proj = projectOptions.find((p: any) => p.id === projectId);
      if (proj && (bookingType === "performance" || bookingType === "rehearsal" || bookingType === "hold")) {
        // タイトルは「案件名 (YY/MM/DD)」に統一。種別は色で区分するため表記不要
        const datePart = formatShortDate(startDate);
        const suffix = datePart ? ` (${datePart})` : "";
        setTitle(`${proj.name}${suffix}`);
      }
    }
  }, [projectId, bookingType, startDate, projects, episodes, editingBooking]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        locationInputRef.current && !locationInputRef.current.contains(e.target as Node) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)
      ) setShowLocationSuggestions(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      return next;
    });
  };

  const handleLocationNoteChange = (value: string) => {
    setLocationNote(value);
    const filtered = value.trim()
      ? locationHistory.filter((h) => h.toLowerCase().includes(value.toLowerCase()))
      : locationHistory;
    setFilteredSuggestions(filtered);
    setShowLocationSuggestions(filtered.length > 0);
  };

  const handleLocationNoteFocus = () => {
    const filtered = locationNote.trim()
      ? locationHistory.filter((h) => h.toLowerCase().includes(locationNote.toLowerCase()))
      : locationHistory;
    setFilteredSuggestions(filtered);
    setShowLocationSuggestions(filtered.length > 0);
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) =>
      editingBooking
        ? api.put(`/studios/bookings/${editingBooking.id}`, payload)
        : api.post("/studios/bookings", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["studio-bookings"] }); onOpenChange(false); },
  });

  const handleSubmit = () => {
    if (!title || !startDate) return;
    const effectiveEndDate = (isSingleDateType && !multiDay) ? startDate : endDate;
    if (!effectiveEndDate) return;
    if (locationNote.trim()) saveLocationHistory(locationNote.trim());
    createMutation.mutate({
      title, booking_type: bookingType, status,
      project_id: projectId || null, episode_id: episodeId || null,
      all_day: allDay,
      start_time: allDay ? startDate : `${startDate}T${startTime}`,
      end_time: allDay ? effectiveEndDate : `${effectiveEndDate}T${endTime}`,
      room_details: Array.from(selectedRoomIds).map((rid) => ({
        room_id: rid,
        occupant: roomDetails[rid]?.occupant || null,
        usage_note: roomDetails[rid]?.usage_note || null,
      })),
      location_note: locationNote || null,
      notes: notes || null,
    });
  };

  const inputCls = "text-[15px] text-primary bg-transparent border-none outline-none cursor-pointer";

  return (
    <DP.Root open={open} onOpenChange={onOpenChange}>
      <DP.Portal>
        <DP.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DP.Content
          className={cn(
            // Mobile: bottom sheet
            "fixed inset-x-0 bottom-0 z-50 bg-background outline-none",
            "rounded-t-[20px] border-t border-x",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
            "duration-300 ease-out",
            // Desktop (sm): centered dialog
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
            "sm:w-[min(calc(100vw-2rem),32rem)]",
            "sm:rounded-xl sm:border sm:shadow-xl",
            "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
            "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
            // Large desktop (lg): 2-column wider dialog
            "lg:w-[min(calc(100vw-4rem),56rem)]",
            "xl:w-[min(calc(100vw-8rem),64rem)]",
          )}
        >
          <DP.Description className="sr-only">スタジオ予約フォーム</DP.Description>

          {/* Drag handle — mobile only */}
          <div className="sm:hidden flex justify-center pt-2.5 pb-1">
            <div className="h-1 w-10 rounded-full bg-foreground/20" />
          </div>

          {/* iOS-style header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <DP.Close asChild>
              <button className="min-w-[72px] text-[15px] text-primary">キャンセル</button>
            </DP.Close>
            <DP.Title className="text-[15px] font-semibold">
              {editingBooking ? "予約を編集" : "スタジオ予約"}
            </DP.Title>
            <button
              onClick={handleSubmit}
              disabled={!title || !startDate || createMutation.isPending}
              className="min-w-[72px] text-right text-[15px] font-semibold text-primary disabled:opacity-40 flex items-center justify-end gap-1"
            >
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingBooking ? "更新" : "予約する"}
            </button>
          </div>

          {/* Scrollable body */}
          <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: "calc(92dvh - 56px)" }}>
            <div className="px-4 py-4 space-y-5 lg:px-6 lg:py-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>

              {/* ① タイトル */}
              <div className="rounded-xl border bg-muted/30">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="タイトル"
                  className="w-full px-4 py-3.5 bg-transparent outline-none placeholder:text-muted-foreground/40"
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* ② 予約種別 */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">予約種別</p>
                <div className="flex flex-wrap gap-2 pb-0.5 -mx-1 px-1">
                  {bookingTypeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBookingType(opt.value)}
                      className={cn(
                        "rounded-full px-4 py-2 text-[13px] font-medium border transition-all whitespace-nowrap",
                        bookingType === opt.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-background"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ③ 案件 */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">案件</p>
                <div className="rounded-xl border bg-muted/30 divide-y">
                  <div className="px-3 py-1.5">
                    <SearchableSelect
                      options={projectOptions.map((p: any) => ({
                        value: p.id,
                        label: `${p.gls_number || p.code || ""} ${p.name}`.trim(),
                        subLabel: p.customer_name || "",
                      }))}
                      value={projectId}
                      onChange={(v) => { setProjectId(v); setEpisodeId(""); }}
                      onSearchChange={setProjectSearchQuery}
                      placeholder="GLS番号・案件名・顧客名で検索..."
                    />
                  </div>
                  {projectId && episodes.length > 0 && (
                    <div className="px-3">
                      <Select
                        value={episodeId || "_none_"}
                        onValueChange={(v) => setEpisodeId(v === "_none_" ? "" : v)}
                      >
                        <SelectTrigger className="border-0 bg-transparent px-1 h-10 shadow-none focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none_">なし</SelectItem>
                          {episodes.map((ep: any) => (
                            <SelectItem key={ep.id} value={ep.id}>{ep.episode_code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              {/* ④ 日時 */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">日時</p>
                <div className="rounded-xl border bg-muted/30 divide-y overflow-hidden">
                  {/* 終日 toggle */}
                  <div className="flex items-center justify-between px-4 py-3.5">
                    <span className="text-[15px]">終日</span>
                    <Switch checked={allDay} onCheckedChange={setAllDay} />
                  </div>

                  {/* 開始 */}
                  <div className="flex items-center px-4 py-3.5 gap-2">
                    <span className="text-[15px] w-8 shrink-0">開始</span>
                    <div className="flex flex-1 justify-end items-center gap-3">
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          if (isSingleDateType && !multiDay) setEndDate(e.target.value);
                          else if (endDate < e.target.value) setEndDate(e.target.value);
                        }}
                        className={inputCls}
                        style={{ fontSize: "16px", colorScheme: "light" }}
                      />
                      {!allDay && (
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className={inputCls}
                          style={{ fontSize: "16px" }}
                        />
                      )}
                    </div>
                  </div>

                  {/* 終了
                      単日タイプ (本番/リハ) でも時刻指定 (!allDay) なら「同日の終了時刻」を
                      入力できるよう終了行を表示する。終了「日」は複数日/非単日タイプのみ、
                      終了「時刻」は時刻指定時は常に表示 (= 8:00〜20:00 のような同日枠に対応)。 */}
                  {(!isSingleDateType || multiDay || !allDay) && (
                    <div className="flex items-center px-4 py-3.5 gap-2">
                      <span className="text-[15px] w-8 shrink-0">終了</span>
                      <div className="flex flex-1 justify-end items-center gap-3">
                        {(!isSingleDateType || multiDay) && (
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            min={startDate}
                            className={inputCls}
                            style={{ fontSize: "16px", colorScheme: "light" }}
                          />
                        )}
                        {!allDay && (
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className={inputCls}
                            style={{ fontSize: "16px" }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 複数日 toggle (本番/リハーサルのみ) */}
                  {isSingleDateType && (
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-[15px]">複数日</span>
                      <Switch
                        checked={multiDay}
                        onCheckedChange={(c) => { setMultiDay(c); if (!c) setEndDate(startDate); }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* ⑤ スタジオ・部屋 */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">スタジオ・部屋</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="text-[12px] text-primary"
                      onClick={() => setSelectedRoomIds(new Set(roomLocations.flatMap((l) => l.rooms.map((r) => r.id))))}
                    >
                      全選択
                    </button>
                    <button
                      type="button"
                      className="text-[12px] text-muted-foreground"
                      onClick={() => setSelectedRoomIds(new Set())}
                    >
                      全解除
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
                  {roomLocations.map((loc) => {
                    const locRoomIds = loc.rooms.map((r) => r.id);
                    const allInLocationSelected =
                      locRoomIds.length > 0 && locRoomIds.every((id) => selectedRoomIds.has(id));
                    const toggleAllInLocation = () => {
                      setSelectedRoomIds((prev) => {
                        const next = new Set(prev);
                        if (allInLocationSelected) {
                          locRoomIds.forEach((id) => next.delete(id));
                        } else {
                          locRoomIds.forEach((id) => next.add(id));
                        }
                        return next;
                      });
                    };
                    return (
                      <div key={loc.id}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[11px] font-medium text-muted-foreground">{loc.name}</p>
                          {locRoomIds.length > 0 && (
                            <button
                              type="button"
                              onClick={toggleAllInLocation}
                              className="text-[11px] text-primary hover:underline"
                            >
                              {allInLocationSelected ? "全解除" : "全選択"}
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                          {loc.rooms.map((room) => (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => toggleRoom(room.id)}
                              className={cn(
                                "flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all text-left",
                                selectedRoomIds.has(room.id)
                                  ? "text-white shadow-sm"
                                  : "bg-background/80 border border-border"
                              )}
                              style={selectedRoomIds.has(room.id) ? { backgroundColor: room.color } : undefined}
                            >
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: room.color }} />
                              <span className="whitespace-normal break-words leading-snug">{room.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* 外現場 */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      <p className="text-[11px] font-medium text-muted-foreground">外現場</p>
                    </div>
                    <div className="relative">
                      <input
                        ref={locationInputRef}
                        type="text"
                        value={locationNote}
                        onChange={(e) => handleLocationNoteChange(e.target.value)}
                        onFocus={handleLocationNoteFocus}
                        placeholder="場所を入力（例：富士山麓ロケーション）"
                        autoComplete="off"
                        className="w-full px-3 py-2.5 rounded-lg border bg-background/80 outline-none placeholder:text-muted-foreground/40"
                        style={{ fontSize: "16px" }}
                      />
                      {showLocationSuggestions && filteredSuggestions.length > 0 && (
                        <div
                          ref={suggestionsRef}
                          className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border bg-popover shadow-lg overflow-hidden"
                        >
                          {filteredSuggestions.map((s, i) => (
                            <button
                              key={i}
                              type="button"
                              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setLocationNote(s); setShowLocationSuggestions(false); }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ⑥ 控室利用者 */}
              {(() => {
                const allRooms = roomLocations.flatMap((l) => l.rooms);
                const greenrooms = allRooms.filter((r) => selectedRoomIds.has(r.id) && r.room_type === "greenroom");
                if (greenrooms.length === 0) return null;
                return (
                  <div className="lg:col-span-2">
                    <div className="flex items-center gap-1.5 mb-2 px-1">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">控室の利用者・用途</p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 divide-y overflow-hidden">
                      {greenrooms.map((room) => {
                        const detail = roomDetails[room.id] || { occupant: "", usage_note: "" };
                        return (
                          <div key={room.id} className="px-4 py-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: room.color }} />
                              <span className="text-[14px] font-medium">{room.name}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                value={detail.occupant}
                                onChange={(e) => setRoomDetails((prev) => ({
                                  ...prev,
                                  [room.id]: { ...prev[room.id] || { occupant: "", usage_note: "" }, occupant: e.target.value },
                                }))}
                                placeholder="利用者"
                                className="text-[14px] px-3 py-2 rounded-lg border bg-background/80 outline-none placeholder:text-muted-foreground/40"
                                style={{ fontSize: "16px" }}
                              />
                              <input
                                type="text"
                                value={detail.usage_note}
                                onChange={(e) => setRoomDetails((prev) => ({
                                  ...prev,
                                  [room.id]: { ...prev[room.id] || { occupant: "", usage_note: "" }, usage_note: e.target.value },
                                }))}
                                placeholder="用途"
                                className="text-[14px] px-3 py-2 rounded-lg border bg-background/80 outline-none placeholder:text-muted-foreground/40"
                                style={{ fontSize: "16px" }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ⑦ メモ */}
              <div className="lg:col-span-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">メモ</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="備考を入力"
                  rows={3}
                  className="w-full rounded-xl border bg-muted/30 px-4 py-3 resize-none outline-none placeholder:text-muted-foreground/40"
                  style={{ fontSize: "16px" }}
                />
              </div>

              {/* ⑧ 予約状態 */}
              <div className="rounded-xl border bg-muted/30 lg:col-span-2">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="text-[15px] font-medium">確定済み</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {status === "confirmed" ? "予約確定" : "仮押さえ・未確定"}
                      {(bookingType === "hold" || bookingType === "consultation") && " — この種別は常に未確定"}
                    </p>
                  </div>
                  <Switch
                    checked={status === "confirmed"}
                    onCheckedChange={(v) => {
                      if (bookingType !== "hold" && bookingType !== "consultation") {
                        setStatus(v ? "confirmed" : "tentative");
                      }
                    }}
                    disabled={bookingType === "hold" || bookingType === "consultation"}
                  />
                </div>
              </div>

            </div>
          </div>
        </DP.Content>
      </DP.Portal>
    </DP.Root>
  );
}
