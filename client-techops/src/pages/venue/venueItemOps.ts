// 会場図面 — 品目配列に対する操作（整列・等間隔・重ね順・複製・削除・グループ化）。
// `manualCanvasGeometry.ts` の汎用の純粋関数（`alignBlocks`/`distributeBlocks`/
// `reorderZ`）は中心基準の `VenueItem` をそのまま渡せない（左上基準の `{x,y,w,h}` を
// 要求する）ので、ここで `toTopLeftRect`/`fromTopLeftRect`（`shared/src/venue/geometry.ts`）
// を介してから呼ぶ。VenueBoard・VenueToolbar・VenueInspector・各パネルはこのファイルの
// 関数だけを使い、`manualCanvasGeometry.ts` を直接は呼ばない（変換を1か所に閉じる）。
import type { VenueCatalogItem, VenueItem, VenueItemKind } from "@gmo-onair/shared/src/venue/types";
import { fromTopLeftRect, toTopLeftRect } from "@gmo-onair/shared/src/venue/geometry";
import {
  alignBlocks,
  distributeBlocks,
  reorderZ,
  type AlignMode,
  type DistributeAxis,
  type ZOrderMode,
} from "@/pages/opsmanual/manualCanvasGeometry";

export type { AlignMode, DistributeAxis, ZOrderMode };

let seq = 0;
/** 品目の新しい id を発番する（サーバーの id 発番とは無関係。保存前の仮 id） */
export function genVenueItemId(prefix = "vi"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}_${Math.random().toString(36).slice(2, 7)}`;
}

export function nextZ(items: VenueItem[]): number {
  return items.reduce((max, it) => Math.max(max, it.z), 0) + 1;
}

export function alignItems(items: VenueItem[], ids: string[], mode: AlignMode): VenueItem[] {
  const rects = items.map(toTopLeftRect);
  const aligned = alignBlocks(rects, ids, mode);
  const byId = new Map(aligned.map((r) => [r.id, r]));
  return items.map((it) => {
    const r = byId.get(it.id);
    return r && ids.includes(it.id) ? fromTopLeftRect(it, r) : it;
  });
}

export function distributeItems(items: VenueItem[], ids: string[], axis: DistributeAxis): VenueItem[] {
  const rects = items.map(toTopLeftRect);
  const distributed = distributeBlocks(rects, ids, axis);
  const byId = new Map(distributed.map((r) => [r.id, r]));
  return items.map((it) => {
    const r = byId.get(it.id);
    return r && ids.includes(it.id) ? fromTopLeftRect(it, r) : it;
  });
}

export function reorderZItems(items: VenueItem[], ids: string[], mode: ZOrderMode): VenueItem[] {
  const zRows = items.map((it) => ({ id: it.id, z: it.z }));
  const reordered = reorderZ(zRows, ids, mode);
  const zById = new Map(reordered.map((r) => [r.id, r.z]));
  return items.map((it) => ({ ...it, z: zById.get(it.id) ?? it.z }));
}

const DUPLICATE_OFFSET_MM = 50;

export function duplicateItems(items: VenueItem[], ids: string[]): { items: VenueItem[]; newIds: string[] } {
  const srcs = items.filter((it) => ids.includes(it.id));
  if (srcs.length === 0) return { items, newIds: [] };
  // グループを**丸ごと**複製したときだけ、複製後もグループのまま複製する。元のグループの
  // 一部だけを複製すると、その一部がまるで元の並べ方の完成形であるかのように右パネルへ
  // 出てしまい、「並べ直す」を押すと足りない分まで元の並べ方の既定レイアウトへ膨らんでしまう
  // ところだった（Codex 指摘・P2）。1つだけの複製（ダブルクリックで抜き出した1脚など）は
  // これまでどおり単体にする
  const totalByGroup = new Map<string, number>();
  for (const it of items) if (it.groupId) totalByGroup.set(it.groupId, (totalByGroup.get(it.groupId) ?? 0) + 1);
  const selectedByGroup = new Map<string, number>();
  for (const src of srcs) if (src.groupId) selectedByGroup.set(src.groupId, (selectedByGroup.get(src.groupId) ?? 0) + 1);
  const newGroupIds = new Map<string, string>();
  for (const [groupId, count] of selectedByGroup) {
    if (count >= 2 && count === totalByGroup.get(groupId)) newGroupIds.set(groupId, genVenueItemId("grp"));
  }

  let z = nextZ(items);
  const dups: VenueItem[] = srcs.map((src) => {
    z += 1;
    const points = src.points ? src.points.map(([x, y]) => [x + DUPLICATE_OFFSET_MM, y] as [number, number]) : undefined;
    const groupId = src.groupId ? newGroupIds.get(src.groupId) : undefined;
    // グループとして写せない複製（単体・グループの一部だけ）は並べ方の入力値も持ち出さない
    // ——単体に残った `arrange` だけが後で別のグループへ紛れ込むと、そのグループ全体が
    // 並べ方グループと誤認されてしまう（同じ指摘の作り込み）
    const arrange = groupId ? src.arrange : undefined;
    return { ...src, id: genVenueItemId(), x: src.x + DUPLICATE_OFFSET_MM, points, z, groupId, arrange, locked: false };
  });
  return { items: [...items, ...dups], newIds: dups.map((d) => d.id) };
}

/** 品目を削除する。削除で人数が減ったグループが残っていれば
 *  `normalizeGroupAfterRemoval` で後始末する（Codex 指摘・P2: グループ丸ごとの
 *  削除以外——ダブルクリックで抜いた1個の削除・多重選択での一部削除——は、
 *  移動や Ctrl+G と同じ「人数が減った」状況なのに後始末が抜けていた） */
export function deleteItems(items: VenueItem[], ids: string[]): VenueItem[] {
  const idSet = new Set(ids);
  const affectedGroupIds = new Set(items.filter((it) => idSet.has(it.id) && it.groupId).map((it) => it.groupId as string));
  let result = items.filter((it) => !idSet.has(it.id));
  for (const groupId of affectedGroupIds) {
    const remainingCount = result.filter((it) => it.groupId === groupId).length;
    result = normalizeGroupAfterRemoval(result, groupId, remainingCount);
  }
  return result;
}

const ARROW_MOVE_MM = 10;
const ARROW_MOVE_FINE_MM = 1;
const ARROW_MOVE_LARGE_MM = 100;

export function arrowStepMm(shiftKey: boolean, ctrlKey: boolean): number {
  if (ctrlKey) return ARROW_MOVE_FINE_MM;
  if (shiftKey) return ARROW_MOVE_LARGE_MM;
  return ARROW_MOVE_MM;
}

export function moveItemsBy(items: VenueItem[], ids: string[], dx: number, dy: number): VenueItem[] {
  return items.map((it) => {
    if (!ids.includes(it.id)) return it;
    if (it.points) return { ...it, points: it.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    return { ...it, x: it.x + dx, y: it.y + dy };
  });
}

/**
 * 品目がグループ `groupId` から抜けたあとの後始末（`groupItems` の一部引き抜き・
 * `releaseFromGroup` の個別移動での離脱、両方が使う共通の処理）。残った側の
 * `arrange`（並べ方の入力値）は人数が変わって実物と合わなくなるので必ず外す
 * ——残したまま「並べ直す」を出すと、抜けた分まで元の並べ方の既定レイアウトへ
 * 勝手に復元してしまう（Codex 指摘・P2）。1人以下しか残らないときは、その
 * 「グループ」は体をなさないので groupId も外して解散する（右パネルが個別の
 * 品目ではなくグループとして扱ってしまい、固定・複製などが消えるため・同じ指摘の続き）
 */
function normalizeGroupAfterRemoval(items: VenueItem[], groupId: string, remainingCount: number): VenueItem[] {
  const dissolve = remainingCount < 2;
  return items.map((it) => {
    if (it.groupId !== groupId) return it;
    return dissolve ? { ...it, groupId: undefined, arrange: undefined } : { ...it, arrange: undefined };
  });
}

/** Ctrl+G。選んだ品目を1つのグループにまとめる（既存のグループには入れない・§4-6） */
export function groupItems(items: VenueItem[], ids: string[]): VenueItem[] {
  if (ids.length < 2) return items;
  const groupId = genVenueItemId("grp");
  const idSet = new Set(ids);
  const sourceGroupIds = new Set(items.filter((it) => idSet.has(it.id) && it.groupId).map((it) => it.groupId as string));
  let result = items.map((it) => (idSet.has(it.id) ? { ...it, groupId, arrange: undefined } : it));
  for (const sourceGroupId of sourceGroupIds) {
    const remainingCount = result.filter((it) => it.groupId === sourceGroupId).length;
    result = normalizeGroupAfterRemoval(result, sourceGroupId, remainingCount);
  }
  return result;
}

/** 品目を1つだけグループから外し、同時に位置などの patch を当てる
 *  （ダブルクリック等での「動かした1つはグループから外れる」・§7）。外れた元の
 *  グループの残りも `normalizeGroupAfterRemoval` で後始末する（Codex 指摘・P2:
 *  外れる側だけ処理して残りを放置すると、そちらが古いグループのまま残っていた） */
export function releaseFromGroup(items: VenueItem[], id: string, patch: Partial<VenueItem>): VenueItem[] {
  const target = items.find((it) => it.id === id);
  const groupId = target?.groupId;
  if (!groupId) return items.map((it) => (it.id === id ? { ...it, ...patch } : it));
  const remainingCount = items.filter((it) => it.groupId === groupId && it.id !== id).length;
  const withPatch = items.map((it) => (it.id === id ? { ...it, ...patch, groupId: undefined, arrange: undefined } : it));
  return normalizeGroupAfterRemoval(withPatch, groupId, remainingCount);
}

/** グループ解除。並べたグループの `arrange` も外す（§7「グループ解除」） */
export function ungroupItems(items: VenueItem[], groupId: string): VenueItem[] {
  return items.map((it) => (it.groupId === groupId ? { ...it, groupId: undefined, arrange: undefined } : it));
}

export function groupMembers(items: VenueItem[], groupId: string): VenueItem[] {
  return items.filter((it) => it.groupId === groupId);
}

/** 選択がどこかの1つのグループとちょうど一致しているか（§7「グループの他のメンバー」・
 *  `VenueInspector.tsx` の `wholeGroupSelected` と同じ判定をここへまとめた）。
 *  Ctrl+G が既存の完成したグループへ効くと、`groupItems` が新しい groupId を発行して
 *  `arrange`（並べ方の入力値）を消してしまう——何も変わっていないのに「並べ直す」が
 *  消える壊し方だった（Codex 指摘・P2） */
export function isWholeGroupSelected(items: VenueItem[], selectedIds: string[]): boolean {
  if (selectedIds.length === 0) return false;
  const groupId = items.find((it) => it.id === selectedIds[0])?.groupId;
  if (!groupId) return false;
  const members = groupMembers(items, groupId);
  return members.length === selectedIds.length && members.every((m) => selectedIds.includes(m.id));
}

// ── 「追加」タブ・道具の帯の図形ボタン（§4-3・§11-4） ───────────────

/** 図形5種の既定値（`shared/src/venue/arrange.ts` と同じく、DBには持たずコードで持つ・§11-4） */
export const SHAPE_DEFAULTS = {
  rect: { w: 1000, d: 1000 },
  circle: { diameter: 1000 },
  line: { length: 2000 },
  text: { w: 1200, d: 200 },
  dimension: { length: 2000 },
} as const;
export type ShapeKey = keyof typeof SHAPE_DEFAULTS;

/** 図形を表示範囲の中央（`center`）に既定サイズで置く */
export function buildShapeItem(shapeKey: ShapeKey, center: { x: number; y: number }, z: number): VenueItem {
  const id = genVenueItemId("shape");
  if (shapeKey === "line" || shapeKey === "dimension") {
    const len = SHAPE_DEFAULTS[shapeKey].length;
    return {
      id, kind: shapeKey, x: center.x, y: center.y, rotation: 0, z,
      points: [[center.x - len / 2, center.y], [center.x + len / 2, center.y]],
    };
  }
  if (shapeKey === "circle") return { id, kind: "shape", x: center.x, y: center.y, rotation: 0, z, diameter: SHAPE_DEFAULTS.circle.diameter };
  if (shapeKey === "text") return { id, kind: "text", x: center.x, y: center.y, rotation: 0, z, w: SHAPE_DEFAULTS.text.w, d: SHAPE_DEFAULTS.text.d, label: "" };
  return { id, kind: "shape", x: center.x, y: center.y, rotation: 0, z, w: SHAPE_DEFAULTS.rect.w, d: SHAPE_DEFAULTS.rect.d };
}

/** カタログ品目（備品・カメラ・人）の1個を寸法どおりに置く（§6②「押すと表示範囲の中央に実寸で置く」） */
export function catalogItemKind(cat: VenueCatalogItem): VenueItemKind {
  if (cat.category === "camera") return "camera";
  if (cat.category === "people") return "person";
  return "catalog";
}

export function buildCatalogItem(cat: VenueCatalogItem, center: { x: number; y: number }, z: number, jitterIndex = 0): VenueItem {
  const id = genVenueItemId(cat.key);
  const kind = catalogItemKind(cat);
  const jitter = jitterIndex * 60;
  if (cat.footprint.shape === "line") {
    const len = cat.footprint.length;
    const cy = center.y + jitter;
    return { id, kind, key: cat.key, x: center.x, y: cy, rotation: 0, z, points: [[center.x - len / 2, cy], [center.x + len / 2, cy]] };
  }
  const base = { id, kind, key: cat.key, x: center.x + jitter, y: center.y + jitter, rotation: 0, z };
  if (cat.footprint.shape === "circle") return { ...base, diameter: cat.footprint.diameter };
  if (cat.footprint.shape === "rect") return { ...base, w: cat.footprint.w, d: cat.footprint.d };
  const w = typeof cat.sizeMm.w === "number" ? cat.sizeMm.w : 500;
  const d = typeof cat.sizeMm.d === "number" ? cat.sizeMm.d : 500;
  return { ...base, w, d };
}
