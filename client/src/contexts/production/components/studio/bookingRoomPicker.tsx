/**
 * スタジオ予約ダイアログの「スタジオ・部屋」欄
 *
 * 拠点ごとに部屋のチップを並べて選ばせ、最後に外現場（自由入力＋履歴の候補）を置く。
 * **部屋を1つも選ばない予約もある**（外現場だけ・打合せだけ）ので、
 * ここは必須欄ではない。
 *
 * 本体（`StudioBookingDialog.tsx`）から切り出したのは、1ファイル400行の決めごとに
 * 対して本体が 750 行を超えており、この欄がその中で一番まとまった単位だったため。
 */
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';

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

export function BookingRoomPicker({
  roomLocations, selectedRoomIds, setSelectedRoomIds, toggleRoom,
  locationNote, setLocationNote, onLocationNoteChange, onLocationNoteFocus, locationInputRef,
  showSuggestions, setShowSuggestions, suggestions, suggestionsRef,
}: {
  roomLocations: StudioLocation[];
  selectedRoomIds: Set<string>;
  setSelectedRoomIds: Dispatch<SetStateAction<Set<string>>>;
  toggleRoom: (roomId: string) => void;
  locationNote: string;
  setLocationNote: (value: string) => void;
  onLocationNoteChange: (value: string) => void;
  onLocationNoteFocus: () => void;
  locationInputRef: RefObject<HTMLInputElement>;
  showSuggestions: boolean;
  setShowSuggestions: (open: boolean) => void;
  suggestions: string[];
  suggestionsRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div className="lg:col-span-2">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">スタジオ・部屋</p>
        <div className="flex gap-3">
          {/* `v4-tap` は**見た目を変えずに当たり判定だけ 44px** にする
              （文字を大きくすると見出しの行が主役になってしまう） */}
          <button
            type="button"
            className="v4-tap text-[12px] text-primary"
            onClick={() => setSelectedRoomIds(new Set(roomLocations.flatMap((l) => l.rooms.map((r) => r.id))))}
          >
            全選択
          </button>
          <button
            type="button"
            className="v4-tap text-[12px] text-muted-foreground"
            onClick={() => setSelectedRoomIds(new Set())}
          >
            全解除
          </button>
        </div>
      </div>
      <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
        {roomLocations.map((loc) => {
          const locRoomIds = loc.rooms.map((r) => r.id);
          const allInLocationSelected =
            locRoomIds.length > 0 && locRoomIds.every((id) => selectedRoomIds.has(id));
          const toggleAllInLocation = () => {
            setSelectedRoomIds((prev) => {
              const next = new Set(prev);
              if (allInLocationSelected) {
                locRoomIds.forEach((id) => next.delete(id));
              } else {
                locRoomIds.forEach((id) => next.add(id));
              }
              return next;
            });
          };
          return (
            <div key={loc.id}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-medium text-muted-foreground">{loc.name}</p>
                {locRoomIds.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleAllInLocation}
                    className="v4-tap text-[11px] text-primary hover:underline"
                  >
                    {allInLocationSelected ? '全解除' : '全選択'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {loc.rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => toggleRoom(room.id)}
                    className={cn(
                      // スマホでは 44px（`min-h-tap`）・PC は今までどおり
                      'min-h-tap lg:min-h-0 flex items-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all text-left',
                      selectedRoomIds.has(room.id)
                        ? 'text-white shadow-sm'
                        : 'bg-background/80 border border-border',
                    )}
                    style={selectedRoomIds.has(room.id) ? { backgroundColor: room.color } : undefined}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: room.color }} />
                    <span className="whitespace-normal break-words leading-snug">{room.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {/* 外現場 */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin className="h-3 w-3 text-muted-foreground" />
            <p className="text-[11px] font-medium text-muted-foreground">外現場</p>
          </div>
          <div className="relative">
            <input
              ref={locationInputRef}
              type="text"
              value={locationNote}
              onChange={(e) => onLocationNoteChange(e.target.value)}
              onFocus={onLocationNoteFocus}
              placeholder="場所を入力（例：富士山麓ロケーション）"
              autoComplete="off"
              className="w-full px-3 py-2.5 rounded-lg border bg-background/80 outline-none placeholder:text-muted-foreground/40"
              // 16px 未満だと iOS が入力欄に寄って拡大する
              style={{ fontSize: '16px' }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border bg-popover shadow-lg overflow-hidden"
              >
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                    // `mousedown` を止めないと、押した瞬間に入力欄から focus が外れて
                    // 候補が閉じ、`click` が届かない
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setLocationNote(s); setShowSuggestions(false); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
