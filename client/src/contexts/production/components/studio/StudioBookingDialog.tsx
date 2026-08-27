import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { invalidateBookingQueries } from "@/lib/bookingQueries";
import { notifyWarning } from "@gmo-onair/shared/src/client/notify";
import { cn } from "@/lib/utils";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, MapPin, User } from "lucide-react";
import { formatShortDate, localDateStr } from "@/lib/format";

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
          let ed = localDateStr(endD); // `toISOString` は使わない — UTC に寄せて1日ずれる
          // presetDate.end は FullCalendar の exclusive-end 前提 (-1 で最終日)。
          // 呼び出し元が inclusive end (単日なら start と同値) を渡すと ed が start より
          // 前になるため、start にクランプして単日扱いにする (二重の安全策)。
          if (ed < presetDate.start) ed = presetDate.start;
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
        const today = localDateStr(new Date()); // 深夜のJSTで `toISOString` を使うと前日になる
        setStartDate(today); setEndDate(today);
        setStartTime("09:00"); setEndTime("18:00");
      }
      lastAutoTitleRef.current = null; // 前回の自動題名と混同しない
    }
  }, [open, editingBooking, presetDate, presetRoomIds, presetProjectId]);

  useEffect(() => {
    if (isSingleDateType && !multiDay) setEndDate(startDate);
  }, [isSingleDateType, multiDay, startDate]);

  useEffect(() => {
    if (bookingType === "hold" || bookingType === "consultation") setStatus("tentative");
  }, [bookingType]);

  const lastAutoTitleRef = useRef<string | null>(null); // 直前の自動題名。日付等を変えるたび上書くと手直しが消える
  useEffect(() => {
    if (projectId && !editingBooking) {
      const proj = projectOptions.find((p: any) => p.id === projectId);
      if (proj && (bookingType === "performance" || bookingType === "rehearsal" || bookingType === "hold")) {
        // タイトルは「案件名 (YY/MM/DD)」に統一。種別は色で区分するため表記不要
        const datePart = formatShortDate(startDate);
        const auto = `${proj.name}${datePart ? ` (${datePart})` : ""}`;
        setTitle((prev) => (prev === "" || prev === lastAutoTitleRef.current ? auto : prev)); lastAutoTitleRef.current = auto;
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

  // 保存に失敗した理由。ダイアログの中に出す (何も出ないと「押せていない」と思って
  // もう一度押され、同じ予定が二重に入る)
  const [saveError, setSaveError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (payload: any) =>
      editingBooking
        ? api.put(`/studios/bookings/${editingBooking.id}`, payload)
        : api.post("/studios/bookings", payload),
    onSuccess: (res) => {
      // 予約を読む問い合わせは2つあり、カレンダー側しか落としていなかったため
      // **案件詳細から登録しても予約一覧が増えず**、「登録できなかった」ように見えて
      // もう一度入れられていた。**案件の実施日**も込みで `lib/bookingQueries.ts` が落とす
      invalidateBookingQueries(qc);
      // 時間外の印(`hours_check`)は保存の返り値にだけ乗る（サーバーは止めない方針）。画面が気づかせる唯一の場所
      const hoursCheck = res?.data?.data?.hours_check;
      if (hoursCheck?.outside) notifyWarning("営業時間外の予約です", { description: hoursCheck.reason || undefined });
      // 重複疑い(`duplicate_check`)も同じ方針 — 保存は止めず、ここで気づかせるだけ。
      // 見逃した分は「重複疑い」一覧（/calendar/duplicates）から後でも拾える
      const duplicateCheck = res?.data?.data?.duplicate_check;
      if (duplicateCheck) notifyWarning("重複の疑いがある予約です", { description: duplicateCheck.reason || undefined });
      setSaveError(null);
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setSaveError(msg || "予約を保存できませんでした。時間をおいてもう一度お試しください");
    },
  });

  const handleSubmit = () => {
    setSaveError(null);
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingBooking ? "予約を編集" : "スタジオ予約"}
      // **2カラムの複合フォームなので `wide` を渡す。** 既定の640pxのままだと、
      // 元は lg:grid-cols-2 で2列に並べていた項目（タイトル・日時・部屋・控室…）が
      // 1列に潰れて縦に長くなりすぎる（load-testing不要な単純な折返しではなく、
      // 部屋の grid-cols-4 チップ等、横幅を前提にした部品が複数ある）
      wide
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!title || !startDate || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editingBooking ? "更新" : "予約する"}
          </Button>
        </FormDialogFooter>
      }
    >
          {/* 保存できなかった理由 — 何も出ないと「押せていない」と思われ、同じ予定が
              二重に入る。フォームの先頭（フッターの目の前）に置く */}
          {saveError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive"
            >
              {saveError}
            </div>
          )}

            {/* 840px の `wide`（=`lg`）シート前提の2カラム。`lg:col-span-2` の項目
                （タイトル・スタジオ/部屋・控室利用者・メモ等）はこの親が
                なければ何もしない no-op になる（実際にそうなっていたのを復元した） */}
            <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5 lg:space-y-0">

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
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    </FormDialog>
  );
}
