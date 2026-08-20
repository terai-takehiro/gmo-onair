/**
 * 機材台帳 ／ 機材 のスマホカード — 拠点でまとめる形の型と高さの見積もり
 *
 * `rentalTypes.ts`（貸出機材タブ）と同じ考え方です。**拠点の見出しは
 * 間引かず、拠点1つにつき独立した `useVarRowWindow` を持たせる**ことで、
 * 見出しを挟んでも位置計算がずれません（`EquipmentLocationSection.tsx` 側）。
 *
 * ── 親子の並びは `flattenRows` をそのまま使う ──────────────────
 *
 * 「付属品も出す」を入れると、`useEquipmentListState` は**親のすぐ後ろに
 * 子を並べた1本の配列**を返します（深さ優先）。この並びと段差の判定は
 * `flattenRows`（`types.ts`）がすでに持っていて PC の表と共通なので、
 * ここで作り直しません。**まず `flattenRows` で1本の並びを作ってから、
 * 拠点で束ね直します**（束ねてから `flattenRows` を拠点ごとに呼ぶと、
 * 子が親と違う拠点にいたときに深さの判定＝`byId` が親を見失います）。
 *
 * タップで開いた付属品（`childrenCache` 由来、`parentId` が付く）は
 * その親のカードの中に畳み込み、1枚のカードとして高さを測ります
 * （貸出機材の「型番の塊」と同じ形）。「付属品も出す」で当たった子
 * （`parentId` が付かない）は、親が同じ束に居るとは限らないので
 * **独立した1枚のカード**にします。
 */
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { flattenRows, type EquipmentRecord, type LocationRecord } from './types';

export interface CardEntry {
  item: EquipmentRecord;
  /** タップで開いた付属品（`childrenCache` 由来）。開いているときだけ中に持つ */
  kids: EquipmentRecord[];
  /** 付属品を取りに行っている最中か */
  loading: boolean;
  expanded: boolean;
}

export interface LocationSection {
  id: string | null;
  name: string;
  cards: CardEntry[];
}

/** 高さを覚えるときの鍵。**開いているかどうかを含める**（貸出機材と同じ理由） */
export const cardRowKey = (itemId: string, expanded: boolean) => `${itemId}|${expanded ? 'o' : 'c'}`;

// ───────────────────────────────────────────────────────
// 高さの見積もり（見えているカードだけ描くために要る）
// ───────────────────────────────────────────────────────

/** 畳んだカード1枚の高さの初手。**実測で置き換わる**（`useVarRowWindow` が土台にする） */
export const CARD_H = 96;
/** 開いたときに中に生える付属品1行 */
export const CHILD_ROW_H = 40;
/** 付属品を読み込み中の1行 */
export const LOADING_ROW_H = 28;

/**
 * カード1枚ぶんの高さ。**数式で出せることが大事**（描いていないカードの高さが
 * 分からないと「すべて開く」の瞬間にスクロールバーが正しい長さになりません）。
 * カスタム列の行数ぶんは数式に入れていません — 実測（`useVarRowWindow` の
 * 鍵ごとの記憶）で個々に上書きされるため、初手の見積もりが多少ずれても
 * 1〜2回の描画で正しい高さに落ち着きます（貸出機材と同じ割り切り）。
 */
export function cardHeight(entry: CardEntry, cardH = CARD_H): number {
  if (!entry.expanded) return cardH;
  return cardH + entry.kids.length * CHILD_ROW_H + (entry.loading ? LOADING_ROW_H : 0);
}

/**
 * `flattenRows` の出力（1本の並び）を、カード1枚ぶんの塊にまとめ直す。
 *
 * - `kind: 'parent'` → 新しいカードを始める
 * - `kind: 'child'` で `parentId` が直前のカードと一致 → そのカードに畳み込む
 * - `kind: 'loading'` で直前のカードの id と一致 → そのカードを読み込み中にする
 * - それ以外（`parentId` の付かない子＝「付属品も出す」で当たった枝）→
 *   独立した1枚のカードにする
 */
export function buildCardEntries(
  items: EquipmentRecord[],
  expandedIds: Set<string>,
  childrenCache: Record<string, EquipmentRecord[]>,
  loadingChildren: Set<string>,
): CardEntry[] {
  const rows = flattenRows(items, expandedIds, childrenCache, loadingChildren);
  const entries: CardEntry[] = [];
  let current: CardEntry | null = null;

  for (const row of rows) {
    if (row.kind === 'parent') {
      current = { item: row.item, kids: [], loading: false, expanded: expandedIds.has(row.item.id) };
      entries.push(current);
    } else if (row.kind === 'child' && row.parentId && current && current.item.id === row.parentId) {
      current.kids.push(row.item);
    } else if (row.kind === 'loading' && current && row.key === current.item.id) {
      current.loading = true;
    } else if (row.kind === 'child') {
      entries.push({ item: row.item, kids: [], loading: false, expanded: false });
      current = null;
    }
  }
  return entries;
}

/** カードを設置場所で束ねる。`locations` の並び順に出し、場所なしは最後 */
export function groupByLocation(entries: CardEntry[], locations: LocationRecord[]): LocationSection[] {
  const byLocation = new Map<string, CardEntry[]>();
  for (const entry of entries) {
    const key = entry.item.location_id ?? '__none__';
    const bucket = byLocation.get(key);
    if (bucket) bucket.push(entry); else byLocation.set(key, [entry]);
  }

  const sections: LocationSection[] = [];
  for (const loc of locations) {
    const cards = byLocation.get(loc.id);
    if (cards?.length) sections.push({ id: loc.id, name: loc.name, cards });
  }
  const none = byLocation.get('__none__');
  if (none?.length) sections.push({ id: null, name: '設置場所なし', cards: none });
  return sections;
}

/** 読み取り専用で表示するカスタム列の値（空は出さない） */
export function visibleCustomEntries(
  itemId: string,
  columns: CustomColumn[],
  visible: Set<string>,
  values: Record<string, Record<string, string>>,
): { label: string; text: string }[] {
  return columns
    .filter((c) => visible.has(c.id))
    .map((c) => {
      const raw = values[itemId]?.[c.id] ?? '';
      if (!raw) return null;
      const text = c.col_type === 'checkbox' ? (raw === 'true' || raw === '1' ? '済' : '') : raw;
      return text ? { label: c.name, text } : null;
    })
    .filter((v): v is { label: string; text: string } => !!v);
}
