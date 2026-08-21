// 制作資料 (Qシート) — セルの参照方式 `blk.<type>#<n>` (blockRef)。
//
// Excel の中や AI とのやり取りなど、その場限りの1往復でだけ使う識別子。
// blocks[] の id (`scenario` / `blk_xxx` など) は人が読んでも型が分からないため、
// 「type ごとに何本目か」で人間可読な参照を作る。**保存はしない**
// (blocks[] を並べ替えると ref が変わるため、その都度 blocks[] から作り直す)。
//
// この段 (00) では純関数とテストだけを置く。画面はまだこれを呼ばない
// (呼び出し側は 03 の Excel / 04 の AI 提案などで追加される)。
import { type BlockType, isBlockType } from "./blockTypes";

export interface BlockLike {
  id: string;
  type: string;
  [key: string]: unknown;
}

/** blocks[] 内で type ごとに 1-origin で採番した blockId → ref のテーブルを作る。 */
export function blockRefTable(blocks: BlockLike[] | null | undefined): Map<string, string> {
  const counts = new Map<string, number>();
  const table = new Map<string, string>();
  for (const b of blocks || []) {
    if (!b?.id || !b?.type) continue;
    const n = (counts.get(b.type) ?? 0) + 1;
    counts.set(b.type, n);
    table.set(b.id, `blk.${b.type}#${n}`);
  }
  return table;
}

/** 単一の block の ref (`blk.<type>#<n>`) を得る。見つからなければ null。 */
export function blockRefOf(blockId: string, blocks: BlockLike[] | null | undefined): string | null {
  return blockRefTable(blocks).get(blockId) ?? null;
}

/** ref (`blk.<type>#<n>`) から blockId を逆引きする。範囲外・不正な ref は null。 */
export function resolveBlockRef(ref: string, blocks: BlockLike[] | null | undefined): string | null {
  const m = /^blk\.([a-z_]+)#(\d+)$/.exec(ref);
  if (!m) return null;
  const [, type, nStr] = m;
  if (!isBlockType(type)) return null;
  const n = parseInt(nStr, 10);
  if (!n || n < 1) return null;
  let count = 0;
  for (const b of blocks || []) {
    if (b?.type !== (type as BlockType)) continue;
    count++;
    if (count === n) return b.id ?? null;
  }
  return null;
}
