// 「会場を選んで列を作る」。14-schedule-v2-plan.md §3 A2
//
// スタジオの部屋（`studio_rooms`）を複数選ぶと、1 部屋 1 列で「会場」列を作る。
// すでに同じ部屋を結んだ列がある部屋は選べない。表に拠点がまだ無く、選んだ部屋が
// 1 つの拠点に収まるときは、表の拠点もその拠点にする（ひな形の拠点別の絞り込みが効くようになる）。
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import type { ScheduleColumn } from "@gmo-onair/shared/src/schedule/types";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";
import { cssColor, normalizeColor } from "./columnColors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  scheduleLocationId: string | null;
  columns: ScheduleColumn[];
  onCreated: () => void;
}

export default function VenueColumnsDialog({ open, onOpenChange, scheduleId, scheduleLocationId, columns, onCreated }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setSelected([]); }, [open]);

  const roomsQuery = useQuery({
    queryKey: ["studio-rooms"],
    queryFn: scheduleApi.listStudioRooms,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const linkedRoomIds = new Set(columns.map((c) => c.room_id).filter((id): id is string => !!id));
  const locations = roomsQuery.data ?? [];

  const create = async () => {
    const chosen = locations.flatMap((loc) => loc.rooms.filter((r) => selected.includes(r.id)).map((r) => ({ ...r, locationId: loc.id })));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      for (const room of chosen) {
        await scheduleApi.createColumn(scheduleId, {
          col_group: "venue",
          label: room.name,
          room_id: room.id,
          color: normalizeColor(room.color),
        });
      }
      const locationIds = new Set(chosen.map((r) => r.locationId));
      if (!scheduleLocationId && locationIds.size === 1) {
        // 拠点は表の設定でいつでも直せる。ここでは「まだ決めていない」ときだけ埋める
        await scheduleApi.updateSchedule(scheduleId, { location_id: [...locationIds][0] }).catch(() => undefined);
      }
      notifySuccess(`列を ${chosen.length} 件足しました`);
      onCreated();
      onOpenChange(false);
    } catch {
      notifyError("列を作れませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      onCreated(); // 途中まで作れている可能性があるので読み直す
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="会場を選んで列を作る"
      sub="1 部屋が 1 列になります。あとから列の名前・色は直せます。"
      size="md"
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => onOpenChange(false)} disabled={busy}>閉じる</Button>
          <Button type="button" className="min-h-[44px]" onClick={() => void create()} disabled={busy || selected.length === 0}>
            {selected.length > 0 ? `列を作る（${selected.length}）` : "列を作る"}
          </Button>
        </FormDialogFooter>
      }
    >
      {roomsQuery.isLoading && <p className="text-sm text-muted-foreground">読み込み中…</p>}
      {!roomsQuery.isLoading && locations.every((l) => l.rooms.length === 0) && (
        <EmptyState title="選べる部屋がありません" description="部屋はカレンダーのスタジオ設定で登録します。列の名前を手で付けるには「列を足す」を使ってください。" />
      )}
      <div className="space-y-4">
        {locations.filter((l) => l.rooms.length > 0).map((loc) => (
          <div key={loc.id}>
            <p className="mb-1 text-sm font-bold text-foreground">{loc.name}</p>
            <ToggleButtonGroup
              options={loc.rooms.map((r) => ({
                value: r.id,
                label: r.name,
                description: linkedRoomIds.has(r.id) ? "すでに列があります" : undefined,
                disabled: linkedRoomIds.has(r.id),
                color: cssColor(r.color) ?? undefined,
                leftSlot: <span className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: cssColor(r.color) ?? undefined }} aria-hidden="true" />,
              }))}
              value={selected}
              onChange={setSelected}
              multi
              cols={{ base: 1, sm: 2 }}
              size="sm"
              ariaLabel={`${loc.name} の部屋`}
            />
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
