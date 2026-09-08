// スケジュール表の新規作成。14-schedule-v2-plan.md §3 A5
//
// 題・日付だけだった作成ダイアログに、拠点・案件/番組・回・ひな形・本番開始時刻を足した。
// 案件を選ぶと題・日付を案件の事実（`GET /lookup/:projectId/context`）から先埋めする
// （codex 棚卸し #325「案件から引けるのに手入力」）。**先埋めは空欄／初期値のときだけ**
// ——手で打った値は上書きしない。拠点の id は案件の事実に含まれない（`venue` は部屋名の
// 文字列で `studio_locations.id` を持たない）ので、拠点の先埋めはしない。
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter, formGrid2 } from "@gmo-onair/shared/src/client-v4/formDialog";
import { fmtHmPad, parseHm } from "@gmo-onair/shared/src/schedule/time";
import type { Schedule } from "@gmo-onair/shared/src/schedule/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BufferedInput from "@/components/editor/BufferedInput";
import ScheduleOwnerFields, { ownerValueOf, type OwnerValue } from "./ScheduleOwnerFields";
import { notifyError } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";

const NO_TEMPLATE = "__none__";
const todayYmd = () => new Date().toISOString().slice(0, 10);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `?project=`/`?program=` で絞り込まれているとき。案件/番組の選び直しはさせない
   * （一覧の決めごと「フィルタで来ている時点で owner は決まっている」を維持） */
  lockedOwner?: { projectId?: string | null; programId?: string | null; label: string };
  onCreated: (schedule: Schedule) => void;
}

export default function CreateScheduleDialog({ open, onOpenChange, lockedOwner, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [serviceDate, setServiceDate] = useState(todayYmd);
  const [dateTouched, setDateTouched] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerValue>(() => ownerValueOf(lockedOwner?.projectId, lockedOwner?.programId, null));
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [onairStartMin, setOnairStartMin] = useState<number | null>(null);
  const prefilledProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setTitleTouched(false);
    setServiceDate(todayYmd()); setDateTouched(false);
    setLocationId(null);
    setOwner(ownerValueOf(lockedOwner?.projectId, lockedOwner?.programId, null));
    setTemplateId(null);
    setOnairStartMin(null);
    prefilledProjectRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const locationsQuery = useQuery({
    queryKey: ["studio-rooms"],
    queryFn: scheduleApi.listStudioRooms,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const templatesQuery = useQuery({
    queryKey: ["schedule-templates", locationId],
    queryFn: () => scheduleApi.listTemplates(locationId),
    enabled: open,
  });

  // 案件を選んだら、題・日付が空欄／初期値のままなら案件の事実から埋める
  useEffect(() => {
    const pid = owner.ownerType === "project" ? owner.projectId : null;
    if (!pid || pid === prefilledProjectRef.current) return;
    prefilledProjectRef.current = pid;
    scheduleApi.getProjectContext(pid).then((ctx) => {
      if (!titleTouched && !title.trim()) setTitle(ctx.name);
      if (!dateTouched) setServiceDate(ctx.performanceDates[0] ?? ctx.eventStart ?? todayYmd());
    }).catch(() => { /* 先埋めが失敗しても手入力は妨げない */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner.ownerType, owner.projectId]);

  const createMutation = useMutation({
    mutationFn: () => scheduleApi.createSchedule({
      title: title.trim() || "無題のスケジュール表",
      service_date: serviceDate,
      location_id: locationId,
      project_id: owner.ownerType === "project" ? owner.projectId : null,
      program_id: owner.ownerType === "program" ? owner.programId : null,
      episode_id: owner.ownerType === "project" ? owner.episodeId : null,
      template_id: templateId,
      onair_start_min: onairStartMin,
    }),
    onSuccess: (row) => { onOpenChange(false); onCreated(row); },
    onError: (err: unknown) => {
      // createSchedule はテンプレートの本番開始が必須なのに空だと 400 を返す（サーバー側の検証）
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 400 && templateId) {
        notifyError("本番開始時刻を入力してください。", { description: "選んだ工程テンプレートは本番開始が基準の項目を含みます。" });
      } else {
        notifyError("スケジュール表を作れませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      }
    },
  });

  const locations = (locationsQuery.data ?? []).map((l) => ({ id: l.id, name: l.name }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="スケジュール表を新しく作る"
      size="md"
      onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>閉じる</Button>
          <Button type="submit" className="min-h-tap" disabled={createMutation.isPending}>作る</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="new-schedule-title">題</Label>
          <BufferedInput
            id="new-schedule-title"
            value={title}
            onCommit={(v) => { setTitle(v); setTitleTouched(true); }}
            className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="例: 本番当日"
          />
        </div>

        <div className={formGrid2}>
          <div>
            <Label htmlFor="new-schedule-date">日付</Label>
            <Input
              id="new-schedule-date" type="date" value={serviceDate}
              onChange={(e) => { setServiceDate(e.target.value); setDateTouched(true); }}
              className="mt-1 min-h-tap"
            />
          </div>
          <div>
            <Label>拠点</Label>
            <Select value={locationId ?? ""} onValueChange={(v) => setLocationId(v || null)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="決めていない" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScheduleOwnerFields
          value={owner}
          onChange={setOwner}
          locked={!!lockedOwner}
          lockedLabel={lockedOwner?.label}
        />

        <div className={formGrid2}>
          <div>
            <Label>工程テンプレート（任意）</Label>
            <Select value={templateId ?? NO_TEMPLATE} onValueChange={(v) => setTemplateId(v === NO_TEMPLATE ? null : v)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>使わない（あとで列を追加）</SelectItem>
                {(templatesQuery.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {templateId && (
            <div>
              <Label htmlFor="new-schedule-onair">本番開始時刻（工程テンプレートによっては必須）</Label>
              <BufferedInput
                id="new-schedule-onair"
                value={onairStartMin != null ? fmtHmPad(onairStartMin) : ""}
                onCommit={(v) => setOnairStartMin(parseHm(v))}
                className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm"
                inputMode="numeric"
                placeholder="19:00"
              />
            </div>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
