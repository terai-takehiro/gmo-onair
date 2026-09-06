/**
 * 稼働カレンダー（当月・翌月）— 予定の種類ごとの色と稼働率
 *
 * 資料の「ONAiR のカレンダーのスクリーンショット」を、ONAiR が組む絵に置き換えるもの。
 * 同じ日に複数の予定があっても1日と数える（`docs/design/v4/keep-report.md` §5.4）。
 */
import type { CSSProperties } from 'react';
import type { UtilizationCalendar } from '@gmo-onair/shared/src/keepReport/types';
import { C, num } from './slideStyle';

interface Box { w: number; h: number }

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export const KIND_LABEL: Record<string, string> = {
  performance: '本番', rehearsal: 'リハ', hold: '仮', maintenance: 'メンテ', tour: '内覧',
  setup: '設営', internal: '社内', consultation: '相談', other: 'その他',
};

const colorOf = (kind: string) => C.cal[kind] ?? C.cal.other;

export function CalendarPart({ calendar, box }: { calendar: UtilizationCalendar; box: Box }) {
  const [ys, ms] = calendar.year_month.split('-');
  const year = Number(ys);
  const month = Number(ms);
  const first = new Date(year, month - 1, 1);
  const offset = first.getDay();
  const days = new Date(year, month, 0).getDate();
  const rows = Math.ceil((offset + days) / 7);
  const headerH = 30;
  const wdH = 20;
  const legendH = 22;
  const cellH = Math.max(18, (box.h - headerH - wdH - legendH) / rows);
  const cellW = box.w / 7;
  const maxEntries = Math.max(1, Math.floor((cellH - 18) / 14));
  const util = calendar.utilization === null ? '—' : `${calendar.utilization.toFixed(1)}%`;
  const counted = calendar.counted_kinds.length ? calendar.counted_kinds : Object.keys(KIND_LABEL);

  const cell: CSSProperties = {
    boxSizing: 'border-box', border: `1px solid ${C.softLine}`, padding: '2px 4px', height: cellH, overflow: 'hidden',
    fontSize: 11, lineHeight: '14px', verticalAlign: 'top',
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: headerH, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
        <span style={{ fontSize: 20, color: C.title }}>{year}年{month}月</span>
        <span style={{ fontSize: 16 }}>稼働率 <span style={{ ...num, fontSize: 20, color: C.negative }}>{util}</span></span>
      </div>
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {WD.map((w, i) => (
              <th key={w} style={{ height: wdH, fontSize: 11, fontWeight: 700, color: i === 0 ? C.negative : i === 6 ? C.positive : C.muted, border: `1px solid ${C.softLine}`, background: C.soft }}>
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: 7 }).map((__, c) => {
                const day = r * 7 + c - offset + 1;
                if (day < 1 || day > days) return <td key={c} style={{ ...cell, background: C.soft }} />;
                const key = `${calendar.year_month}-${String(day).padStart(2, '0')}`;
                const entries = calendar.days[key] ?? calendar.days[String(day)] ?? [];
                const active = entries.some((e) => counted.includes(e.kind));
                return (
                  <td key={c} style={{ ...cell, width: cellW, background: active ? '#f4faff' : undefined }}>
                    <div style={{ fontWeight: 700, color: c === 0 ? C.negative : c === 6 ? C.positive : C.text, ...num, textAlign: 'left' }}>{day}</div>
                    {entries.slice(0, maxEntries).map((e, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: colorOf(e.kind), flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label || KIND_LABEL[e.kind] || e.kind}</span>
                      </div>
                    ))}
                    {entries.length > maxEntries && <div style={{ color: C.muted }}>+{entries.length - maxEntries}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ height: legendH, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: C.muted, overflow: 'hidden' }}>
        {Object.keys(KIND_LABEL).filter((k) => k !== 'other').map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(k) }} />
            {KIND_LABEL[k]}{counted.includes(k) ? '' : '（数えない）'}
          </span>
        ))}
      </div>
    </div>
  );
}
