/* ================================================================
   CG Layout — single source of truth for 1920×1080 canvas geometry.
   All ranking rows, photo slots, and strip positions derive from here.
   ================================================================ */

export const CG_W = 1920;
export const CG_H = 1080;

// ── Ranking board ──────────────────────────────────────────────
const RANK_PAD_TOP = 230;
const RANK_PAD_BOTTOM = 220;
export const RANK_PAD_X = 120;
export const RANK_ROW_GAP = 16;
const RANK_ROW_COUNT = 5;
export const RANK_NUM_W = 90;
const PHOTO_W_BASE = 104;
const PHOTO_ASPECT = 3 / 4;
export const RANK_GUTTER = 18;

const AVAIL_H = CG_H - RANK_PAD_TOP - RANK_PAD_BOTTOM; // 630
export const ROW_H = (AVAIL_H - RANK_ROW_GAP * (RANK_ROW_COUNT - 1)) / RANK_ROW_COUNT; // 113.2
export const RANK_PHOTO_H = Math.min(PHOTO_W_BASE / PHOTO_ASPECT, ROW_H); // clamped to row height
export const RANK_PHOTO_W = RANK_PHOTO_H * PHOTO_ASPECT;

export const rowTopFor = (rank: number): number =>
  RANK_PAD_TOP + (rank - 1) * (ROW_H + RANK_ROW_GAP);

export const rankPhotoX = (): number => RANK_PAD_X + RANK_NUM_W + RANK_GUTTER;

export const rankPhotoY = (rank: number): number =>
  rowTopFor(rank) + (ROW_H - RANK_PHOTO_H) / 2;

export const rankBarLeft = (): number => rankPhotoX() + RANK_PHOTO_W + RANK_GUTTER;

export const rankBarFullW = (): number => CG_W - RANK_PAD_X - rankBarLeft();

// ── Bottom strip ───────────────────────────────────────────────
export const STRIP_PHOTO_H = 120;
export const STRIP_PHOTO_W = STRIP_PHOTO_H * PHOTO_ASPECT; // 90
export const STRIP_BOTTOM_Y = 990;
export const STRIP_GAP = 12;
export const STRIP_MAX_W = 1720;

// ── TOP 3 horizontal stage (ranks 1-3 横並び) ────────────────
// 同サイズの 3 枠を左から 1 位 / 2 位 / 3 位 の順で並べる。
// サイズは統一し、1 位だけ金枠の縁取り (boxShadow) で区別する。
const TOP3_STAGE_TOP = 320;
const TOP3_CARD_W = 380;
const TOP3_CARD_H = 506;
const TOP3_GAP = 56;
const TOP3_TOTAL_W = TOP3_CARD_W * 3 + TOP3_GAP * 2;
const TOP3_START_X = (CG_W - TOP3_TOTAL_W) / 2;

export interface Top3Pos {
  x: number;
  y: number;
  w: number;
  h: number;
  emphasize: boolean;
  nameSize: number;
  ptSize: number;
}

const top3PosFor = (slotIndex: number, emphasize: boolean): Top3Pos => ({
  x: TOP3_START_X + slotIndex * (TOP3_CARD_W + TOP3_GAP),
  y: TOP3_STAGE_TOP,
  w: TOP3_CARD_W,
  h: TOP3_CARD_H,
  emphasize,
  nameSize: 34,
  ptSize: 64,
});

export const TOP3_POS: Record<1 | 2 | 3, Top3Pos> = {
  1: top3PosFor(0, true),
  2: top3PosFor(1, false),
  3: top3PosFor(2, false),
};

export const TOP3_STAGE_BOTTOM = TOP3_STAGE_TOP + TOP3_CARD_H;

// ── Nominees grid ─────────────────────────────────────────────
export const NOM_PAD_TOP = 340;
export const NOM_PAD_X = 100;
export const NOM_GAP = 18;
export const NOM_AVAIL_W = CG_W - NOM_PAD_X * 2; // 1720
export const NOM_AVAIL_H = 640;

/** Compute nominees grid metrics for N nominees. */
export function nomineesGrid(count: number) {
  let cols = 4;
  for (let c = 4; c <= 8; c++) {
    const rows = Math.ceil(count / c);
    const cardW = (NOM_AVAIL_W - NOM_GAP * (c - 1)) / c;
    const cardH = cardW * (4 / 3) + 70;
    const totalH = cardH * rows + NOM_GAP * (rows - 1);
    cols = c;
    if (totalH <= NOM_AVAIL_H) break;
  }
  const cardW = (NOM_AVAIL_W - NOM_GAP * (cols - 1)) / cols;
  const photoW = cardW - 24;
  const photoH = photoW * (4 / 3);
  const cardH = photoH + 70;
  const rows = Math.ceil(count / cols);
  const totalW = cols * cardW + (cols - 1) * NOM_GAP;
  const startX = (CG_W - totalW) / 2 + 12;
  const startY = NOM_PAD_TOP + 12;
  return { cols, rows, photoW, photoH, cardW, cardH, gap: NOM_GAP, startX, startY };
}
