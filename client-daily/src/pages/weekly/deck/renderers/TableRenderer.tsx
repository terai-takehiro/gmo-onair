/**
 * 表の部品 — 着地表／見込表・ヨミ表・進行表・売上／粗利・そのほかの表（資料の中の見た目）
 *
 * 文字の大きさは**枠の高さと行数から決める**（資料では表・一覧は中身が収まる大きさまで
 * 小さくしてよい。`docs/design/v4/keep-report.md` §6.3）。色は `slideStyle.ts` の1か所。
 */
import type { CSSProperties } from 'react';
import type { MonthlyPlTable, PipelineRow } from '@gmo-onair/shared/src/keepReport/types';
import { C, cellBase, headCell, num, tableBase } from './slideStyle';
import { thousands, yen } from './binding';

export interface Box { w: number; h: number }
export type Align = 'left' | 'right' | 'center';

/** 行数と枠の高さから、表が収まる文字の大きさ（px）を決める */
export function fontSizeFor(rows: number, boxH: number, max = 20, min = 10): number {
  const perRow = boxH / Math.max(1, rows + 1);
  return Math.max(min, Math.min(max, Math.floor(perRow / 1.95)));
}

const isNegative = (s: string) => /^[-−▲]\s*[\d,]/.test(s);

export interface SlideTableProps {
  head: string[];
  rows: string[][];
  box: Box;
  align?: Align[];
  /** 列幅（%）。省略すると均等 */
  widths?: number[];
  /** 数字の列。右にそろえ、マイナスを赤にする */
  numeric?: boolean[];
  /** 最後の行を見出しと同じ紺で塗る（営業利益の行） */
  lastRowHead?: boolean;
  /** 判定・比率の色（行ごと）。`true` = 青、`false` = 赤 */
  rowTone?: Array<boolean | null>;
  maxFont?: number;
  /** 上書きされた表は赤（変更点は赤字） */
  overrideRed?: boolean;
}

export function SlideTable({ head, rows, box, align, widths, numeric, lastRowHead, rowTone, maxFont = 20, overrideRed }: SlideTableProps) {
  const fontSize = fontSizeFor(rows.length, box.h, maxFont);
  const cols = Math.max(head.length, ...rows.map((r) => r.length));
  const colStyle = (i: number): CSSProperties => ({
    ...cellBase,
    textAlign: align?.[i] ?? (numeric?.[i] ? 'right' : 'left'),
    ...(numeric?.[i] ? num : {}),
    width: widths?.[i] !== undefined ? `${widths[i]}%` : undefined,
    ...(overrideRed ? { color: C.negative } : {}),
  });
  return (
    <table style={{ ...tableBase, fontSize }}>
      {head.some((h) => h) && (
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} style={{ ...headCell, width: widths?.[i] !== undefined ? `${widths[i]}%` : undefined }}>{head[i] ?? ''}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r, ri) => {
          const last = lastRowHead && ri === rows.length - 1;
          return (
            <tr key={ri} style={last ? { background: C.tableHead, color: '#fff' } : undefined}>
              {Array.from({ length: cols }).map((_, ci) => {
                const cell = r[ci] ?? '';
                const tone = rowTone?.[ri];
                const colored = !last && (numeric?.[ci] && isNegative(cell) ? C.negative : tone === true && ci >= 3 ? C.positive : tone === false && ci >= 3 ? C.negative : undefined);
                return (
                  <td key={ci} style={{ ...colStyle(ci), ...(colored ? { color: colored } : {}) }}>{cell}</td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 着地表／見込表（6行 × 目標／着地／判定／対目標比／対目標・千円） */
export function PlTable({ table, mode, box }: { table: MonthlyPlTable; mode: 'landing' | 'forecast'; box: Box }) {
  const rows = table.lines.map((l) => [
    l.label, thousands(l.budget), thousands(l.actual), l.judge,
    l.ratio === null ? '—' : `${l.ratio.toFixed(1)}%`, thousands(l.diff),
  ]);
  return (
    <SlideTable
      box={box}
      head={['', '目標', mode === 'forecast' ? '見込' : '着地', '判定', '対目標比', '対目標']}
      rows={rows}
      widths={[28, 16, 16, 8, 16, 16]}
      align={['left', 'right', 'right', 'center', 'right', 'right']}
      numeric={[false, true, true, false, false, true]}
      rowTone={table.lines.map((l) => (l.judge === '○' ? true : l.judge === '✕' ? false : null))}
      lastRowHead
    />
  );
}

/** 計上会社別（2〜3表を横に並べる） */
export function PlByEntity({ tables, mode, box }: { tables: Array<{ label: string; table: MonthlyPlTable }>; mode: 'landing' | 'forecast'; box: Box }) {
  const each = { w: box.w / tables.length - 12, h: box.h - 26 };
  return (
    <div style={{ display: 'flex', gap: 12, width: '100%', height: '100%' }}>
      {tables.map((t) => (
        <div key={t.label} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.title, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
          <PlTable table={t.table} mode={mode} box={each} />
        </div>
      ))}
    </div>
  );
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function md(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
}
/** 実施日の「開始・終了」。資料の中なので1つの文字列にする（画面の一覧の決まりとは別） */
export function dateSpan(a: string | null, b: string | null): string {
  const s = md(a);
  const e = b && b !== a ? md(b) : '';
  return e ? `${s}〜${e}` : s;
}

function ago(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return '今日';
  if (days < 7) return `${days}日前`;
  if (days < 60) return `${Math.floor(days / 7)}週間前`;
  return `${Math.floor(days / 30)}か月前`;
}

/** ヨミ表（案件一覧と同じ並び: 確度 → 実施日） */
export function PipelineTable({ rows, box }: { rows: PipelineRow[]; box: Box }) {
  if (!rows.length) {
    return <div style={{ fontSize: 18, color: C.muted, padding: 12 }}>載せる案件がありません（受注前の案件が無いか、失注だけです）</div>;
  }
  const data = rows.map((r) => [
    r.since_last === 'new' ? '新' : r.since_last === 'updated' ? '更' : '',
    `${r.code} ${r.name}`, r.customer_name, r.confidence, dateSpan(r.event_start, r.event_end),
    thousands(r.estimate_amount), thousands(r.estimate_gross_profit),
    r.next_action ? `${r.next_action}${r.next_action_date ? `（${md(r.next_action_date)}）` : ''}` : '',
    ago(r.last_activity_at),
  ]);
  return (
    <SlideTable
      box={box}
      head={['', '案件', 'お客様', '確度', '実施日', '見積（千円）', '粗利（千円）', '次のアクション', '最後の動き']}
      rows={data}
      widths={[3, 22, 14, 5, 12, 9, 9, 18, 8]}
      align={['center', 'left', 'left', 'center', 'left', 'right', 'right', 'left', 'left']}
      numeric={[false, false, false, false, false, true, true, false, false]}
      maxFont={16}
    />
  );
}

/** 売上／粗利（案件ページ・実施報告の右下） */
export function MoneyTable({ revenue, gross, margin, box }: { revenue: number | null; gross: number | null; margin: number | null; box: Box }) {
  const fontSize = Math.max(12, Math.min(22, Math.floor(box.h / 4)));
  const cell: CSSProperties = { ...cellBase, ...num, fontSize: fontSize * 1.1, padding: '0.3em 0.6em' };
  return (
    <table style={{ ...tableBase, fontSize }}>
      <thead>
        <tr><th style={headCell}>売上</th><th style={headCell}>粗利</th></tr>
      </thead>
      <tbody>
        <tr>
          <td style={cell}>{yen(revenue)}</td>
          <td style={cell}>
            {yen(gross)}
            {margin !== null && (
              <span style={{ display: 'block', fontSize: fontSize * 0.8, fontWeight: 700, background: C.marker, padding: '0 4px', width: 'fit-content', marginLeft: 'auto' }}>
                ({margin.toFixed(1)}%)
              </span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** 人が上書きした表（タブ区切り・1行1レコード。1行目は見出し） */
export function parseTsv(text: string): { head: string[]; rows: string[][] } {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(/[,、|｜]/)).map((c) => c.trim());
  if (!lines.length) return { head: [], rows: [] };
  return { head: split(lines[0]), rows: lines.slice(1).map(split) };
}
