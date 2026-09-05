import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { localDateStr } from "@/lib/format";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/platform/AuthContext";
import { SCHEDULE_TYPE_LABELS, SCHEDULE_TYPE_COLORS, type PartnerSchedule } from "./scheduleShared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PartnerSchedule | null;
  /** カレンダーの日付選択から渡す初期値 (YYYY-MM-DD, end は inclusive) */
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

  // 対象者プルダウン（manager のみ）／担当者チップ（全員）に使う。パートナー権限保持者一覧
  // ⚠️ `partner_schedule` は旧モジュール名（権限モデル単純化で `sales` に統合済み・
  // migration 210）。この文字列のままだと `user_permissions.module` の完全一致に外れ、
  // system_admin 以外が誰も返らない（Codex レビューで指摘・#564）。鍵も他画面と同じ
  // `users-by-module-sales` に揃える — 別の鍵のままだと同じ内容を2回引くだけでなく、
  // 旧鍵 `partner-schedule-users`（`FilterDialogs.tsx` 等が今も使う）と同じ文字列に
  // 別の queryFn を紐づけてしまい、どちらが先に走るかでキャッシュが化ける
  const { data: partnerUsers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["users-by-module-sales"],
    queryFn: async () => (await api.get("/users/by-module/sales")).data.data,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /**
   * 担当者チップに出す一覧。**選択肢 (`partnerUsers`) だけでなく、いま選ばれている人も含める。**
   *
   * 既存の担当者が後から sales 権限を失うと `partnerUsers`（`/users/by-module/sales`）
   * には出てこなくなるが、`assigneeIds` には残ったまま。ここで出さないと外すボタンが
   * 無くなり、保存するたびサーバーが再送された無効なIDを 400 で拒否して
   * **二度と保存できなくなる**（Codex レビューで指摘・#564）。「対象外」と分かる
   * 見た目にして、外すことだけできるようにする（選び直しの候補には出さない）
   */
  const staleAssignees = (editing?.assignees ?? []).filter(
    (a) => assigneeIds.includes(a.id) && !partnerUsers.some((u) => u.id === a.id)
  );
  const assigneeChips = [
    ...partnerUsers.map((u) => ({ id: u.id, name: u.name, stale: false })),
    ...staleAssignees.map((a) => ({ id: a.id, name: a.name, stale: true })),
  ];

  useEffect(() => {
    if (!open) return;
    setError(null);
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
      setAllDay(true);
      setStartDate(presetRange?.start || today);
      setEndDate(presetRange?.end || presetRange?.start || today);
      setStartTime("09:00"); setEndTime("18:00");
      setNotes("");
      setTentative(false);
      setAssigneeIds([]);
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
    onError: (err: any) => setError(err?.response?.data?.error?.message || "保存に失敗しました"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/schedule/partner/${editing!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-schedules"] });
      qc.invalidateQueries({ queryKey: ["my-partner-schedules"] });
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || "削除に失敗しました"),
  });

  const canSubmit = !!startDate && (allDay || (!!startTime && !!endTime));
  const ownRow = !editing || editing.user_id === currentUser?.id;
  const canModify = ownRow || isManager;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "パートナー予定を編集" : "パートナー予定を登録"}
      size="lg"
      sub="ここに登録した予定はパートナースケジュール権限を持つメンバー全員に共有されます。"
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
          <Button type="button" onClick={() => saveMutation.mutate()} disabled={!canSubmit || !canModify || saveMutation.isPending}>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>開始日</Label>
              <Input type="date" value={startDate} onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }} />
            </div>
            <div className="space-y-1.5">
              <Label>終了日</Label>
              <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {!allDay && (
              <>
                <div className="space-y-1.5">
                  <Label>開始時刻</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>終了時刻</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </>
            )}
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

          {/* 担当者（複数・任意） */}
          <div className="space-y-1.5">
            <Label>担当者（複数選択可・いなくてもよい）</Label>
            {assigneeChips.length === 0 ? (
              <p className="text-sub-sm text-muted-foreground">選べる人がいません。</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {assigneeChips.map((u) => {
                  const on = assigneeIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAssignee(u.id)}
                      title={u.stale ? "sales 権限が無くなっているため選び直せません。外すことだけできます" : undefined}
                      className={cn(
                        "text-badge rounded-full border px-3 py-1.5 transition-colors",
                        u.stale
                          ? "border-dashed border-destructive/40 text-destructive"
                          : on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {u.name}{u.stale && "（対象外・外すのみ可）"}
                    </button>
                  );
                })}
              </div>
            )}
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
