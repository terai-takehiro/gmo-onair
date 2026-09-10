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
import { Loader2 } from "lucide-react";
import { BookingRoomPicker } from "./bookingRoomPicker";
import { BookingDateTimeSection } from "./BookingDateTimeSection";
import { GreenroomOccupants } from "./GreenroomOccupants";
import { AssigneePicker, type AssigneeRef } from "../AssigneePicker";
import { formatShortDate, localDateStr } from "@/lib/format";
import { BOOKING_TYPE_OPTIONS } from "../schedule/scheduleShared";

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
  hold_rank?: number | null;
  rooms: BookingRoom[];
  assignees?: AssigneeRef[];
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
  // 仮押さえの何番手か。空欄可（決めていない＝NULL）。tentative のときだけ意味を持つ
  const [holdRank, setHoldRank] = useState("");
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
  // 担当者（複数・任意）。登録ユーザーから選ぶので user_id の配列で持つ
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  const [locationHistory] = useState<string[]>(() => loadLocationHistory());
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  // **終了時刻を手で直したか。** 真っさらな新規作成だけ false から始め、開始時刻を
  // 動かすと終了時刻が「開始の1時間後」に自動で追従する。編集時・プリセット
  // （香盤マスや週表の空きマスなぞりで渡された時刻）は既存/指定の値を保つため
  // true から始める — 何もしていないのに終了時刻が動くと「消えた」ように見える
  const endTimeTouchedRef = useRef(true);

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
    // 既定は「触られていない」= true（編集・プリセットは指定値を保つ）。
    // 真っさらな新規作成（下の else の else）だけ false に落とす
    endTimeTouchedRef.current = true;
    if (editingBooking) {
      const b = editingBooking;
      setTitle(b.title);
      setBookingType(b.booking_type);
      setStatus((b.status as "confirmed" | "tentative") || "tentative");
      setHoldRank(b.hold_rank ? String(b.hold_rank) : "");
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
      setAssigneeIds((b.assignees ?? []).map((a) => a.id));
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
      setTitle(""); setBookingType("performance"); setStatus("tentative"); setHoldRank("");
      setProjectId(presetProjectId || ""); setEpisodeId("");
      setLocationNote(""); setNotes("");
      setSelectedRoomIds(presetRoomIds ? new Set(presetRoomIds) : new Set());
      setRoomDetails({}); setMultiDay(false);
      setAssigneeIds([]);
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
          // **`allDay: false` でも時刻を含まない日付だけのプリセットがある**
          // （デスクトップツールバー・モバイルカレンダー経由。`useCalendarEdit.ts` の
          // `studioPreset`）。その場合は実質デフォルト値（09:00/18:00）のフォールバック
          // でしかないので、時刻付き（週表の空きマスなぞり）扱いにしない —
          // でないと開始時刻を動かしても追従が発火しない（Codex レビュー指摘・P2）
          endTimeTouchedRef.current = presetDate.start.includes("T");
        }
      } else {
        setAllDay(true);
        const today = localDateStr(new Date()); // 深夜のJSTで `toISOString` を使うと前日になる
        setStartDate(today); setEndDate(today);
        setStartTime("09:00"); setEndTime("18:00");
        // 何も指定されていない真っさらな新規作成だけ、開始時刻を動かすと
        // 終了時刻が追従するようにする（下の時刻欄の onChange）
        endTimeTouchedRef.current = false;
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
    // **足りない欄は「押せないボタン」ではなく理由で伝える。** 以前は
    // `disabled={!title || !startDate}` で黙って押せなくしていたが、タイトルには
    // 必須の印も押せない理由も無く、「壊れている」としか見えなかった
    if (!title) { setSaveError("タイトルを入れてください（案件と開始日を選ぶと自動で入ります）"); return; }
    if (!startDate) { setSaveError("開始日を入れてください"); return; }
    const effectiveEndDate = (isSingleDateType && !multiDay) ? startDate : endDate;
    if (!effectiveEndDate) { setSaveError("終了日を入れてください"); return; }
    // **HTML5 の `min` 属性は選択を制限するだけで、日付欄をキーボードで直接
    // 打ち直した値は素通りする。** 送信の直前でも前後関係を確かめる
    // （終了日入力の onChange 側の補正と合わせた二重の守り）
    if (effectiveEndDate < startDate) { setSaveError("終了日は開始日以降にしてください"); return; }
    if (locationNote.trim()) saveLocationHistory(locationNote.trim());
    const parsedHoldRank = holdRank.trim() ? Number(holdRank) : null;
    createMutation.mutate({
      title, booking_type: bookingType, status,
      // tentative のときだけ意味を持つ。confirmed に切り替えたときは送らない
      // (「渡さなかった項目は今の値を保つ」原則により、編集時は既存の値がそのまま残る)
      ...(status === "tentative"
        ? { hold_rank: parsedHoldRank && parsedHoldRank > 0 ? parsedHoldRank : null }
        : {}),
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
      assignee_user_ids: assigneeIds,
    });
  };

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
      /* Enterキーで予約できるようにする（`FormDialog` の `onSubmit` は opt-in）。
         「予約する」は `type="submit"` にして `onClick` を外してある — 両方あると二重送信になる。
         足りない欄は `handleSubmit` が `saveError` に理由を出す */
      onSubmit={(e) => { e.preventDefault(); if (!createMutation.isPending) handleSubmit(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button
            type="submit"
            disabled={createMutation.isPending}
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

              {/* ① 予約種別 */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">予約種別</p>
                <div className="flex flex-wrap gap-2 pb-0.5 -mx-1 px-1">
                  {BOOKING_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBookingType(opt.value)}
                      className={cn(
                        // スマホでは 44px（`min-h-tap`）・PC は今までどおり 39px
                        "min-h-tap lg:min-h-0 rounded-full px-4 py-2 text-[13px] font-medium border transition-all whitespace-nowrap",
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
                      placeholder="管理番号・案件名・顧客名で検索â¦"
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

              {/* ③ スタジオ・部屋（＋外現場）。
                  **日時より前に置く**（`docs/design/v4/_form-order.md` 段1「どれに付けるか」）。
                  部屋は「この予約が何を押さえるか」そのもので、案件と同じ段に属する。
                  以前は日時が先だったが、このフォームには空き状況が出ないため、
                  先に時間を決めても確かめる材料が無く、重複・営業時間外は保存後の
                  通知（`hours_check` / `duplicate_check`）でしか分からなかった */}
              <BookingRoomPicker
                roomLocations={roomLocations}
                selectedRoomIds={selectedRoomIds}
                setSelectedRoomIds={setSelectedRoomIds}
                toggleRoom={toggleRoom}
                locationNote={locationNote}
                setLocationNote={setLocationNote}
                onLocationNoteChange={handleLocationNoteChange}
                onLocationNoteFocus={handleLocationNoteFocus}
                locationInputRef={locationInputRef}
                showSuggestions={showLocationSuggestions}
                setShowSuggestions={setShowLocationSuggestions}
                suggestions={filteredSuggestions}
                suggestionsRef={suggestionsRef}
              />

              {/* ④ 控室利用者。**選んだ部屋にゲストルームが含まれるときだけ出る**ので、
                  部屋のすぐ下に置く（離すと、部屋を選んだ拍子に画面の下のほうへ欄が生える） */}
              <GreenroomOccupants
                roomLocations={roomLocations}
                selectedRoomIds={selectedRoomIds}
                roomDetails={roomDetails}
                setRoomDetails={setRoomDetails}
              />

              {/* ⑤ 日時（`BookingDateTimeSection.tsx` に切り出し — 1ファイル400行のラチェット） */}
              <BookingDateTimeSection
                isSingleDateType={isSingleDateType}
                allDay={allDay} setAllDay={setAllDay}
                multiDay={multiDay} setMultiDay={setMultiDay}
                startDate={startDate} setStartDate={setStartDate}
                endDate={endDate} setEndDate={setEndDate}
                startTime={startTime} setStartTime={setStartTime}
                endTime={endTime} setEndTime={setEndTime}
                endTimeTouchedRef={endTimeTouchedRef}
              />

              {/* ⑥ 予約状態。
                  **①予約種別のすぐ後ろではなく、日時・部屋が決まった直後に置く**
                  （パートナーの予定の「希望日」トグルと同じ位置。同じ意味の2値が
                  画面ごとに違う場所にあると、どちらの画面でも探すことになる）。
                  以前はメモの下＝最下段にあり、①で「仮押さえ／相談」を押すと
                  画面外のこの欄が黙って仮押さえに落ちていた（下の `disabled`）。 */}
              <div className="rounded-xl border bg-muted/30 lg:col-span-2">
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="text-[15px] font-medium">本予約にする</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {status === "confirmed" ? "本予約です" : "仮押さえのままです"}
                      {(bookingType === "hold" || bookingType === "consultation") && " — この種別は常に仮押さえです"}
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
                {status === "tentative" && (
                  <div className="flex items-center justify-between border-t px-4 py-3.5">
                    <div>
                      <p className="text-[15px] font-medium">何番手の仮押さえか</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        この時間の部屋を他の案件も仮押さえしているとき、順位が分かれば入力（任意）
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={holdRank}
                      onChange={(e) => setHoldRank(e.target.value)}
                      placeholder="未定"
                      className="w-20 rounded-lg border bg-background px-3 py-2 text-right outline-none"
                      style={{ fontSize: "16px", minHeight: "44px" }}
                    />
                  </div>
                )}
              </div>

              {/* ⑦ タイトル。
                  **材料になる欄（種別・案件・日時）より後ろに置く**
                  （`docs/design/v4/_form-order.md` 2-3「自動計算は入力の下」）。
                  この欄は案件と開始日から `案件名 (YY/MM/DD)` が自動で入る
                  （上の `lastAutoTitleRef` の useEffect）。以前は最上段にあったため、
                  手で題名を考えて書いた直後に下で案件を選ぶと書き換わっていた。
                  **唯一の必須**なので、プレースホルダだけで済ませず見出しに印を出す */}
              <div className="lg:col-span-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">タイトル（必須）</p>{/* ui-tokens-ok: 同じダイアログの他見出し（予約種別・案件・日時・メモ）と揃える既存書式 */}
                <div className="rounded-xl border bg-muted/30">
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="案件と開始日から自動で入ります"
                    className="w-full px-4 py-3.5 bg-transparent outline-none placeholder:text-muted-foreground/40"
                    style={{ fontSize: "16px" }}
                  />
                </div>
              </div>

              {/* ⑧ 担当者（複数・任意）。控室利用者（自由入力・社外可）とは別物 —
                  こちらは登録ユーザーから選ぶ、実務の割り当ての補助情報 */}
              <div className="lg:col-span-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">担当者（複数選択可・いなくてもよい）</p>{/* ui-tokens-ok: 同じダイアログの他見出し（予約種別・案件・日時・メモ）と揃える既存書式 */}
                <AssigneePicker
                  open={open}
                  assigneeIds={assigneeIds}
                  onChange={setAssigneeIds}
                  existingAssignees={editingBooking?.assignees}
                />
              </div>

              {/* ⑨ メモ */}
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

            </div>
    </FormDialog>
  );
}
