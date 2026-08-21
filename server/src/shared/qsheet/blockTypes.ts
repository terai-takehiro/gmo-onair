// 制作資料 (Qシート) — ブロック (列) の型。
//
// 唯一の定義元は client-qsheet/src/components/editor/EditorSidebar.tsx の
// BLOCK_TYPES 配列リテラル (id は無く type/label/Icon/color のみ)。
// この型自体はこれまでリポジトリのどこにも無く、blockRef や Excel/AI 連携が
// 前提にする「11型」を型として固定する置き場所が無かったため、ここに置く。
//
// ⚠️ ここを増減させたら EditorSidebar.tsx の BLOCK_TYPES も必ず合わせること
// (この配列自体が UI 側の並び・ラベルを決めているわけではない)。
export const QSHEET_BLOCK_TYPES = [
  "scenario",
  "video",
  "slide",
  "telop",
  "audio",
  "audio_mic",
  "led_xr",
  "lighting",
  "stage_diagram",
  "remarks",
  "item",
] as const;

export type BlockType = (typeof QSHEET_BLOCK_TYPES)[number];

export function isBlockType(v: unknown): v is BlockType {
  return typeof v === "string" && (QSHEET_BLOCK_TYPES as readonly string[]).includes(v);
}
