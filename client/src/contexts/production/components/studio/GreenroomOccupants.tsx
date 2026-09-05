/**
 * スタジオ予約ダイアログの「控室の利用者・用途」欄
 *
 * 控室（`room_type === 'greenroom'`）を選んだときだけ出る、部屋ごとの自由入力
 * （社外の出演者・「社長」等も入るため登録ユーザーへの参照にしない — `担当者`欄とは別物）。
 *
 * 本体（`StudioBookingDialog.tsx`）から切り出したのは、1ファイル400行の決めごとに
 * 対して本体がすでに超過しており、担当者欄を足すぶんの行数をここで相殺するため
 * （`bookingRoomPicker.tsx` と同じ理由）。
 */
import { User } from "lucide-react";

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

export function GreenroomOccupants({
  roomLocations, selectedRoomIds, roomDetails, setRoomDetails,
}: {
  roomLocations: StudioLocation[];
  selectedRoomIds: Set<string>;
  roomDetails: Record<string, { occupant: string; usage_note: string }>;
  setRoomDetails: React.Dispatch<React.SetStateAction<Record<string, { occupant: string; usage_note: string }>>>;
}) {
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
}
