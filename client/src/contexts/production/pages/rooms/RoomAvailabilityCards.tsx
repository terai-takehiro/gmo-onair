/**
 * ② 部屋の空き（スマホ）— 選んだ日の「部屋ごとの空き帯」をカードで縦に積む
 *
 * PC 版（`RoomAvailabilityPage.tsx` の表）と**帯の計算はまったく同じ**
 * （`availability.ts` の `laneBlocks`）— 表の行をカードに組み替えただけで、
 * 「横の余白＝空き」「終日は斜線」「仮押さえは破線」の決めごとは1つも変えていない。
 *
 * 時刻の目盛りは行ごとではなく**この一覧の先頭に1回だけ**出す
 * （カードごとに出すと 375px で文字が窮屈になり、同じ数字が何度も並ぶ）。
 * カードの帯は目盛りと同じ左右の余白（`px-3`）で揃えてあるので、位置がずれない。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { DAY_START_H, DAY_END_H, laneBlocks, type AvailBlock, type AvailBooking, type AvailRoom } from './availability';

interface LocationGroup { id: string; name: string; rooms: AvailRoom[] }

export function RoomAvailabilityCards({ groups, evs, day }: {
  groups: LocationGroup[];
  evs: AvailBooking[];
  /** **見ている日を渡す。** 渡さないと日をまたぐ予約を置き違える（PC 版と同じ理由） */
  day: string;
}) {
  const hours = Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => DAY_START_H + i);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-4 px-3" aria-hidden="true">
        {hours.filter((h) => h % 2 === 0).map((h) => (
          <span
            key={h}
            className="font-number text-note absolute top-0 text-muted-foreground"
            style={{ left: `${((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100}%` }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-2">
          <h3 className="text-th px-1 text-muted-foreground">{g.name}</h3>
          {g.rooms.map((r) => (
            <RoomCard key={r.id} room={r} blocks={laneBlocks(evs, r.id, day)} hours={hours} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RoomCard({ room, blocks, hours }: {
  room: AvailRoom;
  blocks: AvailBlock[];
  hours: number[];
}) {
  return (
    <div className="rounded-card flex flex-col gap-2 border border-border bg-card p-3">
      <span className="text-list flex items-center gap-1.5 font-bold">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: room.color || '#94a3b8' }}
          aria-hidden="true"
        />
        <span className="min-w-0 truncate">{room.abbreviation || room.name}</span>
      </span>

      <span className="rounded-note relative block h-11 overflow-hidden bg-surface-subtle">
        {hours.map((h) => (
          <span
            key={h}
            className="absolute bottom-0 top-0 border-l border-border-faint"
            style={{ left: `${((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        {blocks.map((b) => (
          <span
            key={b.id}
            className={cn(
              'rounded-note absolute inset-y-1 flex items-center overflow-hidden px-1.5',
              // 仮押さえは破線。確定と同じ見た目にすると、押さえただけの枠を「決まっている」と読んでしまう
              b.tentative && 'border border-dashed',
              !b.tentative && 'border',
            )}
            style={{
              left: b.left,
              width: b.width,
              borderColor: b.color,
              // 終日は斜線。時間帯の予約と同じ塗りだと「8:00〜22:00に何かある」と読み違える
              background: b.allDay
                ? `repeating-linear-gradient(45deg, ${b.color}22, ${b.color}22 4px, ${b.color}0d 4px, ${b.color}0d 8px)`
                : `${b.color}${b.tentative ? '14' : '1f'}`,
            }}
          >
            <span className="text-note truncate font-bold [overflow-wrap:anywhere]" style={{ color: b.textColor }}>
              <span className="font-number">{b.timeLabel}</span> {b.title}
            </span>
          </span>
        ))}
      </span>

      {blocks.length === 0 && (
        <p className="text-note text-muted-foreground">この日は空いています。</p>
      )}
    </div>
  );
}
