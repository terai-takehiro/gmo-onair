/**
 * ① 予定 / 月表（モックの1枚目）
 *
 * マスは **1日ぶん112px**、中の帯は 17px で「3px の色棒 + 時刻 + 題名」。
 * マスを押すと**選ぶだけ**（画面は動かさない・「日」表示は v4 に無い）。
 * 3件を超えたら「他 N 件」を出し、**そこだけは押すと週表へ切り替わる**
 * （v4.5.2 まで押しても何も起きず、4件目以降を開く手段が無かった）。
 * （マスの中で無理に全部出すと、その週だけ高さが伸びて表が波打ちます）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { monthWeeks, eventsOn, sortForList, type CalEvent } from './calendarLayout';
import type { Holiday } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function MonthGrid({
  anchor, today, selected, events, holidays, onPickDay, onOpen, onMore,
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
  /** 「他 N 件」を押したとき。渡さなければ日を選ぶだけ（マス押下と同じ）になる */
  onMore?: (day: string) => void;
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
              // **`<button>` ではなく `role="button"` の `<div>`。** 中に「他 N 件」や
              // イベント帯自身の役割つき要素（`role="button"`）を入れ子にするため —
              // `<button>` の中に対話的要素を入れるのは HTML の内容モデル違反で、
              // 支援技術の読み上げが崩れる（実際に踏んだ）。キーボードは Enter/Space の
              // 両方に自前で応答させる（`<div>` は既定で応答しない）
              <div
                key={day}
                role="button"
                tabIndex={0}
                onClick={() => onPickDay(day)}
                onKeyDown={(x) => { if (x.key === 'Enter' || x.key === ' ') { x.preventDefault(); onPickDay(day); } }}
                aria-label={`${day} を開く`}
                className={cn(
                  // **高さを固定する。** 件数で伸ばすと週ごとに段が変わって、
                  // 同じ曜日が縦に並ばなくなる
                  'flex h-[112px] min-w-0 flex-1 cursor-pointer flex-col gap-[3px] border-r border-border-faint p-1.5 text-left last:border-r-0',
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
                      // 月の外の日付は薄くするが、`fg-disabled` (#9aa1ab) は
                      // 「読ませる文字に使わない」決めごと (docs/v4-plan.md) なので
                      // 一段濃い `muted-foreground` に。地の色 (surface-subtle) との
                      // 組み合わせで月の中との見分けは保たれる
                      !isToday && !inMonth && 'text-muted-foreground',
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
                    onKeyDown={(x) => { if (x.key === 'Enter' || x.key === ' ') { x.preventDefault(); x.stopPropagation(); onOpen(e); } }}
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
                      {/* 複数日にまたがる予定は、初日以外のマスで開始時刻を出さない —
                          「20:00」とだけ出ると、その日の20時に始まるように読める */}
                      {e.allDay ? '終日' : e.start.slice(0, 10) === day ? e.start.slice(11, 16) : '→'}
                    </span>
                    <span className="text-badge min-w-0 truncate text-secondary-foreground">{e.title}</span>
                  </span>
                ))}

                {rows.length > 3 && (
                  // 押すと日を選んだうえで週表へ切り替える（月マスは3件までしか出せないため、
                  // 4件目以降を実際に開く唯一の導線）。`stopPropagation` が無いと親の
                  // onPickDay と二重に走る（実害は無いが、押した先が読みにくくなる）
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(x) => { x.stopPropagation(); onMore ? onMore(day) : onPickDay(day); }}
                    onKeyDown={(x) => {
                      if (x.key === 'Enter' || x.key === ' ') {
                        x.preventDefault(); x.stopPropagation();
                        onMore ? onMore(day) : onPickDay(day);
                      }
                    }}
                    className="text-sub-sm shrink-0 text-left font-bold text-primary underline-offset-2 hover:underline"
                  >
                    他 {rows.length - 3} 件
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
