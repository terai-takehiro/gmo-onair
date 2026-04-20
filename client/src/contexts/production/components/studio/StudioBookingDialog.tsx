import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Calendar, Clock, MapPin, User, CheckSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
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
}

const bookingTypeOptions = [
  { value: "performance", label: "本番" },
  { value: "rehearsal", label: "リハーサル" },
  { value: "hold", label: "仮押さえ" },
  { value: "tour", label: "内覧" },
  { value: "consultation", label: "相談" },
  { value: "maintenance", label: "メンテナンス" },
  { value: "internal", label: "社内利用" },
  { value: "other", label: "その他" },
];

// Types where we default to single-date (本番/リハーサル)
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
  try {
    localStorage.setItem(LOCATION_NOTE_HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export default function StudioBookingDialog({
  open,
  onOpenChange,
  locations,
  editingBooking,
  presetDate,
  presetRoomIds,
}: Props) {
  const qc = useQueryClient();

  // Form state
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

  // External location autocomplete
  const [locationHistory] = useState<string[]>(() => loadLocationHistory());
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const isSingleDateType = SINGLE_DATE_TYPES.has(bookingType);

  // Deduplicate locations by name and filter out "外現場"-type locations (no rooms) from room grid
  const roomLocations = (() => {
    const seen = new Set<string>();
    const deduped: StudioLocation[] = [];
    for (const loc of locations) {
      if (!seen.has(loc.name)) {
        seen.add(loc.name);
        deduped.push(loc);
      }
    }
    // Only show locations that actually have rooms in the room selection grid
    return deduped.filter((loc) => loc.rooms.length > 0);
  })();

  // Projects list
  const { data: projectsData } = useQuery({
    queryKey: ["projects-all"],
    queryFn: async () => (await api.get("/projects?limit=200")).data,
    enabled: open,
  });
  const projects: any[] = projectsData?.data ?? [];

  // Episodes for selected project
  const { data: episodesData } = useQuery({
    queryKey: ["episodes", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`)).data,
    enabled: open && !!projectId,
  });
  const episodes: any[] = episodesData?.data ?? [];

  // Initialize form
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
        setStartDate(sd);
        setEndDate(ed);
        setMultiDay(sd !== ed);
        setStartTime("09:00");
        setEndTime("18:00");
      } else {
        const [sd, st] = b.start_time.split("T");
        const [ed, et] = b.end_time.split("T");
        setStartDate(sd);
        setEndDate(ed);
        setMultiDay(sd !== ed);
        setStartTime(st?.slice(0, 5) || "09:00");
        setEndTime(et?.slice(0, 5) || "18:00");
      }
    } else {
      setTitle("");
      setBookingType("performance");
      setStatus("tentative");
      setProjectId("");
      setEpisodeId("");
      setLocationNote("");
      setNotes("");
      setSelectedRoomIds(presetRoomIds ? new Set(presetRoomIds) : new Set());
      setRoomDetails({});
      setMultiDay(false);

      if (presetDate) {
        setAllDay(presetDate.allDay);
        const startStr = presetDate.start;
        const endStr = presetDate.end;

        if (presetDate.allDay) {
          setStartDate(startStr);
          // FullCalendar's end date is exclusive for allDay
          const endD = new Date(endStr);
          endD.setDate(endD.getDate() - 1);
          const ed = endD.toISOString().split("T")[0];
          setEndDate(ed);
          setMultiDay(startStr !== ed);
          setStartTime("09:00");
          setEndTime("18:00");
        } else {
          const sd = startStr.split("T")[0];
          const ed = endStr.split("T")[0];
          setStartDate(sd);
          setEndDate(ed);
          setMultiDay(sd !== ed);
          setStartTime(startStr.split("T")[1]?.slice(0, 5) || "09:00");
          setEndTime(endStr.split("T")[1]?.slice(0, 5) || "18:00");
        }
      } else {
        setAllDay(true);
        const today = new Date().toISOString().split("T")[0];
        setStartDate(today);
        setEndDate(today);
        setStartTime("09:00");
        setEndTime("18:00");
      }
    }
  }, [open, editingBooking, presetDate, presetRoomIds]);

  // When switching to single-date type without multiDay, sync end = start
  useEffect(() => {
    if (isSingleDateType && !multiDay) {
      setEndDate(startDate);
    }
  }, [isSingleDateType, multiDay, startDate]);

  // hold/consultation は常に未確定
  useEffect(() => {
    if (bookingType === "hold" || bookingType === "consultation") {
      setStatus("tentative");
    }
  }, [bookingType]);

  // Auto-set title based on project (for performance/rehearsal/hold types)
  useEffect(() => {
    if (projectId && !editingBooking) {
      const proj = projects.find((p: any) => p.id === projectId);
      if (proj && (bookingType === "performance" || bookingType === "rehearsal" || bookingType === "hold")) {
        const ep = episodes.find((e: any) => e.id === episodeId);
        const typeLabel = bookingType === "hold" ? " 仮押さえ" : bookingType === "rehearsal" ? " リハーサル" : "";
        setTitle(
          ep
            ? `${proj.gls_number || proj.code} ${ep.episode_code} ${proj.name}${typeLabel}`
            : `${proj.gls_number || proj.code} ${proj.name}${typeLabel}`
        );
      }
    }
  }, [projectId, episodeId, bookingType, projects, episodes, editingBooking]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        locationInputRef.current &&
        !locationInputRef.current.contains(e.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowLocationSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const handleLocationNoteChange = (value: string) => {
    setLocationNote(value);
    if (value.trim()) {
      const filtered = locationHistory.filter((h) =>
        h.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowLocationSuggestions(filtered.length > 0);
    } else {
      setFilteredSuggestions(locationHistory);
      setShowLocationSuggestions(locationHistory.length > 0);
    }
  };

  const handleLocationNoteFocus = () => {
    if (locationNote.trim()) {
      const filtered = locationHistory.filter((h) =>
        h.toLowerCase().includes(locationNote.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowLocationSuggestions(filtered.length > 0);
    } else {
      setFilteredSuggestions(locationHistory);
      setShowLocationSuggestions(locationHistory.length > 0);
    }
  };

  const selectLocationSuggestion = (value: string) => {
    setLocationNote(value);
    setShowLocationSuggestions(false);
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) =>
      editingBooking
        ? api.put(`/studios/bookings/${editingBooking.id}`, payload)
        : api.post("/studios/bookings", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-bookings"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = () => {
    if (!title || !startDate) return;

    const effectiveEndDate = (isSingleDateType && !multiDay) ? startDate : endDate;
    if (!effectiveEndDate) return;

    // Save location note to history
    if (locationNote.trim()) {
      saveLocationHistory(locationNote.trim());
    }

    const room_details_arr = Array.from(selectedRoomIds).map((rid) => ({
      room_id: rid,
      occupant: roomDetails[rid]?.occupant || null,
      usage_note: roomDetails[rid]?.usage_note || null,
    }));

    const payload = {
      title,
      booking_type: bookingType,
      status,
      project_id: projectId || null,
      episode_id: episodeId || null,
      all_day: allDay,
      start_time: allDay ? startDate : `${startDate}T${startTime}`,
      end_time: allDay ? effectiveEndDate : `${effectiveEndDate}T${endTime}`,
      room_details: room_details_arr,
      location_note: locationNote || null,
      notes: notes || null,
    };

    createMutation.mutate(payload);
  };

  const dateLabel = isSingleDateType
    ? (bookingType === "performance" ? "本番日" : "リハーサル日")
    : "日時";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingBooking ? "予約を編集" : "スタジオ予約"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Booking type */}
          <div className="space-y-1">
            <Label>予約種別</Label>
            <div className="flex flex-wrap gap-1.5">
              {bookingTypeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBookingType(opt.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all border ${
                    bookingType === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project link (available for all types) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>案件 (任意)</Label>
              <SearchableSelect
                options={projects.map((p: any) => ({
                  value: p.id,
                  label: `${p.gls_number || p.code} ${p.name}`,
                  subLabel: p.customer_name || "",
                }))}
                value={projectId}
                onChange={(v) => { setProjectId(v); setEpisodeId(""); }}
                placeholder="案件を検索..."
              />
            </div>
            {projectId && episodes.length > 0 && (
              <div className="space-y-1">
                <Label>話数 (任意)</Label>
                <Select value={episodeId} onValueChange={setEpisodeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">なし</SelectItem>
                    {episodes.map((ep: any) => (
                      <SelectItem key={ep.id} value={ep.id}>
                        {ep.episode_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Title */}
          <div className="space-y-1">
            <Label>タイトル *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="予約のタイトル"
            />
          </div>

          {/* Date & Time */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label className="mb-0">{dateLabel}</Label>
            </div>

            {/* All-day toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="allDay"
                checked={allDay}
                onCheckedChange={(c) => setAllDay(!!c)}
              />
              <label htmlFor="allDay" className="text-sm cursor-pointer">
                終日
              </label>
            </div>

            {/* Single-date types: show one date + 複数日 checkbox */}
            {isSingleDateType ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {bookingType === "performance" ? "本番日" : "リハーサル日"}
                  </Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!multiDay) setEndDate(e.target.value);
                      else if (endDate < e.target.value) setEndDate(e.target.value);
                    }}
                  />
                </div>

                {/* 複数日 checkbox */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="multiDay"
                    checked={multiDay}
                    onCheckedChange={(c) => {
                      const checked = !!c;
                      setMultiDay(checked);
                      if (!checked) setEndDate(startDate);
                    }}
                  />
                  <label htmlFor="multiDay" className="text-sm cursor-pointer">
                    複数日
                  </label>
                </div>

                {multiDay && (
                  <div className="space-y-1 pl-6">
                    <Label className="text-xs text-muted-foreground">終了日</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                    />
                  </div>
                )}
              </div>
            ) : (
              /* Other types: show start + end date */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">開始日</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate < e.target.value) setEndDate(e.target.value);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">終了日</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                  />
                </div>
              </div>
            )}

            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">開始時刻</Label>
                  </div>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground">終了時刻</Label>
                  </div>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Room selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>使用スタジオ・部屋 (複数選択可)</Label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    const all = new Set(roomLocations.flatMap((l) => l.rooms.map((r) => r.id)));
                    setSelectedRoomIds(all);
                  }}
                >
                  <CheckSquare className="inline h-3 w-3 mr-0.5" />全部屋
                </button>
                <span className="text-xs text-muted-foreground">|</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={() => setSelectedRoomIds(new Set())}
                >
                  全解除
                </button>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              {/* Room locations (deduplicated, only those with rooms) */}
              {roomLocations.map((loc) => (
                <div key={loc.id}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                    {loc.name}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {loc.rooms.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => toggleRoom(room.id)}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all border text-left ${
                          selectedRoomIds.has(room.id)
                            ? "border-transparent text-white shadow-sm"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                        style={
                          selectedRoomIds.has(room.id)
                            ? { backgroundColor: room.color }
                            : undefined
                        }
                      >
                        <span
                          className="h-3 w-3 rounded-full shrink-0 border border-white/30"
                          style={{ backgroundColor: room.color }}
                        />
                        <span className="truncate">{room.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* External location — free-text with history dropdown */}
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground">
                    外現場
                  </p>
                </div>
                <div className="relative">
                  <Input
                    ref={locationInputRef}
                    value={locationNote}
                    onChange={(e) => handleLocationNoteChange(e.target.value)}
                    onFocus={handleLocationNoteFocus}
                    placeholder="場所を入力（例：富士山麓ロケーション）"
                    className="text-sm"
                    autoComplete="off"
                  />
                  {showLocationSuggestions && filteredSuggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-md overflow-hidden"
                    >
                      {filteredSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors truncate"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectLocationSuggestion(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Greenroom occupant details */}
          {(() => {
            const allRooms = roomLocations.flatMap((l) => l.rooms);
            const greenrooms = allRooms.filter(
              (r) => selectedRoomIds.has(r.id) && r.room_type === "greenroom"
            );
            if (greenrooms.length === 0) return null;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <Label className="mb-0">控室の利用者・用途</Label>
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  {greenrooms.map((room) => {
                    const detail = roomDetails[room.id] || { occupant: "", usage_note: "" };
                    return (
                      <div key={room.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: room.color }}
                          />
                          <span className="text-sm font-medium">{room.name}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-5">
                          <Input
                            value={detail.occupant}
                            onChange={(e) =>
                              setRoomDetails((prev) => ({
                                ...prev,
                                [room.id]: { ...prev[room.id] || { occupant: "", usage_note: "" }, occupant: e.target.value },
                              }))
                            }
                            placeholder="利用者（例：出演者A様）"
                            className="text-sm h-8"
                          />
                          <Input
                            value={detail.usage_note}
                            onChange={(e) =>
                              setRoomDetails((prev) => ({
                                ...prev,
                                [room.id]: { ...prev[room.id] || { occupant: "", usage_note: "" }, usage_note: e.target.value },
                              }))
                            }
                            placeholder="用途（例：楽屋）"
                            className="text-sm h-8"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Notes */}
          <div className="space-y-1">
            <Label>メモ</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="備考"
            />
          </div>

          {/* Status toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">予約状態</p>
              <p className="text-xs text-muted-foreground">
                {status === "confirmed" ? "確定" : "未確定（仮押さえ）"}
                {(bookingType === "hold" || bookingType === "consultation") && " — この種別は常に未確定"}
              </p>
            </div>
            <Switch
              checked={status === "confirmed"}
              onCheckedChange={(v: boolean) => {
                if (bookingType !== "hold" && bookingType !== "consultation") {
                  setStatus(v ? "confirmed" : "tentative");
                }
              }}
              disabled={bookingType === "hold" || bookingType === "consultation"}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title || !startDate || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {editingBooking ? "更新" : "予約する"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
