/**
 * ① 予定・スマホ / 週の1段（幅が狭いと「日」しか見られない、というご指摘への対応）
 *
 * スマホは月表＋選んだ日のアジェンダに固定していて、月をまたがず1週間だけを
 * 見る手段が無かった。`MobileMonthGrid.tsx` と同じ「数字＋点だけ」の日マスを、
 * 選んだ週の7日ぶんだけ横1列に大きく出す（月表と役割は同じ — 選んだ日の
 * 中身は下のアジェンダで読む）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { eventsOn, sortForList, type CalEvent } from './calendarLayout';
import type { Holiday } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function MobileWeekStrip({
  days, today, selected, events, holidays, onPickDay,
}: {
  /** 出す7日。`weekDays()` の戻り値をそのまま渡す */
  days: string[];
  today: string;
  selected: string;
  events: CalEvent[];
  holidays: Map<string, Holiday>;
  onPickDay: (day: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-0.5 px-1.5 pb-1">
      {days.map((day) => {
        const hol = holidays.get(day);
        const dow = new Date(`${day}T00:00:00`).getDay();
        const isToday = day === today;
        const isSelected = day === selected;
        const dots = sortForList(eventsOn(events, day)).slice(0, 4);
        return (
          <button
            key={day}
            type="button"
            onClick={() => onPickDay(day)}
            aria-label={`${day} を選ぶ`}
            className="min-h-tap flex flex-col items-center gap-1 py-1"
          >
            <span
              className={cn(
                'text-th',
                dow === 0 || hol ? 'text-destructive' : dow === 6 ? 'text-info' : 'text-muted-foreground',
              )}
            >
              {DOW[dow]}
            </span>
            <span
              className={cn(
                'font-number flex h-[34px] w-[34px] items-center justify-center rounded-chip text-[15.5px] font-extrabold',
                isToday && 'bg-primary text-primary-foreground',
                !isToday && isSelected && 'bg-primary-surface',
                !isToday && (hol || dow === 0) && 'text-destructive',
                !isToday && dow === 6 && !hol && 'text-info',
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
  );
}
