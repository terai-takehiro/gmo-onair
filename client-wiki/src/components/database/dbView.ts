/**
 * ビューの組み立て（列の選び方・グループ・月のマス）
 *
 * ⚠️ **絞り込みと並べ替えはここに書きません。** サーバー（`wiki-view-apply.ts`）が
 *    当てたものが `GET /wiki/databases/:pageId/rows?view=` で返ります。画面側でも
 *    当て直すと、同じビューなのに画面とサーバーで行の数が違う状態が作れてしまいます。
 *    ここに残っているのは**画面にしか要らない計算**（ボードの列・カレンダーのマス）だけです。
 *
 * ⚠️ ビューの設定は**保存され、開いた人全員に同じに見えます**（設計 §6-⑩）。
 *    「自分だけの絞り込み」を作らないこと。
 */
import type { WikiItem, WikiRow, WikiView, WikiViewFilter } from '@gmo-onair/shared/src/wiki/types';

/** ビューが1つも保存されていないデータベースで使う表（サーバーの `defaultTableView` と同じ形） */
export const FALLBACK_VIEW: WikiView = { id: 'table', name: '表', type: 'table' };

export function ensureViews(views: WikiView[] | undefined): WikiView[] {
  return views && views.length > 0 ? views : [FALLBACK_VIEW];
}

/** 表に出す列。`columns` が空なら全部を定義の順に出す */
export function viewItems(items: WikiItem[], view: WikiView): WikiItem[] {
  if (!view.columns || view.columns.length === 0) return items;
  return view.columns
    .map((id) => items.find((it) => it.id === id))
    .filter((it): it is WikiItem => !!it);
}

/* ── 絞り込みの条件（設定の画面で選ばせるため） ─────────────── */

export const FILTER_OP_LABEL: Record<WikiViewFilter['op'], string> = {
  is: 'に一致',
  is_not: 'に一致しない',
  contains: 'を含む',
  is_empty: 'が空',
  is_not_empty: 'が入っている',
  before: 'より前',
  after: 'より後',
};

/** 型ごとに選べる条件。合わない条件を選べると、必ず0件になる絞り込みができる */
export function opsFor(item: WikiItem): WikiViewFilter['op'][] {
  switch (item.type) {
    case 'date':
      return ['before', 'after', 'is', 'is_empty', 'is_not_empty'];
    case 'checkbox':
      return ['is'];
    case 'select':
    case 'person':
      return ['is', 'is_not', 'is_empty', 'is_not_empty'];
    case 'multi_select':
      return ['contains', 'is_empty', 'is_not_empty'];
    case 'number':
      return ['is', 'is_empty', 'is_not_empty'];
    case 'onair_link':
      return ['is_empty', 'is_not_empty'];
    default:
      return ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'];
  }
}

/** 条件が値を要るか（`が空` は要らない） */
export function opNeedsValue(op: WikiViewFilter['op']): boolean {
  return op !== 'is_empty' && op !== 'is_not_empty';
}

/* ── ボードのグループ ─────────────────────────────────────── */

export interface RowGroup {
  /** 選択肢の値。`null` は「未設定」の列 */
  value: string | null;
  label: string;
  rows: WikiRow[];
}

/**
 * 選択型の項目でグループに分ける。**選択肢は定義の順**に並べ、
 * 値の無い行は最後の「未設定」に入れます（拾われずに消える行を作らない）。
 */
export function groupRows(rows: WikiRow[], item: WikiItem): RowGroup[] {
  const groups: RowGroup[] = (item.options ?? []).map((o) => ({ value: o.value, label: o.value, rows: [] }));
  const unset: RowGroup = { value: null, label: '未設定', rows: [] };
  const index = new Map(groups.map((g) => [g.value, g]));

  for (const row of rows) {
    const v = row.props?.[item.id];
    const key = typeof v === 'string' ? v : null;
    const target = key !== null ? index.get(key) : undefined;
    if (target) target.rows.push(row);
    else unset.rows.push(row);
  }
  return [...groups, unset];
}

/* ── カレンダーの月 ───────────────────────────────────────── */

export interface CalendarCell {
  /** "YYYY-MM-DD" */
  date: string;
  /** その月の日か（前後の月の日は薄く出す） */
  inMonth: boolean;
}

const p2 = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function monthLabel(year: number, month: number): string {
  return `${year}年${month + 1}月`;
}

/** 日曜はじまり。前後の月の日で埋めて、4〜6週ぶんのマスを返す */
export function monthCells(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const total = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;

  return Array.from({ length: total }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: ymd(d), inMonth: d.getMonth() === month };
  });
}

/** 日付ごとの行。日付の項目が空の行はどこにも入らない */
export function rowsByDate(rows: WikiRow[], dateItemId: string): Map<string, WikiRow[]> {
  const out = new Map<string, WikiRow[]>();
  for (const row of rows) {
    const v = row.props?.[dateItemId];
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;
    const list = out.get(v);
    if (list) list.push(row);
    else out.set(v, [row]);
  }
  return out;
}

/** 月を前後に動かす。12月の次は翌年の1月 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}
