/**
 * ツリーを動かすときの計算だけ（画面を持たない純粋な関数）
 *
 * ドラッグでも「上へ／下へ」でも「別のページの下へ」でも、最後はここが返す
 * `WikiMoveOp[]` を `PATCH /wiki/pages/:id/move` に流すだけにしてあります。
 * 並べ替えの理屈を1か所に集めておくと、ドラッグだけ直してスマホの操作が
 * 置き去りになる、という形の食い違いが起きません。
 *
 * ── 並び順の数の持ち方 ──────────────────────────────────────
 *
 * サーバーは新しいページに `最大 + 10` を振ります（`wiki-write.service.ts` の
 * `SORT_STEP`）。間に差し込むときは**前後の中間の整数**を使います。
 *
 * ⚠️ **中間に整数が取れないときは、その親の子を 10 刻みで振り直します。**
 * 差し込みを繰り返すと隙間は 10 → 5 → 2 → 1 → 0 と詰まり、最後は
 * 「押しても動かない」という、利用者から見て原因の分からない状態になります。
 * 振り直しは呼び出しが数回に増えますが、隙間が戻るので一度きりで済みます。
 */
import type { WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';

/** サーバーの `SORT_STEP` と同じ値。ここを変えるときは両方そろえる */
export const SORT_STEP = 10;

/** 1回の移動で送るもの（`PATCH /wiki/pages/:id/move` の本体 ＋ 相手の id） */
export interface WikiMoveOp {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

/** 行のどこに落としたか */
export type WikiDropZone = 'before' | 'inside' | 'after';

/* ── 並びを取り出す ───────────────────────────────────────── */

/** 同じ親を持つ行を、画面と同じ順（並び順 → 題）に並べて返す */
export function siblingsOf(nodes: WikiTreeNode[], parentId: string | null): WikiTreeNode[] {
  return nodes
    .filter((n) => (n.parent_id ?? null) === parentId)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'ja'));
}

/**
 * そのページ自身と、その下にぶら下がる全部の id。
 * **自分の下へは移せない**（循環参照）ので、落とせる場所を決めるのに使います。
 * 親子が輪になっていても止まるよう、たどる回数を行数で頭打ちにしています。
 */
export function descendantIdsOf(nodes: WikiTreeNode[], id: string): Set<string> {
  const childrenOf = new Map<string | null, WikiTreeNode[]>();
  for (const n of nodes) {
    const key = n.parent_id ?? null;
    const list = childrenOf.get(key);
    if (list) list.push(n);
    else childrenOf.set(key, [n]);
  }
  const out = new Set<string>([id]);
  const queue = [id];
  for (let guard = 0; queue.length > 0 && guard <= nodes.length; guard += 1) {
    const cur = queue.shift()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      queue.push(child.id);
    }
  }
  return out;
}

/* ── どこに落としたか ─────────────────────────────────────── */

/**
 * 行の中の縦の位置から、上に差し込む／子にする／下に差し込む を決めます。
 * 上下それぞれ 1/4 ずつを「差し込む」、真ん中の半分を「子にする」にしています
 * （真ん中を広く取らないと、子にするのが当てにくい）。
 */
export function dropZoneOf(rect: { top: number; height: number }, clientY: number): WikiDropZone {
  if (rect.height <= 0) return 'inside';
  const ratio = (clientY - rect.top) / rect.height;
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}

/* ── 並べ替えの計画 ───────────────────────────────────────── */

/**
 * `parentId` の子の `toIndex` 番目に `dragId` を差し込む計画を立てます。
 *
 * 返りが空の配列なら「動かす必要が無い」（同じ場所に落とした）。
 * 1件なら差し込むだけ。複数件なら**隙間が詰まったので振り直した**ものです。
 */
export function planReorder(
  nodes: WikiTreeNode[],
  dragId: string,
  parentId: string | null,
  toIndex: number,
): WikiMoveOp[] {
  const rest = siblingsOf(nodes, parentId).filter((n) => n.id !== dragId);
  const at = Math.max(0, Math.min(toIndex, rest.length));
  const drag = nodes.find((n) => n.id === dragId);
  if (!drag) return [];

  const before = rest[at - 1];
  const after = rest[at];

  // 同じ親の、いまと同じ前後なら何もしない（押しても保存だけ走るのを防ぐ）
  if ((drag.parent_id ?? null) === parentId && sameNeighbours(nodes, drag, parentId, before, after)) {
    return [];
  }

  if (!before && !after) return [{ id: dragId, parent_id: parentId, sort_order: SORT_STEP }];
  if (!before) return [{ id: dragId, parent_id: parentId, sort_order: after.sort_order - SORT_STEP }];
  if (!after) return [{ id: dragId, parent_id: parentId, sort_order: before.sort_order + SORT_STEP }];

  const gap = after.sort_order - before.sort_order;
  if (gap >= 2) {
    return [{ id: dragId, parent_id: parentId, sort_order: before.sort_order + Math.floor(gap / 2) }];
  }

  // 中間の整数が取れない = 隙間が詰まっている。その親の子を 10 刻みで振り直す
  const ordered = [...rest.slice(0, at), drag, ...rest.slice(at)];
  return ordered
    .map((n, i) => ({ id: n.id, parent_id: parentId, sort_order: (i + 1) * SORT_STEP }))
    .filter((op) => op.id === dragId
      || nodes.find((n) => n.id === op.id)?.sort_order !== op.sort_order);
}

/** いまの前後が差し込み先の前後と同じか（= 動かす意味が無いか） */
function sameNeighbours(
  nodes: WikiTreeNode[],
  drag: WikiTreeNode,
  parentId: string | null,
  before: WikiTreeNode | undefined,
  after: WikiTreeNode | undefined,
): boolean {
  const now = siblingsOf(nodes, parentId);
  const i = now.findIndex((n) => n.id === drag.id);
  if (i < 0) return false;
  return (now[i - 1]?.id ?? null) === (before?.id ?? null)
    && (now[i + 1]?.id ?? null) === (after?.id ?? null);
}

/* ── 3つの操作 ────────────────────────────────────────────── */

/**
 * ドラッグで落としたとき。**自分自身・自分の下の階層には落とせません**
 * （落とせないときは空の配列を返します）。
 */
export function planDrop(
  nodes: WikiTreeNode[],
  dragId: string,
  targetId: string,
  zone: WikiDropZone,
): WikiMoveOp[] {
  if (dragId === targetId) return [];
  if (descendantIdsOf(nodes, dragId).has(targetId)) return [];
  const target = nodes.find((n) => n.id === targetId);
  if (!target) return [];

  if (zone === 'inside') {
    const children = siblingsOf(nodes, targetId).filter((n) => n.id !== dragId);
    return planReorder(nodes, dragId, targetId, children.length);
  }

  const parentId = target.parent_id ?? null;
  const rest = siblingsOf(nodes, parentId).filter((n) => n.id !== dragId);
  const i = rest.findIndex((n) => n.id === targetId);
  if (i < 0) return [];
  return planReorder(nodes, dragId, parentId, zone === 'before' ? i : i + 1);
}

/** 「上へ」「下へ」（同じ親の中で1つ動かす）。端まで来ていたら空の配列 */
export function planStep(nodes: WikiTreeNode[], id: string, dir: 'up' | 'down'): WikiMoveOp[] {
  const node = nodes.find((n) => n.id === id);
  if (!node) return [];
  const parentId = node.parent_id ?? null;
  const list = siblingsOf(nodes, parentId);
  const i = list.findIndex((n) => n.id === id);
  if (i < 0) return [];
  if (dir === 'up' && i === 0) return [];
  if (dir === 'down' && i === list.length - 1) return [];
  // 自分を抜いた並びでの差し込み先。上へ = 1つ前の位置、下へ = 1つ後ろの位置
  return planReorder(nodes, id, parentId, dir === 'up' ? i - 1 : i + 1);
}

/** 「別のページの下へ」（選んだ親のいちばん下に付ける） */
export function planReparent(
  nodes: WikiTreeNode[],
  id: string,
  parentId: string | null,
): WikiMoveOp[] {
  if (parentId && descendantIdsOf(nodes, id).has(parentId)) return [];
  const children = siblingsOf(nodes, parentId).filter((n) => n.id !== id);
  return planReorder(nodes, id, parentId, children.length);
}

/**
 * 行ごとに「上へ／下へ」を出せるかを**1回で**数える。
 *
 * ⚠️ 行の描き手から `planStep` を呼んで数えると、行の数 × 兄弟の数になります。
 * ドラッグ中は当たった行が変わるたびに全部の行を描き直すので、
 * 200ページのスペースでその形にすると指に付いてきません。
 */
export function stepAbilityOf(nodes: WikiTreeNode[]): Map<string, { up: boolean; down: boolean }> {
  const byParent = new Map<string | null, WikiTreeNode[]>();
  for (const n of nodes) {
    const key = n.parent_id ?? null;
    const list = byParent.get(key);
    if (list) list.push(n);
    else byParent.set(key, [n]);
  }
  const out = new Map<string, { up: boolean; down: boolean }>();
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'ja'));
    list.forEach((n, i) => out.set(n.id, { up: i > 0, down: i < list.length - 1 }));
  }
  return out;
}
