/**
 * 部屋 × 時間の帯（PC）
 *
 * 縦が部屋・横が 8:00〜22:00 で、埋まっているところに帯を出す。
 * **横の余白がそのまま空き**なので、予約を1つでも描き落とすと
 * 「空いている」と読まれて二重に押さえられる — 描き分けの決めごとは各所のコメント。
 *
 * スマホは `RoomAvailabilityCards.tsx`（同じ `laneBlocks` を使う）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { OutsideChips } from './OutsideChips';
import { DAY_START_H, DAY_END_H, laneBlocks, type AvailBooking, type AvailRoom } from './availability';

/** 帯1段ぶんの高さ（px）。**段数 × これが部屋の行の高さ**（重なりは段で分ける） */
export const ROW_H = 36;

interface Group { id: string; name: string; rooms: AvailRoom[] }

/** 目盛り・罫線の横位置（%）。見出しと帯で必ず同じ式を使う（ずれると時刻を読み違える） */
const leftOf = (h: number) => `${((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100}%`;

export function RoomLaneGrid({ groups, evs, day, hours, onOpen }: {
  groups: Group[];
  evs: AvailBooking[];
  day: string;
  hours: number[];
  onOpen: (bookingId: string) => void;
}) {
  return (
    <div className="rounded-card overflow-x-auto border border-border bg-card">
      <div className="min-w-[820px]">
        {/* 時間の目盛り。**部屋名の幅と揃える**（ずれると帯の位置を読み違える） */}
        <div className="sticky top-0 z-[1] flex border-b border-border-faint bg-surface-subtle">
          <span className="w-[196px] shrink-0 px-3 py-2" />
          <span className="relative min-w-0 flex-1">
            {hours.map((h) => (
              <span
                key={h}
                className="font-number text-note absolute top-0 py-2 text-muted-foreground"
                style={{ left: leftOf(h) }}
              >
                {String(h).padStart(2, '0')}:00
              </span>
            ))}
            <span className="block py-2 opacity-0" aria-hidden="true">0</span>
          </span>
        </div>

        {groups.map((g) => (
          <div key={g.id}>
            <div className="bg-surface-subtle px-3 py-1.5">
              <span className="text-th text-muted-foreground">{g.name}</span>
            </div>
            {g.rooms.map((r) => (
              <RoomLane key={r.id} room={r} evs={evs} day={day} hours={hours} onOpen={onOpen} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function RoomLane({ room, evs, day, hours, onOpen }: {
  room: AvailRoom;
  evs: AvailBooking[];
  day: string;
  hours: number[];
  onOpen: (bookingId: string) => void;
}) {
  // **見ている日を渡す。** 渡さないと日をまたぐ予約を置き違える
  // （8/1 20:00〜8/2 10:00 が 8/2 の 20:00〜22:00 に出ていた）
  const lane = laneBlocks(evs, room.id, day);
  return (
    <div className="flex border-b border-border-faint last:border-b-0">
      <span className="w-[196px] shrink-0 px-3 py-2.5">
        <span className="text-sub flex items-center gap-1.5 font-bold">
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: room.color || '#94a3b8' }} aria-hidden="true" />
          <span className="min-w-0 truncate">{room.abbreviation || room.name}</span>
        </span>
      </span>

      <span className="relative min-w-0 flex-1 py-2">
        {hours.map((h) => (
          <span
            key={h}
            className="absolute bottom-0 top-0 border-l border-border-faint"
            style={{ left: leftOf(h) }}
            aria-hidden="true"
          />
        ))}
        {/* **重なった予約は段を分ける**（`laneBlocks` の `row`/`rows`）。
            1本のレーンに重ねて描くと、下になった帯は文字が重畳して
            両方読めず、存在にも気づけない */}
        <span className="relative block" style={{ height: lane.rows * ROW_H }}>
          {lane.blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onOpen(b.id)}
              title={`${b.timeLabel} ${b.title}`}
              className={cn(
                'rounded-note absolute flex items-center overflow-hidden px-1.5 text-left',
                // 仮押さえは**破線**。確定と同じ見た目にすると、
                // 押さえただけの枠を「決まっている」と読んでしまう
                b.tentative && 'border border-dashed',
                !b.tentative && 'border',
              )}
              style={{
                left: b.left,
                width: b.width,
                top: b.row * ROW_H + 1,
                height: ROW_H - 2,
                borderColor: b.color,
                // **終日は斜線。** 時間帯の予約と同じ塗りだと
                // 「8:00〜22:00 に何かある」と読み違える
                background: b.allDay
                  ? `repeating-linear-gradient(45deg, ${b.color}22, ${b.color}22 4px, ${b.color}0d 4px, ${b.color}0d 8px)`
                  : `${b.color}${b.tentative ? '14' : '1f'}`,
              }}
            >
              <span className="text-note truncate font-bold" style={{ color: b.textColor }}>
                <span className="font-number">{b.timeLabel}</span> {b.title}
              </span>
            </button>
          ))}
          <OutsideChips lane={lane} onOpen={onOpen} />
        </span>
      </span>
    </div>
  );
}
