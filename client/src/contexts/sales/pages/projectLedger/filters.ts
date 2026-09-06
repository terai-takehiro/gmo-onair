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
   * 旧GLS（決算取込）の行だけに絞る鍵。**サーバーは前から受けている**
   * （`kessan_marker IS NOT NULL`・`source=kessan`）が、旧GLS決算取込画面を
   * 案件台帳へ統合したときは「取込が終わった今は使う理由が無い」と判断して
   * 画面には持ち込んでいなかった。取込済みの行を後から探したいという声を受けて
   * 絞り込み欄に足す。値は `''`（絞らない）か `'kessan'`。
   *
   * **`glsCategory` とは別の軸。** 決算取込の行にも GLS-A / GLS-B は付く
   * （migration 203 でバックフィル済）ので、2つを同時に AND で掛けると
   * 「旧GLS かつ GLS-B」のような意図しない絞り込みになる。1つの見た目上の
   * プルダウンで4択に見せているが、選ぶたびに `nextFiltersForCategorySelect`
   * が両方をまとめて書き換え、片方だけ残らないようにしている。
   */
  source: string;
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
  /**
   * 事業主体（`projects.entity`・`''` は絞らない／`gss` `gscs` `gig`）。
   * 主体はお客様の区分から自動で決まり、人格（gig）だけ人が付ける（`client/CLAUDE.md` の「事業主体」）。
   * **サーバーで絞る**（`GET /projects?entity=`）— 画面で絞るとそのページの 100 件の中だけになる。
   */
  entity: string;
}

/** ⚠️ **既定は GLS-A**。この既定が下の `nextFiltersForIssue` の理由そのものです */
export const EMPTY_FILTERS: LedgerFilters = {
  search: '', stage: '', glsCategory: 'A', source: '', issue: '', entity: '',
};

/**
 * 分類プルダウン（GLS-A / GLS-B / 旧GLS / どちらも）を選んだときの絞り込み。
 *
 * 見た目は1つのプルダウンだが、中身は `glsCategory` と `source` という
 * 別々の2つの鍵。ここで両方をまとめて書き換えることで、
 * 「旧GLS を選んだのに前の GLS-B が残っていて 0 件になる」ような
 * 取り違えを防ぐ（`nextFiltersForIssue` が issue と glsCategory の
 * 組み合わせでやっているのと同じ考え方）。
 */
export function nextFiltersForCategorySelect(
  cur: LedgerFilters, value: 'A' | 'B' | 'kessan' | 'all',
): LedgerFilters {
  if (value === 'kessan') return { ...cur, glsCategory: '', source: 'kessan' };
  if (value === 'all') return { ...cur, glsCategory: '', source: '' };
  return { ...cur, glsCategory: value, source: '' };
}

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
