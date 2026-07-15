import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Trash2, CloudDownload } from "lucide-react";
import type { PersonalEvent } from "./scheduleShared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PersonalEvent | null;
  /** カレンダーの日付選択から渡す初期値 (YYYY-MM-DD, end は inclusive) */
  presetRange?: { start: string; end: string; allDay: boolean } | null;
}

// マイカレンダーの個人予定 ダイアログ。
// 外部同期分 (source='ics' / 'google' / 'outlook') は読み取り専用 (削除のみ可・次回同期で復活する旨を表示)。
export default function PersonalEventDialog({ open, onOpenChange, editing, presetRange }: Props) {
  const qc = useQueryClient();
  const isIcs = editing?.source === "ics" || editing?.source === "google" || editing?.source === "outlook";

  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setTitle(editing.title);
      setAllDay(!!editing.all_day);
      const [sd, st] = editing.start_time.split("T");
      const [ed, et] = editing.end_time.split("T");
      setStartDate(sd); setEndDate(ed);
      setStartTime(st?.slice(0, 5) || "10:00");
      setEndTime(et?.slice(0, 5) || "11:00");
      setLocation(editing.location || "");
      setNotes(editing.notes || "");
    } else {
      const today = new Date().toISOString().split("T")[0];
      setTitle("");
      setAllDay(presetRange?.allDay ?? false);
      setStartDate(presetRange?.start?.split("T")[0] || today);
      setEndDate(presetRange?.end?.split("T")[0] || presetRange?.start?.split("T")[0] || today);
      setStartTime(presetRange?.start?.split("T")[1]?.slice(0, 5) || "10:00");
      setEndTime(presetRange?.end?.split("T")[1]?.slice(0, 5) || "11:00");
      setLocation(""); setNotes("");
    }
  }, [open, editing, presetRange]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        all_day: allDay,
        start_time: allDay ? startDate : `${startDate}T${startTime}`,
        end_time: allDay ? (endDate || startDate) : `${endDate || startDate}T${endTime}`,
        location: location.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing) return api.put(`/schedule/personal/${editing.id}`, payload);
      return api.post("/schedule/personal", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-events"] });
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || "保存に失敗しました"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => api.delete(`/schedule/personal/${editing!.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-events"] });
      onOpenChange(false);
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || "削除に失敗しました"),
  });

  const canSubmit = !!title.trim() && !!startDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? (isIcs ? "同期された予定" : "個人予定を編集") : "個人予定を登録"}</DialogTitle>
          <DialogDescription>
            個人予定はあなた以外には表示されません。
          </DialogDescription>
        </DialogHeader>

        {isIcs && (
          <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
            <CloudDownload className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {editing?.feed_label || "外部カレンダー"} から同期された予定です。内容の変更は Outlook/Google 側で行ってください
              (ここで削除しても、外部カレンダーに残っていれば次回同期で復活します)。
            </span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>タイトル</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isIcs} placeholder="例：歯医者 / 私用" />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={allDay} onCheckedChange={setAllDay} id="pe-allday" disabled={isIcs} />
            <Label htmlFor="pe-allday">終日</Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>開始日</Label>
              <Input type="date" value={startDate} disabled={isIcs} onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }} />
            </div>
            <div className="space-y-1.5">
              <Label>終了日</Label>
              <Input type="date" value={endDate} min={startDate} disabled={isIcs} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {!allDay && (
              <>
                <div className="space-y-1.5">
                  <Label>開始時刻</Label>
                  <Input type="time" value={startTime} disabled={isIcs} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>終了時刻</Label>
                  <Input type="time" value={endTime} disabled={isIcs} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>場所（任意）</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} disabled={isIcs} />
          </div>
          <div className="space-y-1.5">
            <Label>メモ（任意）</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={isIcs} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {editing && (
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isIcs ? "閉じる" : "キャンセル"}
          </Button>
          {!isIcs && (
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={!canSubmit || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editing ? "保存" : "登録"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
