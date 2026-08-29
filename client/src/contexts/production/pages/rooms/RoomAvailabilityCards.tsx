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
import { DAY_START_H, DAY_END_H, laneBlocks, type AvailLane, type AvailBooking, type AvailRoom } from './availability';
import { OutsideChips } from './OutsideChips';

interface LocationGroup { id: string; name: string; rooms: AvailRoom[] }

/** 帯1段ぶんの高さ（px）。**段数 × これがカードの帯の高さ**（重なりは段で分ける） */
const ROW_H = 44;

export function RoomAvailabilityCards({ groups, evs, day, onOpen }: {
  groups: LocationGroup[];
  evs: AvailBooking[];
  /** **見ている日を渡す。** 渡さないと日をまたぐ予約を置き違える（PC 版と同じ理由） */
  day: string;
  /** 帯をタップしたとき。**スマホは `title` が効かない**ので、これが中身を読む唯一の手段 */
  onOpen: (id: string) => void;
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
            <RoomCard key={r.id} room={r} lane={laneBlocks(evs, r.id, day)} hours={hours} onOpen={onOpen} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RoomCard({ room, lane, hours, onOpen }: {
  room: AvailRoom;
  lane: AvailLane;
  hours: number[];
  onOpen: (id: string) => void;
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

      {/* **重なった予約は段を分ける**（`laneBlocks` の `row`/`rows`）。1本の帯に重ねると
          下になった予約は文字が重畳して両方読めず、存在にも気づけない */}
      <span
        className="rounded-note relative block overflow-hidden bg-surface-subtle"
        style={{ height: lane.rows * ROW_H }}
      >
        {hours.map((h) => (
          <span
            key={h}
            className="absolute bottom-0 top-0 border-l border-border-faint"
            style={{ left: `${((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        {lane.blocks.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            className={cn(
              'rounded-note absolute flex items-center overflow-hidden px-1.5 text-left',
              // 仮押さえは破線。確定と同じ見た目にすると、押さえただけの枠を「決まっている」と読んでしまう
              b.tentative && 'border border-dashed',
              !b.tentative && 'border',
            )}
            style={{
              left: b.left,
              width: b.width,
              top: b.row * ROW_H + 4,
              height: ROW_H - 8,
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
          </button>
        ))}
        <OutsideChips lane={lane} onOpen={onOpen} />
      </span>

      {/* 短い帯は文字が入らないので、**カードの下に時刻＋題名を1行ずつ**添える
          （タップで詳細が開くが、開かずに読めることが要る） */}
      {lane.blocks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {lane.blocks.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onOpen(b.id)}
                className="min-h-tap flex w-full items-center gap-1.5 text-left"
              >
                <span className="h-3 w-[3px] shrink-0 rounded-badge-xs" style={{ background: b.color }} aria-hidden="true" />
                <span className="font-number text-sub shrink-0 font-bold" style={{ color: b.textColor }}>{b.timeLabel}</span>
                <span className="text-sub min-w-0 flex-1 truncate">{b.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {lane.blocks.length === 0 && lane.before.length === 0 && lane.after.length === 0 && (
        <p className="text-note text-muted-foreground">この日は空いています。</p>
      )}
    </div>
  );
}
