/**
 * 台帳の表頭クリック並べ替え（③ 売上／④ 仕入／⑤ 販管費で共通） (2026-09 依頼)
 *
 * 「各列の内容で昇順・降順の並び替えができるようにしてほしい」というご要望に
 * 応えて足した。サーバーはすでに並べ替えを受け付けられる状態だった
 * （`server/src/contexts/finance/list-query.ts` の `build{Revenue,Purchase,Sga}Order`）
 * のに、3画面ともクエリに `sort` を渡していなかっただけ——ここはその配線と、
 * 案件一覧（`projectList/FilterBar.tsx`）と同じ表頭クリックの作法を提供する。
 *
 * ⚠️ **`sort` の値は `${sort_by}:${sort_dir}` ではなくサーバーの生キー
 * （`{列}_asc`/`{列}_desc`）をそのまま持つ。** 案件一覧はプルダウンとヘッダーで
 * `sort` を共有するため独自の `by:dir` 形式に変換しているが、台帳にプルダウンは
 * 無く、サーバーのキー自体がすでに「列＋向き」の形をしているので、変換の層を
 * 増やさずそのまま state に置く。
 */

/** 表頭に出す並べ替え印。`key` が空（＝この列にサーバー側の並べ替えキーが無い）なら常に印なし */
export function ledgerSortMark(sort: string, key: string): 'asc' | 'desc' | null {
  if (!key) return null;
  if (sort === `${key}_asc`) return 'asc';
  if (sort === `${key}_desc`) return 'desc';
  return null;
}

/**
 * 表頭を押したときの次の `sort` 値。同じ列なら 昇順→降順→既定（空文字＝
 * サーバーの既定順）の3段で回す（案件一覧・案件台帳と同じ3段トグル）。
 */
export function nextLedgerSort(sort: string, key: string): string {
  if (sort === `${key}_asc`) return `${key}_desc`;
  if (sort === `${key}_desc`) return '';
  return `${key}_asc`;
}
