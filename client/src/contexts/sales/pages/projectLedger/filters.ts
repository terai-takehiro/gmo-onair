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
   * プルダウンにまとめて見せているが、選ぶたびに `nextFiltersForCategorySelect`
   * が `numberSeries` も含めてまとめて書き換え、片方だけ残らないようにしている。
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
   * 計上会社（`projects.entity_code`・`''` は絞らない／`SCS` `GSS` `GMO`）。
   * 2026年10月の事業再編（`docs/reorg-2026-10-plan.md` §4.4）。値はサーバーが規則で導き、
   * 人が変えるのは管理者だけの改番経由（`client/CLAUDE.md` の「計上会社」）。
   * **サーバーで絞る**（`GET /projects?entity_code=`）— 画面で絞るとそのページの 100 件の中だけになる。
   */
  entityCode: string;
  /**
   * 案件番号の系列（`''` は絞らない／`'new'` は新番号すべて／`'SCS'` `'GSS'` `'GMO'`）。
   * 2026年10月の事業再編で `GLS-A###` / `GLS-B###` から `SCS-0001` / `GSS-0001` /
   * `GMO-0001` へ改番した（`docs/reorg-2026-10-plan.md` §4.4）。**A/B の1字は無くなり、
   * 会社の接頭辞そのものが分類を兼ねる**（旧A は SCS か GSS、旧B は GMO）ので、
   * 分類のプルダウンにこの系列を先に並べる。
   *
   * ⚠️ **計上会社（`entityCode`）とは別の軸。** `entity_code` は既存行がすべて `GSS` に
   * 埋まっている（migration 284）ので、「GSS の帳簿の案件」と「`GSS-` で始まる番号の案件」は
   * 一致しない — 前者は旧 `GLS-A###` を含む。ここは**番号そのもの**で絞る
   * （サーバーは `legal_entities.number_prefix` を正として `gls_number LIKE 'GSS-%'`）。
   */
  numberSeries: string;
}

/** 分類プルダウンの値。新番号の系列（先頭）→ 旧 GLS → 決算取込 → すべて */
export type CategorySelectValue = 'new' | 'SCS' | 'GSS' | 'GMO' | 'A' | 'B' | 'kessan' | 'all';

/** ⚠️ **既定は GLS-A**。この既定が下の `nextFiltersForIssue` の理由そのものです */
export const EMPTY_FILTERS: LedgerFilters = {
  search: '', stage: '', glsCategory: 'A', source: '', issue: '', entityCode: '', numberSeries: '',
};

/**
 * 分類プルダウン（新番号 SCS / GSS / GMO ／ GLS-A / GLS-B / 旧GLS / すべて）を
 * 選んだときの絞り込み。
 *
 * 見た目は1つのプルダウンだが、中身は `numberSeries`・`glsCategory`・`source` という
 * 別々の3つの鍵。ここで3つまとめて書き換えることで、
 * 「旧GLS を選んだのに前の GLS-B が残っていて 0 件になる」ような
 * 取り違えを防ぐ（`nextFiltersForIssue` が issue と glsCategory の
 * 組み合わせでやっているのと同じ考え方）。
 *
 * **新番号の系列（`SCS-` / `GSS-` / `GMO-`）を先頭に置く**（2026年10月の事業再編で
 * 発番が始まったため）。系列を選んだときは GLS-A/B の分類を必ず外す —
 * 新番号には A/B の1字が無く、AND で掛けると意図しない絞り込みになるため。
 */
export function nextFiltersForCategorySelect(
  cur: LedgerFilters, value: CategorySelectValue,
): LedgerFilters {
  if (value === 'kessan') return { ...cur, numberSeries: '', glsCategory: '', source: 'kessan' };
  if (value === 'all') return { ...cur, numberSeries: '', glsCategory: '', source: '' };
  if (value === 'A' || value === 'B') return { ...cur, numberSeries: '', glsCategory: value, source: '' };
  return { ...cur, numberSeries: value, glsCategory: '', source: '' };
}

/**
 * いま選ばれているプルダウンの値。**画面で組み立てない** —
 * 3つの鍵から1つの見た目の値へ戻す決め方は、書き換える側
 * （`nextFiltersForCategorySelect`）と必ず対で読めるところに置く。
 */
export function categorySelectValue(f: LedgerFilters): CategorySelectValue {
  if (f.numberSeries) return f.numberSeries as CategorySelectValue;
  if (f.source === 'kessan') return 'kessan';
  if (f.glsCategory === 'A' || f.glsCategory === 'B') return f.glsCategory;
  return 'all';
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
  return {
    ...cur,
    issue: key,
    glsCategory: key ? '' : cur.glsCategory,
    // 番号の系列も同じ理由で外す（チェックの件数は全案件を数えているので、
    // 系列と AND で掛けると「3 件」と出ているのに開くと空、が起きる）
    numberSeries: key ? '' : cur.numberSeries,
  };
}
