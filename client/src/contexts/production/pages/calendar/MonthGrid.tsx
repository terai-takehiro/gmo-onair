/**
 * ① 予定 / 月表（モックの1枚目）
 *
 * マスは **1日ぶん112px**、中の帯は 17px で「3px の色棒 + 時刻 + 題名」。
 * 3件を超えたら「他 N 件」を出し、**マスを押すと日表へ**移ります
 * （マスの中で無理に全部出すと、その週だけ高さが伸びて表が波打ちます）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { monthWeeks, eventsOn, sortForList, type CalEvent } from './calendarLayout';
import type { Holiday } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function MonthGrid({
  anchor, today, selected, events, holidays, onPickDay, onOpen,
}: {
  /** 見ている月の1日 */
  anchor: string;
  today: string;
  /**
   * 選んでいる日（PC①予定・macOS 風に作り直した回で追加）。
   * 押しても画面は動かない — 「予定を入れる」の既定日として使う。
   * 渡さなければ枠を出さない（旧スタジオ・パートナー・マイの3画面は選択の概念を持たない）
   */
  selected?: string;
  events: CalEvent[];
  holidays: Map<string, Holiday>;
  onPickDay: (day: string) => void;
  onOpen: (e: CalEvent) => void;
}) {
  const weeks = monthWeeks(anchor);
  const month = anchor.slice(0, 7);

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex">
        {DOW.map((d, i) => (
          <span
            key={d}
            className={cn(
              'text-th flex-1 border-b border-border-faint bg-surface-subtle py-2 text-center',
              i === 0 ? 'text-destructive' : i === 6 ? 'text-info' : 'text-muted-foreground',
            )}
          >
            {d}
          </span>
        ))}
      </div>

      {weeks.map((week) => (
        <div key={week[0]} className="flex border-b border-border-faint last:border-b-0">
          {week.map((day) => {
            const inMonth = day.slice(0, 7) === month;
            const hol = holidays.get(day);
            const dow = DOW[new Date(`${day}T00:00:00`).getDay()];
            const rows = sortForList(eventsOn(events, day));
            const isToday = day === today;
            const isSelected = selected != null && day === selected;
            return (
              <button
                key={day}
                type="button"
                onClick={() => onPickDay(day)}
                aria-label={`${day} を開く`}
                className={cn(
                  // **高さを固定する。** 件数で伸ばすと週ごとに段が変わって、
                  // 同じ曜日が縦に並ばなくなる
                  'flex h-[112px] min-w-0 flex-1 flex-col gap-[3px] border-r border-border-faint p-1.5 text-left last:border-r-0',
                  !inMonth && 'bg-surface-subtle',
                  inMonth && (hol || dow === '日') && 'bg-destructive-surface',
                  inMonth && dow === '土' && !hol && 'bg-info-surface',
                  // 今日は塗りの丸で示すので、選択の枠は今日以外にだけ付ける（二重に強調しない）
                  isSelected && !isToday && 'ring-2 ring-inset ring-primary',
                )}
              >
                <span className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'font-number text-note inline-flex h-5 min-w-[20px] items-center justify-center rounded-chip px-1 font-bold',
                      isToday && 'bg-primary text-primary-foreground',
                      !isToday && !inMonth && 'text-fg-disabled',
                      !isToday && inMonth && (hol || dow === '日') && 'text-destructive',
                      !isToday && inMonth && dow === '土' && !hol && 'text-info',
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {hol && (
                    <span className="text-sub-sm min-w-0 truncate text-destructive">
                      {hol.name}{hol.estimated && '（予測）'}
                    </span>
                  )}
                </span>

                {rows.slice(0, 3).map((e) => (
                  <span
                    key={e.key}
                    role="button"
                    tabIndex={0}
                    onClick={(x) => { x.stopPropagation(); onOpen(e); }}
                    onKeyDown={(x) => { if (x.key === 'Enter') { x.stopPropagation(); onOpen(e); } }}
                    className={cn(
                      'rounded-badge-xs flex h-[17px] shrink-0 items-center gap-1 overflow-hidden px-1',
                      e.tentative ? 'border border-dashed' : 'border border-transparent',
                    )}
                    style={{
                      backgroundColor: `${e.color}1a`,
                      borderColor: e.tentative ? e.color : undefined,
                    }}
                  >
                    <span className="h-[11px] w-[3px] shrink-0 rounded-badge-xs" style={{ backgroundColor: e.color }} />
                    <span className="font-number text-badge shrink-0 font-bold text-secondary-foreground">
                      {e.allDay ? '終日' : e.start.slice(11, 16)}
                    </span>
                    <span className="text-badge min-w-0 truncate text-secondary-foreground">{e.title}</span>
                  </span>
                ))}

                {rows.length > 3 && (
                  <span className="text-sub-sm shrink-0 text-muted-foreground">他 {rows.length - 3} 件</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
