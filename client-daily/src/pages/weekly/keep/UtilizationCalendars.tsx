/**
 * 隔週キープの数字 — スタジオ稼働カレンダー（当月・翌月）
 *
 * 9/4 の資料は ONAiR のカレンダーのスクリーンショットだった。ここはパックの
 * `calendars[]`（日 → 予定の種類と短い名前）をそのまま月の升目に置く。
 * **赤い枠は本番のある日**。稼働率の数え方は `docs/design/v4/keep-report.md` §5.4。
 *
 * 種類の色は状態の色に寄せる: 本番＝赤（destructive）・リハ＝橙（warning）・
 * 仮押さえ＝主色の淡い面・メンテ＝灰・内覧＝AI と同じ紫の面（「特別」の系統）。
 */
import { CalendarDays } from 'lucide-react';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import type { UtilizationCalendar } from '@gmo-onair/shared/src/keepReport/types';
import { LegendItem, SectionHead } from './SectionHead';
import { pctLabel, ymLabel } from './format';

const KIND_STYLE: Record<string, string> = {
  performance: 'bg-destructive text-destructive-foreground',
  rehearsal: 'bg-warning text-warning-foreground',
  hold: 'bg-primary-surface text-primary',
  maintenance: 'bg-muted text-muted-foreground',
  tour: 'bg-ai-surface text-ai',
};
const DEFAULT_KIND = 'bg-primary-surface-weak text-primary';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const DOW_TONE = ['text-destructive', '', '', '', '', '', 'text-primary'];

/** 'YYYY-MM' の升目（先頭の空きと日数）。日曜始まり */
function cellsOf(ym: string): Array<number | null> {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const lead = Number.isNaN(first.getTime()) ? 0 : first.getDay();
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)];
}

function MonthGrid({ cal }: { cal: UtilizationCalendar }) {
  const cells = cellsOf(cal.year_month);
  return (
    <div className="min-w-0 rounded-card border border-border bg-card p-4">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-cardtitle">{ymLabel(cal.year_month)}</span>
        <span className="text-sub text-muted-foreground">稼働率</span>
        <StatValue size="sm">{pctLabel(cal.utilization)}</StatValue>
        {cal.counted_kinds.length > 0 && (
          <span className="text-sub-sm ml-auto hidden truncate text-muted-foreground xl:inline">
            数える種類: {cal.counted_kinds.length}
          </span>
        )}
      </div>
      <div className="grid grid-cols-7 gap-0.5 rounded-control-lg border border-border p-1.5">
        {DOW.map((d, i) => (
          <div key={d} className={`text-sub-sm text-center font-bold ${DOW_TONE[i] || 'text-muted-foreground'}`}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} className="min-h-[52px] rounded-badge-xs bg-surface-subtle" />;
          // 鍵は「日」。'5' / '05' / 'YYYY-MM-05' のどれで来ても読む
          const dd = String(day).padStart(2, '0');
          const items = cal.days[String(day)] ?? cal.days[dd] ?? cal.days[`${cal.year_month}-${dd}`] ?? [];
          const hasPerformance = items.some((it) => it.kind === 'performance');
          const shown = items.slice(0, 3);
          return (
            <div
              key={day}
              className={`flex min-h-[52px] min-w-0 flex-col gap-0.5 rounded-badge-xs border px-1 py-0.5 ${
                hasPerformance ? 'border-destructive' : 'border-transparent'
              }`}
            >
              <span className="font-number text-sub-sm leading-tight text-muted-foreground">{day}</span>
              {shown.map((it, j) => (
                <span
                  key={j}
                  title={it.label}
                  className={`text-badge block truncate rounded-badge-xs px-1 leading-4 ${KIND_STYLE[it.kind] ?? DEFAULT_KIND}`}
                >
                  {it.label}
                </span>
              ))}
              {items.length > shown.length && (
                <span className="text-badge text-muted-foreground">+{items.length - shown.length}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UtilizationCalendars({ calendars }: { calendars: UtilizationCalendar[] }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionHead
        icon={CalendarDays}
        title="スタジオ稼働カレンダー"
        note="カレンダーアプリの予定をそのまま。赤枠は本番日"
        right={(
          <>
            <LegendItem swatch="bg-destructive" label="本番" />
            <LegendItem swatch="bg-warning" label="リハ" />
            <LegendItem swatch="bg-primary-surface" label="仮" />
            <LegendItem swatch="bg-muted" label="メンテ" />
            <LegendItem swatch="bg-ai-surface" label="内覧" />
          </>
        )}
      />
      {calendars.length === 0 ? (
        <p className="text-sub text-muted-foreground">カレンダーに載せる月がまだありません</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {calendars.slice(0, 2).map((cal) => <MonthGrid key={cal.year_month} cal={cal} />)}
        </div>
      )}
    </div>
  );
}
