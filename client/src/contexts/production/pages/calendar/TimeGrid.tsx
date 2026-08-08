/**
 * ① 予定 / 週表・日表（モックの2枚目・3枚目）
 *
 * **週と日は同じ部品。** 違うのは列の数（7 か 1）と札の字の大きさだけで、
 * 目盛り・終日の欄・重なりの割り方・「いま」の線はまったく同じです。
 * 2つ書くと、どちらかだけ直した日から**同じ予定が別の位置に出ます**。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  placeDay, hourMarks, nowTop, eventsOn, timeLabel,
  DAY_START_H, DAY_END_H, type CalEvent,
} from './calendarLayout';
import type { Holiday } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function TimeGrid({
  days, today, now, events, holidays, onOpen, onPickDay,
}: {
  /** 出す日。週表は7日、日表は1日 */
  days: string[];
  today: string;
  now: Date;
  events: CalEvent[];
  holidays: Map<string, Holiday>;
  onOpen: (e: CalEvent) => void;
  onPickDay: (day: string) => void;
}) {
  const wide = days.length === 1;
  const marks = hourMarks();
  const line = nowTop(now);

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      {/* 曜日と日付 */}
      <div className="flex border-b border-border-faint bg-surface-subtle">
        <span className="w-[56px] shrink-0" />
        {days.map((day) => {
          const dow = new Date(`${day}T00:00:00`).getDay();
          const hol = holidays.get(day);
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 border-l border-border-faint py-2"
            >
              <span
                className={cn('text-th', dow === 0 || hol ? 'text-destructive' : dow === 6 ? 'text-info' : 'text-muted-foreground')}
              >
                {DOW[dow]}
              </span>
              <span
                className={cn(
                  'font-number text-sub inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-chip px-1.5 font-bold',
                  isToday && 'bg-primary text-primary-foreground',
                )}
              >
                {Number(day.slice(8))}
              </span>
              {hol && <span className="text-sub-sm min-w-0 truncate text-destructive">{hol.name}</span>}
            </button>
          );
        })}
      </div>

      {/* 終日。**時間の帯にしない** — 幅を持たないので、横一杯にすると丸1日埋まって見える */}
      <div className="flex min-h-[30px] border-b border-border-faint">
        <span className="text-sub-sm flex w-[56px] shrink-0 items-center justify-end pr-2 text-muted-foreground">終日</span>
        {days.map((day) => (
          <span key={day} className="flex min-w-0 flex-1 flex-col gap-[3px] border-l border-border-faint p-1">
            {eventsOn(events, day).filter((e) => e.allDay).map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => onOpen(e)}
                className="rounded-badge flex h-[19px] items-center gap-1.5 overflow-hidden px-1.5"
                style={{ backgroundColor: `${e.color}1a` }}
              >
                <span className="h-3 w-[3px] shrink-0 rounded-badge-xs" style={{ backgroundColor: e.color }} />
                <span className="text-badge min-w-0 truncate text-secondary-foreground">{e.title}</span>
              </button>
            ))}
          </span>
        ))}
      </div>

      {/* 目盛りと札 */}
      <div className="flex h-[616px]">
        <div className="relative w-[56px] shrink-0">
          {marks.map((h) => (
            <span
              key={h.label}
              className="font-number text-sub-sm absolute right-2 -translate-y-1.5 text-muted-foreground"
              style={{ top: `${h.top}%` }}
            >
              {h.label}
            </span>
          ))}
        </div>
        {days.map((day) => {
          const placed = placeDay(eventsOn(events, day), day);
          return (
            <div key={day} className="relative min-w-0 flex-1 border-l border-border-faint">
              {/* 1時間ごとの薄い線。**時刻の目盛りと同じ位置**に置く（別に計算しない） */}
              {marks.slice(1, -1).map((h) => (
                <span key={h.label} className="absolute inset-x-0 border-t border-border-faint" style={{ top: `${h.top}%` }} />
              ))}
              {placed.map((p) => (
                <button
                  key={p.ev.key}
                  type="button"
                  onClick={() => onOpen(p.ev)}
                  className={cn(
                    'v4-card absolute flex flex-col gap-px overflow-hidden rounded-note border-l-[3px] px-1.5 py-1 text-left',
                    p.ev.tentative && 'border-y border-r border-dashed',
                  )}
                  style={{
                    top: `${p.top}%`,
                    height: `${p.height}%`,
                    left: `${p.left}%`,
                    width: `calc(${p.width}% - 2px)`,
                    borderLeftColor: p.ev.color,
                    borderTopColor: p.ev.tentative ? p.ev.color : undefined,
                    borderRightColor: p.ev.tentative ? p.ev.color : undefined,
                    borderBottomColor: p.ev.tentative ? p.ev.color : undefined,
                    backgroundColor: `${p.ev.color}14`,
                  }}
                >
                  <span
                    className={cn('font-number truncate font-bold', wide ? 'text-sub' : 'text-badge')}
                    style={{ color: p.ev.color }}
                  >
                    {/* 表示の外から続いていることを出す。切れているのに何も無いと「10:00 開始」と読まれる */}
                    {p.cutTop && '↑'}{timeLabel(p.ev)}{p.cutBottom && '↓'}
                  </span>
                  <span className={cn('truncate', wide ? 'text-list' : 'text-badge font-bold')}>{p.ev.title}</span>
                  {p.ev.sub && (
                    <span className={cn('truncate text-muted-foreground', wide ? 'text-sub-sm' : 'text-badge')}>
                      {p.ev.sub}
                    </span>
                  )}
                </button>
              ))}
              {day === today && line !== null && (
                <span className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-destructive" style={{ top: `${line}%` }}>
                  <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-chip bg-destructive" />
                  {wide && <span className="text-badge absolute right-2 -top-2 font-bold text-destructive">いま</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-2 text-muted-foreground">
        出しているのは <span className="font-number">{DAY_START_H}:00 – {DAY_END_H}:00</span> です。
        この外から続く予定は<strong className="font-bold">端で切って ↑↓ を付けて</strong>出します（消しません）。
      </p>
    </div>
  );
}
