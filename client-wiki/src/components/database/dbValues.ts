/**
 * 項目の型ごとの見た目と値の扱い（設計 docs/design/v4/wiki.md §4-4）
 *
 * **型は9つだけ**: 文字 / 選択 / 複数選択 / 日付 / 担当 / チェック / 数値 / URL / ONAiR リンク。
 * 増やすときは ①`shared/src/wiki/types.ts` ②`isValidPropValue`（`shared/src/wiki/frontMatter.ts`）
 * ③ここ ④`DatabaseCell.tsx` の4か所を揃えます。
 *
 * ⚠️ **値が正しいかの判定は `isValidPropValue` が正**です。ここには写しません
 *    （2か所に置くと必ず片方が古くなり、画面は通るのにサーバーが落とす値ができます）。
 */
import {
  Calendar, CheckSquare, Hash, Link2, List, Tags, Type, User, Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { SlotWidth } from '@gmo-onair/shared/src/client/ui/row';
import type {
  WikiItem,
  WikiItemType,
  WikiOnairKind,
  WikiOnairLink,
  WikiPropValue,
} from '@gmo-onair/shared/src/wiki/types';

/** 画面に出す型の名前（docs/wording.md ルール9: 基本語で書く） */
export const ITEM_TYPE_LABEL: Record<WikiItemType, string> = {
  text: '文字',
  select: '選択',
  multi_select: '複数選択',
  date: '日付',
  person: '担当',
  checkbox: 'チェック',
  number: '数値',
  url: 'URL',
  onair_link: 'ONAiR リンク',
};

/** 追加のときに選べる順番。よく使うものを上に置く */
export const ITEM_TYPES: WikiItemType[] = [
  'text', 'select', 'multi_select', 'date', 'person', 'checkbox', 'number', 'url', 'onair_link',
];

const ITEM_ICON: Record<WikiItemType, LucideIcon> = {
  text: Type,
  select: List,
  multi_select: Tags,
  date: Calendar,
  person: User,
  checkbox: CheckSquare,
  number: Hash,
  url: Link2,
  onair_link: Workflow,
};

export function itemIcon(type: WikiItemType): LucideIcon {
  return ITEM_ICON[type];
}

/**
 * 表の列の幅。**7段（`SlotWidth`）からしか選べません**。
 * 同じ型の列がデータベースごとに違う幅にならないよう、型で決めてしまいます。
 */
const ITEM_WIDTH: Record<WikiItemType, SlotWidth> = {
  text: 200,
  select: 128,
  multi_select: 200,
  date: 128,
  person: 128,
  checkbox: 56,
  number: 96,
  url: 160,
  onair_link: 200,
};

export function itemWidth(type: WikiItemType): SlotWidth {
  return ITEM_WIDTH[type];
}

/** 選択肢の色。意味を持たない見分けの色（`cat-1`〜`cat-8`）から順に配る */
const OPTION_TONES = [
  'border-cat-1/30 bg-cat-1/10 text-cat-1',
  'border-cat-2/30 bg-cat-2/10 text-cat-2',
  'border-cat-3/30 bg-cat-3/10 text-cat-3',
  'border-cat-4/30 bg-cat-4/10 text-cat-4',
  'border-cat-5/30 bg-cat-5/10 text-cat-5',
  'border-cat-6/30 bg-cat-6/10 text-cat-6',
  'border-cat-7/30 bg-cat-7/10 text-cat-7',
  'border-cat-8/30 bg-cat-8/10 text-cat-8',
] as const;

/** 選択肢の並び順から色を決める（同じ値はいつも同じ色になる） */
export function optionTone(item: WikiItem, value: string): string {
  const i = (item.options ?? []).findIndex((o) => o.value === value);
  return OPTION_TONES[(i < 0 ? 0 : i) % OPTION_TONES.length];
}

/* ── 値 ───────────────────────────────────────────────────── */

/** 値が空か。`0` と `false` は入っている値として扱う（未入力と区別する） */
export function isBlankValue(v: WikiPropValue | undefined): boolean {
  if (v === null || v === undefined || v === '') return true;
  return Array.isArray(v) && v.length === 0;
}

export function asStringValue(v: WikiPropValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return '';
}

export function asArrayValue(v: WikiPropValue | undefined): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function asOnairLink(v: WikiPropValue | undefined): WikiOnairLink | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const link = v as Partial<WikiOnairLink>;
  if (typeof link.kind !== 'string' || typeof link.id !== 'string' || !link.id) return null;
  return { kind: link.kind, id: link.id, label: link.label };
}

/** 一覧・カードに出す1行の文字。**空のときは空文字**（列の `placeholder` に任せる） */
export function displayValue(
  item: WikiItem,
  v: WikiPropValue | undefined,
  personName?: (id: string) => string | undefined,
): string {
  if (isBlankValue(v)) return '';
  switch (item.type) {
    case 'checkbox':
      return v === true ? 'はい' : 'いいえ';
    case 'date':
      return asStringValue(v).replace(/-/g, '/');
    case 'multi_select':
      return asArrayValue(v).join('・');
    case 'person': {
      const id = asStringValue(v);
      return personName?.(id) ?? id;
    }
    case 'onair_link': {
      const link = asOnairLink(v);
      return link ? (link.label || link.id) : '';
    }
    default:
      return asStringValue(v);
  }
}

/* ── ONAiR リンク ─────────────────────────────────────────── */

/**
 * 相手の道は `shared/src/wiki/markdown.ts` の `ONAIR_PATHS` が正。
 * ここは**同じ形を組み立てる側**なので、向こうを直したらここも直します。
 */
const ONAIR_PATH: Record<WikiOnairKind, string> = {
  project: '/sales/projects/',
  equipment: '/equipment/items/',
  room: '/calendar/rooms/',
  page: '/wiki/p/',
};

export const ONAIR_KIND_LABEL: Record<WikiOnairKind, string> = {
  project: '案件',
  equipment: '機材',
  room: '部屋',
  page: 'Wiki ページ',
};

export function onairHref(link: WikiOnairLink): string {
  return `${ONAIR_PATH[link.kind]}${link.id}`;
}

/**
 * 貼り付けられた ONAiR の URL から相手を読む。
 * `https://gmo-onair.jp/sales/projects/xxx` のような絶対 URL でも、
 * `/sales/projects/xxx` だけでも受けます。読めなければ `null`。
 */
export function parseOnairUrl(raw: string): Omit<WikiOnairLink, 'label'> | null {
  const text = raw.trim();
  if (!text) return null;
  const path = text.startsWith('/') ? text : text.replace(/^https?:\/\/[^/]+/, '');
  for (const kind of Object.keys(ONAIR_PATH) as WikiOnairKind[]) {
    const prefix = ONAIR_PATH[kind];
    if (!path.startsWith(prefix)) continue;
    const id = path.slice(prefix.length).split(/[/?#]/)[0];
    if (id) return { kind, id };
  }
  return null;
}
