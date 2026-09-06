// 列（会場・支度・運営）を 1 本つくる／直す。14-schedule-v2-plan.md §3 A1・§4-2 (d)
//
// 列見出しの鉛筆・「列を足す」から開く。名前・部屋（会場だけ）・色と、
// 左へ／右へ・削除をここに集める（ドロップダウンの部品を増やさないため）。
// PC は中央、375px は下端のシート（`Sheet`）。
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { FormDialog, FormDialogFooter, formGrid2 } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { COL_GROUPS, COL_GROUP_LABEL, type ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import type { ScheduleColumn } from "@gmo-onair/shared/src/schedule/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BufferedInput from "@/components/editor/BufferedInput";
import { notifyError, notifySuccess } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";
import { isConflict } from "@/lib/scheduleApi";
import { cn } from "@/lib/utils";
import { COLUMN_COLORS, cssColor, normalizeColor } from "./columnColors";
import { moveColumn, siblingsOf } from "./columnOrder";

const NO_ROOM = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  columns: ScheduleColumn[];
  /** 直す列。無ければ新規作成 */
  column?: ScheduleColumn | null;
  /** 新規作成のときの最初のグループ */
  initialGroup?: ColGroup;
  /** この列にいま入っている項目の数（削除の確認に書く） */
  itemCount?: number;
  /** 作った・直した・消した・並べ替えたあとに呼ぶ（親が読み直す） */
  onChanged: () => void;
}

interface Draft { group: ColGroup; label: string; roomId: string | null; color: string | null }

const draftOf = (column: ScheduleColumn | null | undefined, group: ColGroup): Draft => ({
  group: column?.col_group ?? group,
  label: column?.label ?? "",
  roomId: column?.room_id ?? null,
  color: column?.color ? normalizeColor(column.color) : null,
});

export default function ColumnDialog({ open, onOpenChange, scheduleId, columns, column, initialGroup = "venue", itemCount = 0, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(column, initialGroup));
  const [busy, setBusy] = useState(false);
  const isEdit = !!column;

  // 開くたびに、そのときの列で作り直す（ScheduleItemDialog と同じ理由: 常にマウントされたまま）
  useEffect(() => {
    if (open) setDraft(draftOf(column, initialGroup));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const roomsQuery = useQuery({
    queryKey: ["studio-rooms"],
    queryFn: scheduleApi.listStudioRooms,
    enabled: open && draft.group === "venue",
    staleTime: 5 * 60 * 1000,
  });
  const rooms = (roomsQuery.data ?? []).flatMap((loc) => loc.rooms.map((r) => ({ ...r, locationName: loc.name })));

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const pickRoom = (roomId: string) => {
    const room = rooms.find((r) => r.id === roomId);
    setDraft((d) => {
      const previous = rooms.find((r) => r.id === d.roomId);
      const labelIsDefault = !d.label.trim() || (previous && d.label === previous.name);
      return {
        ...d,
        roomId: room?.id ?? null,
        label: room && labelIsDefault ? room.name : d.label,
        color: d.color ?? (room ? normalizeColor(room.color) : null),
      };
    });
  };

  const fail = (err: unknown, what: string) => {
    if (isConflict(err)) {
      notifyError("この列は別のタブ／端末で更新されています。", { description: "最新を読み込んでから、もう一度お試しください。" });
      onChanged();
    } else {
      notifyError(`${what}できませんでした。`, { description: "少し待ってから、もう一度お試しください。" });
    }
  };

  const save = async () => {
    if (!draft.label.trim()) { notifyError("列の名前を入力してください。"); return; }
    setBusy(true);
    try {
      if (column) {
        await scheduleApi.updateColumn(scheduleId, column.id, {
          label: draft.label.trim(),
          room_id: column.col_group === "venue" ? draft.roomId : null,
          color: draft.color,
          expected_updated_at: column.updated_at,
        });
        notifySuccess("保存しました");
      } else {
        await scheduleApi.createColumn(scheduleId, {
          col_group: draft.group,
          label: draft.label.trim(),
          room_id: draft.group === "venue" ? draft.roomId : null,
          color: draft.color,
        });
        notifySuccess("列を足しました");
      }
      onChanged();
      onOpenChange(false);
    } catch (err) {
      fail(err, "保存");
    } finally {
      setBusy(false);
    }
  };

  const move = async (direction: -1 | 1) => {
    if (!column) return;
    const order = moveColumn(columns, column, direction);
    if (!order) return;
    setBusy(true);
    try {
      await scheduleApi.reorderColumns(scheduleId, order);
      onChanged();
      onOpenChange(false);
    } catch (err) {
      fail(err, "並べ替え");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!column) return;
    const ok = await confirmAction({
      title: `列「${column.room_name || column.label}」を削除しますか？`,
      description: itemCount > 0 ? `この列の項目 ${itemCount} 件もいっしょに消えます。` : "この列にはまだ項目がありません。",
      confirmLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await scheduleApi.deleteColumn(scheduleId, column.id);
      notifySuccess("列を削除しました");
      onChanged();
      onOpenChange(false);
    } catch (err) {
      fail(err, "削除");
    } finally {
      setBusy(false);
    }
  };

  const siblings = column ? siblingsOf(columns, column) : [];
  const position = column ? siblings.findIndex((c) => c.id === column.id) : -1;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "列を直す" : "列を足す"}
      sub={isEdit ? `${COL_GROUP_LABEL[column!.col_group]}の列` : "会場は 1 部屋 1 列。支度・運営は役割ごとに 1 列にします。"}
      size="sm"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      footer={
        <FormDialogFooter className="sm:justify-between">
          {isEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="min-h-[44px]" disabled={busy || position <= 0} onClick={() => void move(-1)} aria-label="左へ">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />左へ
              </Button>
              <Button type="button" variant="outline" size="sm" className="min-h-[44px]" disabled={busy || position < 0 || position >= siblings.length - 1} onClick={() => void move(1)} aria-label="右へ">
                右へ<ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="min-h-[44px] text-destructive" disabled={busy} onClick={() => void remove()}>
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />削除する
              </Button>
            </div>
          ) : <span />}
          <Button type="submit" className="min-h-[44px]" disabled={busy}>{isEdit ? "保存" : "列を足す"}</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        {!isEdit && (
          <div>
            <Label>グループ</Label>
            <div className="mt-1">
              <ToggleButtonGroup
                options={COL_GROUPS.map((g) => ({ value: g, label: COL_GROUP_LABEL[g] }))}
                value={[draft.group]}
                onChange={(next) => { const g = next[next.length - 1] as ColGroup | undefined; if (g) set("group", g); }}
                multi={false}
                cols={{ base: 3 }}
                size="sm"
                ariaLabel="列のグループ"
              />
            </div>
          </div>
        )}

        {draft.group === "venue" && (
          <div>
            <Label>部屋</Label>
            <Select value={draft.roomId ?? NO_ROOM} onValueChange={(v) => (v === NO_ROOM ? set("roomId", null) : pickRoom(v))}>
              <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue placeholder="部屋を選ぶ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>結ばない（会場名だけ）</SelectItem>
                {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.locationName} ／ {r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className={formGrid2}>
          <div className="sm:col-span-2">
            <Label htmlFor="column-label">名前</Label>
            <BufferedInput
              id="column-label"
              value={draft.label}
              onCommit={(v) => set("label", v)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={draft.group === "venue" ? "例: LOUNGE" : draft.group === "prep" ? "例: MC" : "例: 受付"}
            />
          </div>
        </div>

        <div>
          <Label>色</Label>
          <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="列の色">
            <button
              type="button"
              role="radio"
              aria-checked={draft.color === null}
              aria-label="色なし"
              onClick={() => set("color", null)}
              className={cn("min-h-[44px] min-w-[44px] rounded-md border-2 bg-background text-xs text-muted-foreground", draft.color === null ? "border-primary" : "border-input")}
            >
              なし
            </button>
            {COLUMN_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={draft.color === c.value}
                aria-label={c.label}
                onClick={() => set("color", c.value)}
                className={cn("min-h-[44px] min-w-[44px] rounded-md border-2", draft.color === c.value ? "border-foreground" : "border-transparent")}
                style={{ backgroundColor: cssColor(c.value) ?? undefined }}
              />
            ))}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
