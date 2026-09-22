/**
 * ツリーの組み立て（画面を持たない計算だけ）
 *
 * サーバーは `wiki_pages` を平らな並びで返す（`idx_wiki_pages_tree` の順）。
 * 親子に組み直すのは画面の仕事。ここを部品にしておくと、ツリーの描き手が
 * 「開いている／閉じている」だけを持てばよくなる。
 */
import type { WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';

export interface WikiTreeItem extends WikiTreeNode {
  depth: number;
  children: WikiTreeItem[];
}

/**
 * 平らな並びを親子に組む。
 * **親が並びの中にいない行はスペース直下として扱う** — 親が下書きで返って
 * こなかった・権限で落ちた、といった理由で行ごと消えると、利用者には
 * 「ページが無くなった」としか見えないため。
 */
export function buildWikiTree(nodes: WikiTreeNode[]): WikiTreeItem[] {
  const byId = new Map<string, WikiTreeItem>();
  for (const n of nodes) byId.set(n.id, { ...n, depth: 0, children: [] });

  const roots: WikiTreeItem[] = [];
  for (const n of nodes) {
    const item = byId.get(n.id)!;
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    if (parent) parent.children.push(item);
    else roots.push(item);
  }

  const order = (a: WikiTreeItem, b: WikiTreeItem) =>
    a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'ja');

  // 深さは組んでから配る（親の深さが決まらないと子の深さが決まらない）
  const walk = (items: WikiTreeItem[], depth: number) => {
    items.sort(order);
    for (const it of items) {
      it.depth = depth;
      walk(it.children, depth + 1);
    }
  };
  walk(roots, 0);
  return roots;
}

/** 指定したページから上へ辿った親の id（自分は含めない）。開いた状態にするのに使う */
export function ancestorIdsOf(nodes: WikiTreeNode[], id: string | undefined): string[] {
  if (!id) return [];
  const parentOf = new Map(nodes.map((n) => [n.id, n.parent_id]));
  const out: string[] = [];
  let cur = parentOf.get(id) ?? null;
  // 親子が輪になっていても止まるように、辿る回数を行数で頭打ちにする
  for (let i = 0; cur && i <= nodes.length; i += 1) {
    out.push(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return out;
}

/** 開いている親の下だけを、描く順に平らにする */
export function flattenWikiTree(roots: WikiTreeItem[], expanded: Set<string>): WikiTreeItem[] {
  const out: WikiTreeItem[] = [];
  const walk = (items: WikiTreeItem[]) => {
    for (const it of items) {
      out.push(it);
      if (it.children.length > 0 && expanded.has(it.id)) walk(it.children);
    }
  };
  walk(roots);
  return out;
}
