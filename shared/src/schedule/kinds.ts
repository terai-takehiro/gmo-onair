// スケジュール表 — 項目の区分（唯一の正）
//
// 画面のグリッド・モバイルのバッジ・Excel の凡例が**同じ配色**を読むための表。
// ⚠️ server/src/shared/schedule/kinds.ts と構造を必ず一致させること。
// サーバーは server/src/ 外を import できないため意図的に複製している
// (scripts/check-collab-parity.mjs が乖離を検査する)。

export const ITEM_KINDS = [
  "setup",
  "rehearsal",
  "onair",
  "recording",
  "meal",
  "standby",
  "teardown",
  "move",
  "other",
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export interface ItemKindDef {
  kind: ItemKind;
  label: string;
  /** 背景色（Excel の cell.fill・グリッドの背景に使う。6桁の16進） */
  color: string;
}

export const ITEM_KIND_DEFS: ItemKindDef[] = [
  { kind: "setup", label: "仕込み", color: "D9E8FB" },
  { kind: "rehearsal", label: "リハーサル", color: "FDE7C8" },
  { kind: "onair", label: "本番", color: "FBD1D1" },
  { kind: "recording", label: "収録", color: "F3C9E4" },
  { kind: "meal", label: "食事", color: "D8F0D0" },
  { kind: "standby", label: "待機", color: "E5E5E5" },
  { kind: "teardown", label: "撤収", color: "D9E8FB" },
  { kind: "move", label: "移動", color: "EDEBFB" },
  { kind: "other", label: "その他", color: "F2F2F2" },
];

export const ITEM_KIND_BY_VALUE: Record<ItemKind, ItemKindDef> = Object.fromEntries(
  ITEM_KIND_DEFS.map((d) => [d.kind, d]),
) as Record<ItemKind, ItemKindDef>;

export function itemKindLabel(kind: string): string {
  return ITEM_KIND_BY_VALUE[kind as ItemKind]?.label ?? kind;
}

export function itemKindColor(kind: string): string {
  return ITEM_KIND_BY_VALUE[kind as ItemKind]?.color ?? "F2F2F2";
}

export const COL_GROUPS = ["venue", "prep", "ops"] as const;
export type ColGroup = (typeof COL_GROUPS)[number];

export const COL_GROUP_LABEL: Record<ColGroup, string> = {
  venue: "会場",
  prep: "支度",
  ops: "運営",
};
