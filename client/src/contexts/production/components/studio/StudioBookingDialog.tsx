import { useState, useEffect } from "react";
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
import { Loader2, Calendar, Clock, MapPin, User } from "lucide-react";

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
  { value: "project", label: "案件利用" },
  { value: "maintenance", label: "メンテナンス" },
  { value: "tour", label: "内覧" },
  { value: "internal", label: "社内利用" },
  { value: "other", label: "その他" },
];

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
  const [bookingType, setBookingType] = useState("project");
  const [projectId, setProjectId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [roomDetails, setRoomDetails] = useState<Record<string, { occupant: string; usage_note: string }>>({});
  const [locationNote, setLocationNote] = useState("");
  const [notes, setNotes] = useState("");

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
        setStartDate(b.start_time.split("T")[0]);
        setEndDate(b.end_time.split("T")[0]);
        setStartTime("09:00");
        setEndTime("18:00");
      } else {
        const [sd, st] = b.start_time.split("T");
        const [ed, et] = b.end_time.split("T");
        setStartDate(sd);
        setEndDate(ed);
        setStartTime(st?.slice(0, 5) || "09:00");
        setEndTime(et?.slice(0, 5) || "18:00");
      }
    } else {
      setTitle("");
      setBookingType("project");
      setProjectId("");
      setEpisodeId("");
      setLocationNote("");
      setNotes("");
      setSelectedRoomIds(presetRoomIds ? new Set(presetRoomIds) : new Set());
      setRoomDetails({});

      if (presetDate) {
        setAllDay(presetDate.allDay);
        const startStr = presetDate.start;
        const endStr = presetDate.end;

        if (presetDate.allDay) {
          setStartDate(startStr);
          // FullCalendar's end date is exclusive for allDay
          const endD = new Date(endStr);
          endD.setDate(endD.getDate() - 1);
          setEndDate(endD.toISOString().split("T")[0]);
          setStartTime("09:00");
          setEndTime("18:00");
        } else {
          setStartDate(startStr.split("T")[0]);
          setEndDate(endStr.split("T")[0]);
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

  // Auto-set title based on project
  useEffect(() => {
    if (bookingType === "project" && projectId && !editingBooking) {
      const proj = projects.find((p: any) => p.id === projectId);
      if (proj) {
        const ep = episodes.find((e: any) => e.id === episodeId);
        setTitle(
          ep
            ? `${proj.gls_number} ${ep.episode_code} ${proj.name}`
            : `${proj.gls_number} ${proj.name}`
        );
      }
    }
  }, [projectId, episodeId, bookingType, projects, episodes, editingBooking]);

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
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
    if (!title || !startDate || !endDate) return;

    const room_details_arr = Array.from(selectedRoomIds).map((rid) => ({
      room_id: rid,
      occupant: roomDetails[rid]?.occupant || null,
      usage_note: roomDetails[rid]?.usage_note || null,
    }));

    const payload = {
      title,
      booking_type: bookingType,
      project_id: projectId || null,
      episode_id: episodeId || null,
      all_day: allDay,
      start_time: allDay ? startDate : `${startDate}T${startTime}`,
      end_time: allDay ? endDate : `${endDate}T${endTime}`,
      room_details: room_details_arr,
      location_note: locationNote || null,
      notes: notes || null,
    };

    createMutation.mutate(payload);
  };

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

          {/* Project link (only for project type) */}
          {bookingType === "project" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>案件</Label>
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
          )}

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
              <Label className="mb-0">日時</Label>
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
            <Label>使用スタジオ・部屋 (複数選択可)</Label>
            <div className="space-y-3 rounded-lg border p-3">
              {locations.map((loc) => (
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

              {/* External location */}
              <div>
                <div className="flex items-center gap-1 mb-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground">
                    外現場（部屋未選択の場合）
                  </p>
                </div>
                <Input
                  value={locationNote}
                  onChange={(e) => setLocationNote(e.target.value)}
                  placeholder="場所を入力（例：富士山麓ロケーション）"
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* Greenroom occupant details */}
          {(() => {
            const allRooms = locations.flatMap((l) => l.rooms);
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

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!title || !startDate || !endDate || createMutation.isPending}
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
