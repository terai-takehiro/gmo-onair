// 「予約から列を入れる」。14-schedule-v2-plan.md §3 B9・§3-1
//
// `VenueColumnsDialog.tsx`（会場を選んで列を作る）の姉妹ダイアログ。あちらは全拠点の
// 部屋を並べるが、こちらは**その日の実際のスタジオ予約**（`studio_bookings`）から部屋を出す
// ——「下見→選択→コピー」の作法（§3-1）で、仮押さえも隠さず「（仮）」付きで見せて
// 人に選ばせる（自動で列を立てない）。色・名前・重複排除のロジックは
// `VenueColumnsDialog.tsx` と同じにしてある。
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
  /** この表の案件。予約の案件と違うときに「他案件」の注記を出すために使う */
  scheduleProjectId: string | null;
  columns: ScheduleColumn[];
  onCreated: () => void;
}

// 表示用のラベルだけ。正は `studio.routes.ts` の `BOOKING_TYPE_LABELS`
// （`StudioBookingDialog` の bookingTypeOptions と一致させる決めごと）— ここは
// カレンダー側の分類そのものを持たず、見出しの読みやすさのためだけの写し
const BOOKING_TYPE_LABELS: Record<string, string> = {
  performance: "本番", rehearsal: "リハーサル", hold: "仮押さえ", tour: "内覧",
  consultation: "相談", setup: "設営/準備", maintenance: "メンテナンス",
  internal: "社内利用", other: "その他",
};

function bookingHeading(b: scheduleApi.BookingSuggestion, scheduleProjectId: string | null): string {
  const type = BOOKING_TYPE_LABELS[b.booking_type] ?? b.booking_type;
  const parts = [`${b.title || "（無題）"}（${type}）`];
  if (b.status === "tentative") parts.push("仮");
  if (b.possible_duplicate) parts.push("重複疑い");
  if (b.project_id && b.project_id !== scheduleProjectId) {
    parts.push(b.gls_number ? `他案件: ${b.gls_number} ${b.project_name ?? ""}`.trim() : `他案件: ${b.project_name ?? "不明"}`);
  }
  return parts.join(" ・ ");
}

export default function BookingColumnsDialog({
  open, onOpenChange, scheduleId, scheduleLocationId, scheduleProjectId, columns, onCreated,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setSelected([]); }, [open]);

  const suggestionsQuery = useQuery({
    queryKey: ["schedule-booking-suggestions", scheduleId],
    queryFn: () => scheduleApi.listBookingSuggestions(scheduleId),
    enabled: open,
    staleTime: 60 * 1000,
  });
  const bookings = suggestionsQuery.data ?? [];
  const linkedRoomIds = new Set(columns.map((c) => c.room_id).filter((id): id is string => !!id));

  // 選んだ部屋 id → 部屋の実体（色・拠点）。同じ部屋が複数の予約に出ても1件に畳む
  const roomsById = new Map<string, { id: string; name: string; color: string | null; locationId: string | null }>();
  for (const b of bookings) {
    for (const r of b.rooms) {
      if (!roomsById.has(r.room_id)) {
        roomsById.set(r.room_id, { id: r.room_id, name: r.room_name, color: r.room_color, locationId: r.location_id });
      }
    }
  }

  const create = async () => {
    const chosen = selected.map((id) => roomsById.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
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
      const locationIds = new Set(chosen.map((r) => r.locationId).filter((id): id is string => !!id));
      if (!scheduleLocationId && locationIds.size === 1) {
        // 拠点は表の設定でいつでも直せる。ここでは「まだ決めていない」ときだけ埋める（VenueColumnsDialog と同じ判断）
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
      title="予約から列を入れる"
      sub="この日の予約から部屋を選ぶと、1部屋が1列になります。仮押さえの部屋も出します——列に入れるかは選んでください。"
      size="md"
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={busy}>閉じる</Button>
          <Button type="button" className="min-h-tap" onClick={() => void create()} disabled={busy || selected.length === 0}>
            {selected.length > 0 ? `列を作成（${selected.length}）` : "列を作成"}
          </Button>
        </FormDialogFooter>
      }
    >
      {suggestionsQuery.isLoading && <p className="text-sub text-muted-foreground">読み込み中…</p>}
      {!suggestionsQuery.isLoading && bookings.every((b) => b.rooms.length === 0) && (
        <EmptyState title="この日に部屋の予約がありません" description="部屋を選んで列を作成するには「会場を選んで列を作成」を使ってください。" />
      )}
      <div className="space-y-4">
        {bookings.filter((b) => b.rooms.length > 0).map((b) => (
          <div key={b.id}>
            <p className="mb-1 text-list text-foreground">{bookingHeading(b, scheduleProjectId)}</p>
            <ToggleButtonGroup
              options={b.rooms.map((r) => ({
                value: r.room_id,
                label: [r.location_abbreviation, r.room_name].filter(Boolean).join(" "),
                description: linkedRoomIds.has(r.room_id) ? "すでに列があります" : undefined,
                disabled: linkedRoomIds.has(r.room_id),
                color: cssColor(r.room_color) ?? undefined,
                leftSlot: <span className="inline-block h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: cssColor(r.room_color) ?? undefined }} aria-hidden="true" />,
              }))}
              value={selected}
              onChange={setSelected}
              multi
              cols={{ base: 1, sm: 2 }}
              size="sm"
              ariaLabel={`${b.title || "予約"} の部屋`}
            />
          </div>
        ))}
      </div>
    </FormDialog>
  );
}
