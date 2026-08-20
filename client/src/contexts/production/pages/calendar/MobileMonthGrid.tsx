/**
 * ① 予定・スマホ / 月表（iPhone のカレンダーに寄せたモック）
 *
 * PC の月表（`MonthGrid.tsx`）は1マス112pxに時刻・題名まで入れているが、
 * 375px でそのまま縮めると文字が読めなくなる。ここは**数字と点だけ**にして、
 * 選んだ日の中身は下のアジェンダで読む（承認済みモックの形）。
 *
 * **他の月の日を押しても月をまたげる**（モックの `pick` と同じ）。
 * 月末・月初の薄い日を押したのに何も起きないと「押せない飾り」に見える。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { monthWeeks, eventsOn, sortForList, type CalEvent } from './calendarLayout';
import type { Holiday } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function MobileMonthGrid({
  anchor, today, selected, events, holidays, onPickDay,
}: {
  /** 見ている月の1日 */
  anchor: string;
  today: string;
  selected: string;
  events: CalEvent[];
  holidays: Map<string, Holiday>;
  onPickDay: (day: string) => void;
}) {
  const weeks = monthWeeks(anchor);
  const month = anchor.slice(0, 7);

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 px-1.5">
        {DOW.map((d, i) => (
          <span
            key={d}
            className={cn(
              'text-th py-1 text-center',
              i === 0 ? 'text-destructive' : i === 6 ? 'text-info' : 'text-muted-foreground',
            )}
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 px-1.5 pb-1">
        {weeks.flat().map((day) => {
          const inMonth = day.slice(0, 7) === month;
          const hol = holidays.get(day);
          const dow = DOW[new Date(`${day}T00:00:00`).getDay()];
          const isToday = day === today;
          const isSelected = day === selected;
          const dots = sortForList(eventsOn(events, day)).slice(0, 4);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              aria-label={`${day} を選ぶ`}
              className={cn('flex min-h-[46px] flex-col items-center gap-[3px] py-0.5', !inMonth && 'opacity-30')}
            >
              <span
                className={cn(
                  'font-number flex h-[30px] w-[30px] items-center justify-center rounded-chip text-[14.5px] font-extrabold',
                  isToday && 'bg-primary text-primary-foreground',
                  !isToday && isSelected && 'bg-primary-surface',
                  !isToday && inMonth && (hol || dow === '日') && 'text-destructive',
                  !isToday && inMonth && dow === '土' && !hol && 'text-info',
                )}
              >
                {Number(day.slice(8))}
              </span>
              <span className="flex h-[5px] items-center gap-[2.5px]">
                {dots.map((e) => (
                  <span key={e.key} className="h-[5px] w-[5px] shrink-0 rounded-chip" style={{ backgroundColor: e.color }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
