/**
 * Wiki — 項目（列）とビューの定義の検査（`docs/design/v4/wiki.md` §4-4・§6-⑩）。
 *
 * `PUT /wiki/databases/:pageId` が受け取った JSON を、**保存してよい形に正す**ところ。
 * DB を引かない純関数だけを置きます（引くのは `wiki-database.service.ts`）。
 *
 * ⚠️ **項目の id は画面が決めても、サーバーが決めてもよい形にしてあります。**
 * 画面から来た項目に id が無ければここで発番します。**既にある項目の id は変えません** —
 * id は `wiki_pages.props` のキーそのもので、変えると**全ての行の値が孤児になります**
 * （名前や型を変えただけのつもりで、値が全部消えたように見える）。
 *
 * ⚠️ **ビューの絞り込み・並べ替えが指す項目が実在するかも、ここで見ます。**
 * 消えた項目を指したビューを保存できてしまうと、一覧が毎回空になり、
 * 画面からは「行が消えた」としか見えません。
 */
import { ValidationError } from '../../qsheet/services/httpErrors';
import {
  WIKI_ITEM_TYPES,
  WIKI_ONAIR_KINDS,
  type WikiItem,
  type WikiItemType,
  type WikiOnairKind,
  type WikiPropValue,
} from '../wiki-props';

/** ビューは3つだけ（§10 の判断3c）。増やすのは表・ボード・カレンダーを使ってからと決めてある */
export const WIKI_VIEW_TYPES = ['table', 'board', 'calendar'] as const;
export type WikiViewType = (typeof WIKI_VIEW_TYPES)[number];

/** 絞り込みの演算子（shared の `WikiViewFilter['op']` と同じ7つ） */
export const WIKI_FILTER_OPS = [
  'is', 'is_not', 'contains', 'is_empty', 'is_not_empty', 'before', 'after',
] as const;
export type WikiFilterOp = (typeof WIKI_FILTER_OPS)[number];

export interface WikiViewSort {
  itemId: string;
  dir: 'asc' | 'desc';
}

export interface WikiViewFilter {
  itemId: string;
  op: WikiFilterOp;
  value?: WikiPropValue;
}

export interface WikiView {
  id: string;
  name: string;
  type: WikiViewType;
  columns?: string[];
  sorts?: WikiViewSort[];
  filters?: WikiViewFilter[];
  groupBy?: string;
  dateItem?: string;
}

/**
 * 上限。**多すぎて画面が描けない**のを保存の時点で止める
 * （1行が横に 200 列あると、表の横スクロールが実用にならない）。
 */
const MAX_ITEMS = 60;
const MAX_VIEWS = 12;
const MAX_OPTIONS = 100;
const MAX_NAME = 60;

/** id に使える形。`wiki_pages.props` のキー・CSV の列の対応づけに出る */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new ValidationError(`${what}の形が正しくありません。入力を確かめてください。`);
  }
  return v as Record<string, unknown>;
}

function name(v: unknown, what: string): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new ValidationError(`${what}を入れてください。`);
  if (s.length > MAX_NAME) throw new ValidationError(`${what}は ${MAX_NAME} 文字までです。`);
  return s;
}

/**
 * 新しい項目・ビューの id。短い英数字（`wi-` / `wv-`）。
 *
 * ⚠️ `uuid` を使わず 8 桁で作っているのは、**CSV の列の対応づけと URL の
 * `?view=` に出るため**です（既存の `wp-` / `wv-` と同じ作り方）。
 */
function newId(prefix: string, taken: Set<string>): string {
  for (let i = 0; i < 50; i += 1) {
    const id = `${prefix}${Math.random().toString(36).slice(2, 10)}`;
    if (!taken.has(id)) return id;
  }
  throw new ValidationError('項目を保存できませんでした。もう一度お試しください。');
}

function readId(raw: unknown, prefix: string, taken: Set<string>, what: string): string {
  if (raw === undefined || raw === null || raw === '') return newId(prefix, taken);
  if (typeof raw !== 'string' || !ID_RE.test(raw)) {
    throw new ValidationError(`${what}を保存できませんでした。画面を読み込み直してください。`);
  }
  if (taken.has(raw)) throw new ValidationError(`${what}が重複しています。名前を分けてください。`);
  return raw;
}

function readOptions(raw: unknown, itemName: string): Array<{ value: string; color?: string }> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError(`「${itemName}」の選択肢の形が正しくありません。`);
  if (raw.length > MAX_OPTIONS) {
    throw new ValidationError(`「${itemName}」の選択肢は ${MAX_OPTIONS} 個までです。`);
  }
  const out: Array<{ value: string; color?: string }> = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const o = obj(entry, `「${itemName}」の選択肢`);
    const value = typeof o.value === 'string' ? o.value.trim() : '';
    if (!value) throw new ValidationError(`「${itemName}」の選択肢に空のものがあります。`);
    if (seen.has(value)) throw new ValidationError(`「${itemName}」の選択肢「${value}」が重複しています。`);
    seen.add(value);
    const color = typeof o.color === 'string' && o.color ? o.color : undefined;
    out.push(color ? { value, color } : { value });
  }
  return out;
}

/**
 * 項目の一覧を正す。
 *
 * - id が無ければ発番する（画面は名前と型だけ送ればよい）
 * - 選択肢は select / multi_select のときだけ残す（型を変えたら消える）
 * - `onairKinds` は onair_link のときだけ残す
 */
export function normalizeItems(raw: unknown): WikiItem[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError('項目の形が正しくありません。入力を確かめてください。');
  if (raw.length > MAX_ITEMS) throw new ValidationError(`項目は ${MAX_ITEMS} 個までです。`);

  const takenIds = new Set<string>();
  const takenNames = new Set<string>();
  const out: WikiItem[] = [];
  for (const entry of raw) {
    const o = obj(entry, '項目');
    const itemName = name(o.name, '項目の名前');
    if (takenNames.has(itemName)) {
      throw new ValidationError(`項目の名前「${itemName}」が重複しています。名前を分けてください。`);
    }
    takenNames.add(itemName);

    const type = String(o.type ?? '') as WikiItemType;
    if (!WIKI_ITEM_TYPES.includes(type)) {
      throw new ValidationError(`「${itemName}」の種類が正しくありません。一覧から選び直してください。`);
    }
    const id = readId(o.id, 'wi-', takenIds, '項目');
    takenIds.add(id);

    const item: WikiItem = { id, name: itemName, type };
    if (type === 'select' || type === 'multi_select') {
      const options = readOptions(o.options, itemName);
      if (options.length > 0) item.options = options;
    }
    if (type === 'onair_link' && Array.isArray(o.onairKinds)) {
      const kinds = o.onairKinds.filter(
        (k): k is WikiOnairKind => typeof k === 'string' && WIKI_ONAIR_KINDS.includes(k as WikiOnairKind),
      );
      if (kinds.length > 0) item.onairKinds = [...new Set(kinds)];
    }
    if (o.required === true) item.required = true;
    out.push(item);
  }
  return out;
}

function readSorts(raw: unknown, byId: Map<string, WikiItem>, viewName: string): WikiViewSort[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError(`「${viewName}」の並べ替えの形が正しくありません。`);
  return raw.map((entry) => {
    const o = obj(entry, `「${viewName}」の並べ替え`);
    const itemId = String(o.itemId ?? '');
    if (!byId.has(itemId)) {
      throw new ValidationError(`「${viewName}」の並べ替えが、いまは無い項目を指しています。選び直してください。`);
    }
    return { itemId, dir: o.dir === 'desc' ? 'desc' : 'asc' };
  });
}

function readFilters(raw: unknown, byId: Map<string, WikiItem>, viewName: string): WikiViewFilter[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError(`「${viewName}」の絞り込みの形が正しくありません。`);
  return raw.map((entry) => {
    const o = obj(entry, `「${viewName}」の絞り込み`);
    const itemId = String(o.itemId ?? '');
    if (!byId.has(itemId)) {
      throw new ValidationError(`「${viewName}」の絞り込みが、いまは無い項目を指しています。選び直してください。`);
    }
    const op = String(o.op ?? '') as WikiFilterOp;
    if (!WIKI_FILTER_OPS.includes(op)) {
      throw new ValidationError(`「${viewName}」の絞り込みの条件が正しくありません。選び直してください。`);
    }
    const filter: WikiViewFilter = { itemId, op };
    /*
     * ⚠️ **値は `isValidPropValue` では見ません。** 「含む」は選択肢の一部の文字で
     * 絞るので、項目の型に合わない値（選択肢に無い文字）がむしろ普通です。
     * 形（文字・数・真偽・文字の一覧）だけを見て、読めないものは捨てます。
     */
    if (o.value !== undefined && o.value !== null) {
      const v = o.value;
      const ok =
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean' ||
        (Array.isArray(v) && v.every((x) => typeof x === 'string'));
      if (ok) filter.value = v as WikiPropValue;
    }
    return filter;
  });
}

/**
 * ビューの一覧を正す。
 *
 * - ボードは**選択型の項目**でグループ化する（無ければ保存できない — 開いても1列も出ないため）
 * - カレンダーは**日付型の項目**が要る（同じ理由で、無いと1件も出ない）
 * - `columns` は実在する項目だけ残す（消した項目が列に残っていても無視する）
 */
export function normalizeViews(raw: unknown, items: WikiItem[]): WikiView[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError('ビューの形が正しくありません。入力を確かめてください。');
  if (raw.length > MAX_VIEWS) throw new ValidationError(`ビューは ${MAX_VIEWS} 個までです。`);

  const byId = new Map(items.map((i) => [i.id, i]));
  const takenIds = new Set<string>();
  const out: WikiView[] = [];
  for (const entry of raw) {
    const o = obj(entry, 'ビュー');
    const viewName = name(o.name, 'ビューの名前');
    const type = String(o.type ?? '') as WikiViewType;
    if (!WIKI_VIEW_TYPES.includes(type)) {
      throw new ValidationError(`「${viewName}」の種類は表・ボード・カレンダーのいずれかです。`);
    }
    const id = readId(o.id, 'wv-', takenIds, 'ビュー');
    takenIds.add(id);

    const view: WikiView = { id, name: viewName, type };
    if (Array.isArray(o.columns)) {
      const columns = o.columns.filter((c): c is string => typeof c === 'string' && byId.has(c));
      if (columns.length > 0) view.columns = [...new Set(columns)];
    }
    const sorts = readSorts(o.sorts, byId, viewName);
    if (sorts.length > 0) view.sorts = sorts;
    const filters = readFilters(o.filters, byId, viewName);
    if (filters.length > 0) view.filters = filters;

    if (type === 'board') {
      const groupBy = String(o.groupBy ?? '');
      const item = byId.get(groupBy);
      if (!item || item.type !== 'select') {
        throw new ValidationError(`「${viewName}」はグループ分けに使う選択の項目を選んでください。`);
      }
      view.groupBy = groupBy;
    }
    if (type === 'calendar') {
      const dateItem = String(o.dateItem ?? '');
      const item = byId.get(dateItem);
      if (!item || item.type !== 'date') {
        throw new ValidationError(`「${viewName}」は日付の項目を選んでください。`);
      }
      view.dateItem = dateItem;
    }
    out.push(view);
  }
  return out;
}

/** 新しく `kind='database'` にしたページに最初から入れておく1本（画面が空のタブを出さないように） */
export function defaultTableView(): WikiView {
  return { id: `wv-${Math.random().toString(36).slice(2, 10)}`, name: '表', type: 'table' };
}
