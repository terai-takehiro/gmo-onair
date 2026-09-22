/**
 * Wiki — ビューの絞り込みと並べ替えを**サーバーで**当てる（設計 §6-⑩）。
 *
 * ⚠️ **画面ごとに書かない。** 表・ボード・カレンダーの3つが同じビューの定義を読むので、
 * 絞り込みと並べ替えを画面側に置くと3か所に増え、**同じビューを開いたのに
 * 画面によって行の数が違う**が起きます。CSV の書き出しも同じここを通します。
 *
 * ⚠️ **SQL ではなく Node で当てています。** 行は1つのデータベースの子ページだけで、
 * 実際の数は数十〜数百（上限 2000 件・`wiki-row.service.ts`）。9種類の型 × 7つの条件を
 * JSONB の式に翻訳すると読めない SQL になり、型が増えるたびに書き換えることになります。
 * 検索の点数付けを Node 側でやる判断（§5-4）と同じ考え方です。
 */
import type { WikiItem, WikiPropValue } from '../wiki-props';
import type { WikiView, WikiViewFilter } from './wiki-database-schema';

/** 並べ替え・絞り込みに要る分だけ。`WikiRow` をそのまま渡せる形 */
export interface WikiRowLike {
  title: string;
  sort_order: number;
  props: Record<string, WikiPropValue>;
}

/** 値が「空」か。`is_empty` と、並べ替えで後ろに送る判定の両方で使う */
export function isEmptyValue(v: WikiPropValue | undefined): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** 絞り込み・並べ替えで比べるときの文字の形（表示と同じ見え方にする） */
export function textOf(v: WikiPropValue | undefined): string {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') {
    const link = v as { id?: unknown; label?: unknown };
    return String(link.label ?? link.id ?? '');
  }
  return String(v);
}

/** ONAiR リンクは id で同じかを見る（名前は貼った時点の写しなので当てにしない） */
function keyOf(v: WikiPropValue | undefined): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return String((v as { id?: unknown }).id ?? '');
  }
  return textOf(v);
}

function matchesIs(cell: WikiPropValue | undefined, want: WikiPropValue | undefined): boolean {
  if (want === undefined || want === null) return isEmptyValue(cell);
  // 複数選択は「その値を含む」。表の絞り込みで「分類が A」と言えば A の付いた行を指す
  if (Array.isArray(cell)) return cell.some((x) => String(x) === String(want));
  if (typeof cell === 'number' || typeof want === 'number') return Number(cell) === Number(want);
  if (typeof cell === 'boolean' || typeof want === 'boolean') return Boolean(cell) === Boolean(want);
  return keyOf(cell) === keyOf(want as WikiPropValue);
}

function matchesContains(cell: WikiPropValue | undefined, want: WikiPropValue | undefined): boolean {
  const needle = textOf(want as WikiPropValue).toLowerCase();
  if (!needle) return true;
  if (Array.isArray(cell)) return cell.some((x) => String(x).toLowerCase().includes(needle));
  return textOf(cell).toLowerCase().includes(needle);
}

/**
 * 日付と数の大小。
 *
 * 日付は `YYYY-MM-DD` の固定長なので**文字のまま比べて順序が正しい**
 * （`Date` にすると時間帯でずれる。`connection.ts` の DATE の注記と同じ理由）。
 */
function compareOrderable(cell: WikiPropValue | undefined, want: WikiPropValue | undefined): number | null {
  if (isEmptyValue(cell) || want === undefined || want === null) return null;
  if (typeof cell === 'number' || typeof want === 'number') {
    const a = Number(cell);
    const b = Number(want);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  const a = textOf(cell);
  const b = textOf(want as WikiPropValue);
  return a === b ? 0 : a < b ? -1 : 1;
}

function matchesFilter(row: WikiRowLike, filter: WikiViewFilter): boolean {
  const cell = row.props?.[filter.itemId];
  switch (filter.op) {
    case 'is':
      return matchesIs(cell, filter.value);
    case 'is_not':
      return !matchesIs(cell, filter.value);
    case 'contains':
      return matchesContains(cell, filter.value);
    case 'is_empty':
      return isEmptyValue(cell);
    case 'is_not_empty':
      return !isEmptyValue(cell);
    case 'before': {
      const c = compareOrderable(cell, filter.value);
      return c !== null && c < 0;
    }
    case 'after': {
      const c = compareOrderable(cell, filter.value);
      return c !== null && c > 0;
    }
    default:
      return true;
  }
}

/** 並べ替えの比較。型ごとに見方を変える（数は数として、日付は文字のまま） */
function compareByItem(a: WikiRowLike, b: WikiRowLike, item: WikiItem | undefined, itemId: string): number {
  const av = a.props?.[itemId];
  const bv = b.props?.[itemId];
  // 空は向きに関わらず必ず後ろ（「空が先頭に並ぶ表」は探しものが見つからない）
  const ae = isEmptyValue(av);
  const be = isEmptyValue(bv);
  if (ae && be) return 0;
  if (ae) return 1;
  if (be) return -1;

  if (item?.type === 'number') {
    const an = Number(av);
    const bn = Number(bv);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an === bn ? 0 : an < bn ? -1 : 1;
  }
  if (item?.type === 'checkbox') {
    const an = av === true ? 1 : 0;
    const bn = bv === true ? 1 : 0;
    return an - bn;
  }
  if (item?.type === 'date') {
    const as = textOf(av);
    const bs = textOf(bv);
    return as === bs ? 0 : as < bs ? -1 : 1;
  }
  // 文字は日本語の並び（`localeCompare` の 'ja'）。数字だけの文字は数として見る
  return textOf(av).localeCompare(textOf(bv), 'ja', { numeric: true });
}

/** ビューを指定しなかったとき・ビューに並べ替えが無いときの既定（ツリーと同じ並び） */
function compareDefault(a: WikiRowLike, b: WikiRowLike): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.title.localeCompare(b.title, 'ja', { numeric: true });
}

/**
 * ビューの絞り込みと並べ替えを当てた行を返す（**元の配列は変えない**）。
 *
 * `view` が無ければ絞り込みは無く、並び順はツリーと同じ（`sort_order` → 題）。
 */
export function applyView<T extends WikiRowLike>(rows: T[], view: WikiView | null, items: WikiItem[]): T[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const filters = view?.filters ?? [];
  const out = filters.length > 0
    ? rows.filter((row) => filters.every((f) => matchesFilter(row, f)))
    : [...rows];

  const sorts = view?.sorts ?? [];
  if (sorts.length === 0) {
    out.sort(compareDefault);
    return out;
  }
  out.sort((a, b) => {
    for (const s of sorts) {
      const c = compareByItem(a, b, byId.get(s.itemId), s.itemId);
      if (c !== 0) return s.dir === 'desc' ? -c : c;
    }
    return compareDefault(a, b);
  });
  return out;
}
