// 表の設定シート。14-schedule-v2-plan.md §3 A3・§4-2 (f)
//
// 題・日付・拠点・案件/番組・回・表示時間帯・状態・備考・共有・削除を1枚に集める。
// 表そのものの編集ができない（PUT /schedules/:id が画面から一度も呼ばれていない）
// という穴を塞ぐのが目的。PC は中央、375px は下端のシート（`FormDialog`）。
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { FormDialog, FormDialogFooter, formGrid2 } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { fmtHmPad, parseHm } from "@gmo-onair/shared/src/schedule/time";
import type { ScheduleDetail, ScheduleShare } from "@gmo-onair/shared/src/schedule/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BufferedInput from "@/components/editor/BufferedInput";
import BufferedTextarea from "./BufferedTextarea";
import ScheduleShareSection from "./ScheduleShareSection";
import ScheduleOwnerFields, { ownerValueOf, type OwnerValue } from "./ScheduleOwnerFields";
import { SCHEDULE_STATUS_LABEL, SCHEDULE_STATUS_ORDER } from "./scheduleStatus";
import { notifyError, notifySuccess } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";
import { isConflict } from "@/lib/scheduleApi";

interface Draft {
  title: string;
  serviceDate: string;
  locationId: string | null;
  owner: OwnerValue;
  viewStartMin: number;
  viewEndMin: number;
  status: string;
  notes: string;
}

const draftOf = (s: ScheduleDetail): Draft => ({
  title: s.title,
  serviceDate: s.service_date,
  locationId: s.location_id,
  owner: ownerValueOf(s.project_id, s.program_id, s.episode_id),
  viewStartMin: s.view_start_min,
  viewEndMin: s.view_end_min,
  status: s.status,
  notes: s.notes ?? "",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleDetail;
  currentUserId: string | null;
  isAdmin: boolean;
  onSaved: () => void;
  /** 削除できたときに呼ぶ（一覧へ戻す） */
  onDeleted: () => void;
}

export default function ScheduleSettingsDialog({ open, onOpenChange, schedule, currentUserId, isAdmin, onSaved, onDeleted }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(schedule));
  const [shares, setShares] = useState<ScheduleShare[]>([]);
  const [busy, setBusy] = useState(false);
  const canManage = isAdmin || (!!currentUserId && schedule.created_by === currentUserId);

  // 開くたびに、そのときの表の内容で作り直す（ScheduleItemDialog と同じ理由）
  useEffect(() => {
    if (open) setDraft(draftOf(schedule));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedule.id]);

  const sharesQuery = useQuery({
    queryKey: ["schedule-shares", schedule.id],
    queryFn: () => scheduleApi.getScheduleShares(schedule.id),
    enabled: open,
  });
  useEffect(() => { if (sharesQuery.data) setShares(sharesQuery.data); }, [sharesQuery.data]);

  const locationsQuery = useQuery({
    queryKey: ["studio-rooms"],
    queryFn: scheduleApi.listStudioRooms,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const glsAndProjectName = schedule.project_id
    ? `${schedule.gls_number ? `${schedule.gls_number} ` : ""}${schedule.project_name ?? ""}`.trim()
    : null;

  const save = async () => {
    if (!draft.title.trim()) { notifyError("題を入力してください。"); return; }
    if (draft.viewEndMin <= draft.viewStartMin) { notifyError("表示終了は表示開始より後にしてください。"); return; }
    setBusy(true);
    try {
      await scheduleApi.updateSchedule(schedule.id, {
        title: draft.title.trim(),
        service_date: draft.serviceDate,
        location_id: draft.locationId,
        project_id: draft.owner.ownerType === "project" ? draft.owner.projectId : null,
        program_id: draft.owner.ownerType === "program" ? draft.owner.programId : null,
        episode_id: draft.owner.ownerType === "project" ? draft.owner.episodeId : null,
        view_start_min: draft.viewStartMin,
        view_end_min: draft.viewEndMin,
        status: draft.status,
        notes: draft.notes || null,
        expected_updated_at: schedule.updated_at,
      });
      const sharedIdsChanged = canManage && (
        shares.length !== (sharesQuery.data ?? []).length
        || shares.some((s, i) => s.user_id !== (sharesQuery.data ?? [])[i]?.user_id)
      );
      if (sharedIdsChanged) {
        await scheduleApi.setScheduleShares(schedule.id, shares.map((s) => s.user_id));
      }
      notifySuccess("保存しました");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (isConflict(err)) {
        notifyError("この表は別のタブ／端末で更新されています。", { description: "閉じて開き直してから、もう一度お試しください。" });
        onSaved();
      } else {
        notifyError("保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: `「${schedule.title || "（無題）"}」を削除しますか？`,
      description: `項目 ${schedule.item_count ?? 0} 件・共有 ${schedule.share_count ?? 0} 人の設定もいっしょに消えます。`,
      confirmLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await scheduleApi.deleteSchedule(schedule.id);
      notifySuccess("削除しました");
      onOpenChange(false);
      onDeleted();
    } catch {
      notifyError("削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      setBusy(false);
    }
  };

  const locations = (locationsQuery.data ?? []).map((l) => ({ id: l.id, name: l.name }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="表の設定"
      sub={schedule.doc_no ? `No.${schedule.doc_no}` : undefined}
      size="md"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      footer={
        <FormDialogFooter className="sm:justify-between">
          {canManage ? (
            <Button type="button" variant="ghost" size="sm" className="min-h-tap text-destructive" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />この表を削除する
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={busy}>閉じる</Button>
            {canManage && <Button type="submit" className="min-h-tap" disabled={busy}>保存</Button>}
          </div>
        </FormDialogFooter>
      }
    >
      <fieldset disabled={!canManage || busy} className="space-y-4">
        <div>
          <Label htmlFor="sch-title">題</Label>
          <BufferedInput
            id="sch-title"
            value={draft.title}
            onCommit={(v) => set("title", v)}
            className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        <div className={formGrid2}>
          <div>
            <Label htmlFor="sch-date">日付</Label>
            <Input id="sch-date" type="date" value={draft.serviceDate} onChange={(e) => set("serviceDate", e.target.value)} className="mt-1 min-h-tap" />
          </div>
          <div>
            <Label>拠点</Label>
            <Select value={draft.locationId ?? ""} onValueChange={(v) => set("locationId", v || null)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="決めていない" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScheduleOwnerFields value={draft.owner} onChange={(owner) => set("owner", owner)} />

        <div className={formGrid2}>
          <div>
            <Label htmlFor="sch-view-start">表示開始（25:30 のように日跨ぎも可）</Label>
            <BufferedInput
              id="sch-view-start"
              value={fmtHmPad(draft.viewStartMin)}
              onCommit={(v) => { const m = parseHm(v); if (m != null) set("viewStartMin", m); }}
              className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              inputMode="numeric"
            />
          </div>
          <div>
            <Label htmlFor="sch-view-end">表示終了</Label>
            <BufferedInput
              id="sch-view-end"
              value={fmtHmPad(draft.viewEndMin)}
              onCommit={(v) => { const m = parseHm(v); if (m != null) set("viewEndMin", m); }}
              className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              inputMode="numeric"
            />
          </div>
        </div>

        <div>
          <Label>状態</Label>
          <div className="mt-1">
            <ToggleButtonGroup
              options={SCHEDULE_STATUS_ORDER.map((s) => ({ value: s, label: SCHEDULE_STATUS_LABEL[s] }))}
              value={[draft.status]}
              onChange={(next) => { const s = next[next.length - 1]; if (s) set("status", s); }}
              multi={false}
              cols={{ base: 3 }}
              size="sm"
              ariaLabel="表の状態"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="sch-notes">備考</Label>
          <BufferedTextarea
            id="sch-notes"
            value={draft.notes}
            onCommit={(v) => set("notes", v)}
            rows={2}
            className="mt-1 flex w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>

        <ScheduleShareSection
          projectMemberCount={schedule.project_member_count}
          glsAndProjectName={glsAndProjectName}
          creatorName={schedule.creator_name ?? null}
          shares={shares}
          onChange={setShares}
          readOnly={!canManage}
        />
      </fieldset>
    </FormDialog>
  );
}
