import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { localDateStr, addMinutesToTimeStr } from "@/lib/format";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/platform/AuthContext";
import { AssigneePicker, useAssigneeCandidates } from "../AssigneePicker";
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS, type PartnerSchedule } from "./scheduleShared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PartnerSchedule | null;
  /**
   * カレンダーの選択から渡す初期値（end は inclusive）。
   * `YYYY-MM-DD` なら終日、`YYYY-MM-DDTHH:MM` なら**その時刻**で開く
   * （週表の空きマスをなぞった時間をそのまま持ち込むため）。
   */
  presetRange?: { start: string; end: string } | null;
  /** 他人の予定も操作できるか (manager / system_admin) */
  isManager: boolean;
}

export default function PartnerScheduleDialog({ open, onOpenChange, editing, presetRange, isManager }: Props) {
  const qc = useQueryClient();
  const { currentUser } = useAuth();

  const [userId, setUserId] = useState("");
  const [scheduleType, setScheduleType] = useState("daikyu");
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [notes, setNotes] = useState("");
  // 確定 / 希望日（未確定）。studio_bookings.status と同じ2値のディップスイッチ的トグル
  const [tentative, setTentative] = useState(false);
  // 担当者（複数・任意）。登録ユーザーから選ぶので user_id の配列で持つ
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // **終了時刻を手で直したか。** 真っさらな新規作成（時刻指定の無いプリセット含む）
  // だけ false から始め、開始時刻を動かすと終了時刻が「開始の1時間後」に追従する
  const endTimeTouchedRef = useRef(true);

  // 対象者プルダウン（manager のみ）に使う。パートナー権限（sales）保持者一覧。
  // 担当者チップは `AssigneePicker`（`../AssigneePicker`）が同じ一覧を内部で引く
  const { data: partnerUsers = [] } = useAssigneeCandidates(open);

  useEffect(() => {
    if (!open) return;
    setError(null);
    endTimeTouchedRef.current = true; // 既定は「触られていない」= true。新規作成の分岐だけ下で false に落とす
    if (editing) {
      setUserId(editing.user_id);
      setScheduleType(editing.schedule_type);
      setTitle(editing.title);
      setAllDay(!!editing.all_day);
      const [sd, st] = editing.start_time.split("T");
      const [ed, et] = editing.end_time.split("T");
      setStartDate(sd); setEndDate(ed);
      setStartTime(st?.slice(0, 5) || "09:00");
      setEndTime(et?.slice(0, 5) || "18:00");
      setNotes(editing.notes || "");
      setTentative(editing.status === "tentative");
      setAssigneeIds((editing.assignees ?? []).map((a) => a.id));
    } else {
      // **`toISOString` を使わない** — 深夜0時〜朝9時 (JST) に開くと UTC に寄って前日になる
      const today = localDateStr(new Date());
      setUserId(currentUser?.id || "");
      setScheduleType("daikyu");
      setTitle("");
      // **時刻付きの preset（週表の空きマスをなぞった時間）を捨てない。**
      // 以前は日付だけを見ていたため、14:00–16:00 をなぞってから「パートナーの予定」を
      // 選ぶと、時刻が黙って消えて終日 09:00–18:00 に戻っていた（画面には何も出ない）。
      // 時刻が付いていたら終日を外し、その時刻を入れる。日付だけなら今までどおり終日。
      const ps = presetRange?.start || today;
      const pe = presetRange?.end || presetRange?.start || today;
      const [psDate, psTime] = ps.split("T");
      const [peDate, peTime] = pe.split("T");
      setAllDay(!psTime);
      setStartDate(psDate || today);
      setEndDate(peDate || psDate || today);
      setStartTime(psTime?.slice(0, 5) || "09:00");
      setEndTime(peTime?.slice(0, 5) || "18:00");
      setNotes("");
      setTentative(false);
      setAssigneeIds([]);
      // 時刻付きのプリセット（週表の空きマスなぞり）はその時刻を保つ。
      // 日付だけ・真っさらな新規作成は、開始時刻を動かすと終了時刻が追従する
      endTimeTouchedRef.current = !!psTime;
    }
  }, [open, editing, presetRange, currentUser?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: userId || undefined,
        schedule_type: scheduleType,
        // タイトル未入力は種別ラベルで埋める (「有給」等はタイトル省略が自然なため)
        title: title.trim() || SCHEDULE_TYPE_LABELS[scheduleType] || "予定",
        all_day: allDay,
        start_time: allDay ? startDate : `${startDate}T${startTime}`,
        end_time: allDay ? (endDate || startDate) : `${endDate || startDate}T${endTime}`,
        notes: notes.trim() || null,
        status: tentative ? "tentative" : "confirmed",
        assignee_user_ids: assigneeIds,
      };
      if (editing) return api.put(`/schedule/partner/${editing.id}`, payload);
      return api.post("/schedule/partner", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-schedules"] });
      qc.invalidateQueries({ queryKey: ["my-partner-schedules"] });
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || "予定を保存できませんでした。入力の内容を確かめてもう一度お試しください。"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/schedule/partner/${editing!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-schedules"] });
      qc.invalidateQueries({ queryKey: ["my-partner-schedules"] });
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || "予定を削除できませんでした。少し時間をおいてもう一度お試しください。"),
  });

  // **UI 側（下の日付欄 onChange）で前後関係を補正しているが、念のためここでも見る。**
  // `min` 属性はカレンダー UI の選択しか止めず、キーボードで日付欄を直接打ち直すと
  // すり抜けるため（ブラウザ標準の吹き出しで止まり、この画面のエラー表示には出てこない）
  const canSubmit = !!startDate && (allDay || (!!startTime && !!endTime)) && (!endDate || endDate >= startDate);
  const ownRow = !editing || editing.user_id === currentUser?.id;
  const canModify = ownRow || isManager;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "パートナー予定を編集" : "パートナー予定を登録"}
      size="lg"
      sub="ここに登録した予定はパートナースケジュール権限を持つメンバー全員に共有されます。"
      /* Enterキーで登録できるようにする（`FormDialog` の `onSubmit` は opt-in）。
         送信ボタンは `type="submit"` にして `onClick` を外してある — 両方あると二重送信になる */
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || !canModify || saveMutation.isPending) return;
        saveMutation.mutate();
      }}
      footer={
        <FormDialogFooter>
          {editing && canModify && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10 sm:mr-auto"
              onClick={() => { if (confirm("この予定を削除しますか？")) deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
              削除
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button type="submit" disabled={!canSubmit || !canModify || saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? "保存" : "登録"}
          </Button>
        </FormDialogFooter>
      }
    >
        <div className="space-y-4">
          {/* 対象者 (manager のみ他人を選択可) */}
          {isManager ? (
            <div className="space-y-1.5">
              <Label>対象者</Label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                {partnerUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>対象者</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {editing ? editing.user_name : currentUser?.name}（自分の予定のみ登録できます）
              </div>
            </div>
          )}

          {/* 担当者（複数・任意）。
              **「対象者」のすぐ下に置く**（`docs/design/v4/_form-order.md` 段4「誰が」）。
              以前は「メモ」の直前＝下から2番目にあり、間に 種別・タイトル・終日・日付・
              時刻・希望日 が挟まっていた。どちらも人を選ぶ欄なのに離れているせいで、
              **対象者（誰の予定か）と担当者（この予定に付く人）の違いが画面から読めなかった** */}
          <div className="space-y-1.5">
            <Label>担当者（複数選択可・いなくてもよい）</Label>
            <p className="text-xs text-muted-foreground">対象者＝誰の予定か。担当者＝その予定に付く社内のメンバー。</p>
            <AssigneePicker
              open={open}
              assigneeIds={assigneeIds}
              onChange={setAssigneeIds}
              existingAssignees={editing?.assignees}
            />
          </div>

          {/* 種別 */}
          <div className="space-y-1.5">
            <Label>種別</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(SCHEDULE_TYPE_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScheduleType(key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    scheduleType === key ? "text-white border-transparent" : "text-muted-foreground hover:bg-accent"
                  )}
                  style={scheduleType === key ? { backgroundColor: SCHEDULE_TYPE_COLORS[key] } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* タイトル */}
          <div className="space-y-1.5">
            <Label>タイトル（省略時は種別名）</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={SCHEDULE_TYPE_LABELS[scheduleType]} />
          </div>

          {/* 終日 / 期間 */}
          <div className="flex items-center gap-2">
            <Switch checked={allDay} onCheckedChange={setAllDay} id="ps-allday" />
            <Label htmlFor="ps-allday">終日</Label>
          </div>
          {/* 日時は**境界ごとに1行**（開始＝日＋時刻／終了＝日＋時刻）。
              自分の予定（`PersonalEventDialog`）・スタジオ予約と同じ読み方にそろえる。
              以前の「日付の行／時刻の行」だと、スマホ（1列）で
              開始日→**終了日**→開始時刻→終了時刻 と落ちていた */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>開始</Label>
              <div className="flex gap-2">
                <Input type="date" className="min-w-0 flex-1" value={startDate} onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  if (!endDate || endDate < v) setEndDate(v);
                }} />
                {!allDay && (
                  <Input type="time" className="w-28 shrink-0" value={startTime} onChange={(e) => {
                    const v = e.target.value;
                    setStartTime(v);
                    // **終了時刻を手で直していなければ「開始の1時間後」に追従**
                    if (!endTimeTouchedRef.current) setEndTime(addMinutesToTimeStr(v, 60));
                  }} />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>終了</Label>
              <div className="flex gap-2">
                <Input
                  type="date" className="min-w-0 flex-1" value={endDate} min={startDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    // **`min` はカレンダー UI の選択しか止めない。** キーボードで
                    // 開始日より前の日付を直接打ち込んでもすり抜けるため、ここでも弾く
                    setEndDate(v < startDate ? startDate : v);
                  }}
                />
                {!allDay && (
                  <Input
                    type="time" className="w-28 shrink-0" value={endTime}
                    onChange={(e) => { endTimeTouchedRef.current = true; setEndTime(e.target.value); }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 確定 / 希望日（未確定） */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Switch checked={tentative} onCheckedChange={setTentative} id="ps-tentative" />
              <Label htmlFor="ps-tentative">希望日（まだ確定していない）</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              オンにすると、カレンダーに破線の枠で「未確定」として表示されます。決まったらオフにしてください。
            </p>
          </div>

          {/* メモ */}
          <div className="space-y-1.5">
            <Label>メモ（任意）</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="例：大阪出張（〇〇社訪問）" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    </FormDialog>
  );
}
