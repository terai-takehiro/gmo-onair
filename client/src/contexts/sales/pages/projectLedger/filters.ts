/**
 * 案件台帳の絞り込み — 「何で絞るか」と「押したときにどう動くか」
 *
 * **画面の物を1つも import しません**（`editable.ts` / `csv.ts` と同じ理由 —
 * 試験からそのまま読めるようにするため）。状態を持つのは `useLedgerState` で、
 * ここにあるのは**決め方だけ**です。
 */

export interface LedgerFilters {
  search: string;
  stage: string;
  glsCategory: string;
  /**
   * 整合性チェックの鍵（`GET /projects/integrity` の `key`）。
   *
   * ⚠️ **サーバーで絞ります。** 以前この画面は「分類が入っていないものだけ」を
   * **画面側**で絞っていましたが、それでは**そのページの 100 件の中だけ**しか
   * 見られず、**全体で何件おかしいのかが分かりません** — 整合性を確かめるのが
   * この画面の目的の1つなので、数えるのも絞るのもサーバーの同じ式にしました
   * （`server/.../project-integrity.ts`）。
   */
  issue: string;
}

/** ⚠️ **既定は GLS-A**。この既定が下の `nextFiltersForIssue` の理由そのものです */
export const EMPTY_FILTERS: LedgerFilters = {
  search: '', stage: '', glsCategory: 'A', issue: '',
};

/**
 * 整合性チェックを選んだあとの絞り込み。
 *
 * ⚠️ **GLS の絞り込みを一緒に外します**（レビューでの指摘 #135・P1）。
 *
 * チェックの件数は**全案件**を数えています（`GET /projects/integrity` は
 * `gls_category` で絞りません）。一方この画面の**既定は GLS-A** です。
 * そのままチェックを掛けると2つの条件が **AND** で効くので、
 * **GLS-B を条件に持つチェック**（「GLS-B なのに2段分類が入っている」）は
 * `gls_category = 'B' AND gls_category = 'A'` になり、**必ず 0 行**になります。
 *
 * 画面には「3 件」と出ているのに開くと空、という形です。**数字が嘘なのか
 * 表が壊れているのかが読む人には分かりません**（しかも既定の絞り込みなので、
 * 自分で GLS-A を選んだ覚えもありません）。
 *
 * 逆に、自分で GLS-B を選んでいる人が「案件分類が入っていない」（GLS-A 条件）を
 * 押したときも同じ理由で空になるので、**どちらの向きもこれで塞がります**。
 *
 * **外すときは触りません** — チェックを外しただけで GLS の選択まで動くと、
 * 自分で選んだ絞り込みが勝手に戻ります。
 */
export function nextFiltersForIssue(cur: LedgerFilters, key: string): LedgerFilters {
  return { ...cur, issue: key, glsCategory: key ? '' : cur.glsCategory };
}
