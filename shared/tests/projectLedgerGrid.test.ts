/**
 * 案件台帳の升目編集 — レビューで見つかった5つの穴を固定する
 *
 * ── なぜこの5つをまとめて固定するか ────────────────────────
 *
 * どれも**取り消せない書き換え**の入口にあり、しかも**画面を見ても
 * 間違いに気づけない**形でした（Codex のレビュー #127 / #135）:
 *
 *  ① 選んだ升目が**行と列の番号**なので、ページ送り・並べ替え・絞り込みで
 *    中身が入れ替わっても番号だけ残り、**別の案件に貼る**（P1）
 *  ② 整合性チェックが既定の GLS 絞り込みと AND になり、
 *    **件数は出ているのに表は必ず空**（P1）
 *  ③ 表からはみ出した貼り付けを**黙って捨てる**
 *  ④ 候補が **100 件で頭打ち**（`extractPagination` の丸め）なので、
 *    101 番目以降の担当・取引先が**実在するのに「いません」**
 *  ⑤ `2026-02-31` のような**カレンダーに無い日**が通る
 *
 * **①③④は「黙って」が本体です。** 捨てること・切れること自体より、
 * それが画面のどこにも出ないことが問題でした。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  outOfBoundsOf, parseCell, toIsoDate, type ParseCtx,
} from '../../client/src/contexts/sales/pages/projectLedger/editable';
import {
  nextFiltersForIssue, nextFiltersForCategorySelect, type LedgerFilters,
} from '../../client/src/contexts/sales/pages/projectLedger/filters';

const ROOT = join(__dirname, '../..');
const readSrc = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/**
 * 注釈を落として読む。
 *
 * ⚠️ **「もう書いていないこと」を見る検査は、必ずこちらを使うこと。**
 * この製品は**なぜそう書かないのかを注釈に残す**決めごとなので、
 * 素の本文で見ると「`setFilter('issue'…)` を直接呼ばないこと」という
 * **正しい注意書き**に当たって落ちます（実際に落ちた）。
 * `droppedColumns.test.ts` が `--` を落としているのと同じ理由です。
 */
const readCode = (p: string) => readSrc(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ───────────────────────────────────────────────────────
// ① 表が入れ替わったら選択を捨てる（P1）
// ───────────────────────────────────────────────────────

describe('① 選んだ升目は、表の中身が入れ替わったら捨てる', () => {
  const hook = readSrc('client/src/contexts/sales/pages/projectLedger/useLedgerGrid.ts');

  it('行・列・モードが変わったら選択を捨てる効果がある', () => {
    expect(hook).toMatch(/useEffect\(\(\) => \{\s*setAnchor\(null\); setRange\(null\); setEditing\(null\);\s*\}, \[gridKey\]\)/);
  });

  it('鍵は「id の並び」で作る（配列の同一性で見ない）', () => {
    /*
     * ⚠️ ここを配列の同一性（`[rows]`）にすると、**書き換えたあとの引き直しで
     * 毎回別の配列が返る**ので選択が毎回消え、続けて直せなくなります。
     * 中身（id の並び）で見れば、同じ行が返ってきたときは消えません。
     */
    expect(hook).toMatch(/rows\.map\(\(r\) => r\.id\)\.join\(','\)/);
    expect(hook).toMatch(/shown\.join\(','\)/);
    expect(hook).toMatch(/canEdit \? 'e' : 'v'/);
  });
});

// ───────────────────────────────────────────────────────
// ② 整合性チェック × GLS の絞り込み（P1）
// ───────────────────────────────────────────────────────

describe('② 整合性チェックを押したら GLS の絞り込みを外す', () => {
  const BASE: LedgerFilters = { search: '', stage: '', glsCategory: 'A', source: '', issue: '' };

  it('GLS-B のチェックを押すと、既定の GLS-A が外れる（これが無いと必ず 0 行）', () => {
    const next = nextFiltersForIssue(BASE, 'gls_b_with_classification');
    expect(next.issue).toBe('gls_b_with_classification');
    expect(next.glsCategory).toBe('');
  });

  it('反証: 外さない版だと GLS-B のチェックが GLS-A と AND になる', () => {
    // 前の版と同じ動き（`setFilter('issue', …)` は issue だけ変える）
    const old = { ...BASE, issue: 'gls_b_with_classification' };
    expect(old.glsCategory).toBe('A');
    // サーバーの条件は `gls_category = 'B'`。'A' と AND になるので当たる行は無い
    expect(old.glsCategory === 'B').toBe(false);
  });

  it('自分で GLS-B を選んでいる人が GLS-A のチェックを押しても空にならない', () => {
    const next = nextFiltersForIssue({ ...BASE, glsCategory: 'B' }, 'no_classification');
    expect(next.glsCategory).toBe('');
  });

  it('チェックを外すときは GLS を触らない（自分で選んだ絞り込みを戻さない）', () => {
    const on = nextFiltersForIssue({ ...BASE, glsCategory: 'B' }, 'no_classification');
    const off = nextFiltersForIssue({ ...on, glsCategory: 'B' }, '');
    expect(off.issue).toBe('');
    expect(off.glsCategory).toBe('B');
  });

  it('ほかの絞り込みは持ち越す（探している言葉を消さない）', () => {
    const next = nextFiltersForIssue({ ...BASE, search: '発表会', stage: 'a_won' }, 'won_no_gls');
    expect(next.search).toBe('発表会');
    expect(next.stage).toBe('a_won');
  });

  it('画面は `pickIssue` を呼ぶ（`setFilter(\'issue\'…)` を直接呼ばない）', () => {
    const page = readCode('client/src/contexts/sales/pages/ProjectLedgerPage.tsx');
    expect(page).toMatch(/onPick=\{s\.pickIssue\}/);
    expect(page).not.toMatch(/setFilter\('issue'/);
  });
});

// ───────────────────────────────────────────────────────
// ⑥ 分類プルダウン（GLS-A / GLS-B / 旧GLS / どちらも）
// ───────────────────────────────────────────────────────

describe('⑥ 分類プルダウンは glsCategory と source を1つの4択として書き換える', () => {
  const BASE: LedgerFilters = { search: '', stage: '', glsCategory: 'A', source: '', issue: '' };

  it('「旧GLS」を選ぶと source=kessan になり、glsCategory は外れる', () => {
    const next = nextFiltersForCategorySelect(BASE, 'kessan');
    expect(next.source).toBe('kessan');
    expect(next.glsCategory).toBe('');
  });

  it('旧GLS を選んでいる状態から GLS-B を選ぶと、source が残らない', () => {
    // 決算取込の行にも GLS-A / GLS-B は付く（migration 203）ので、
    // source を残したままだと「GLS-B のはずが旧GLSだけ」になる
    const kessan = nextFiltersForCategorySelect(BASE, 'kessan');
    const next = nextFiltersForCategorySelect(kessan, 'B');
    expect(next.glsCategory).toBe('B');
    expect(next.source).toBe('');
  });

  it('「どちらも」を選ぶと両方外れる', () => {
    const kessan = nextFiltersForCategorySelect(BASE, 'kessan');
    const next = nextFiltersForCategorySelect(kessan, 'all');
    expect(next.glsCategory).toBe('');
    expect(next.source).toBe('');
  });

  it('画面は `pickCategory` を呼ぶ（`setFilter(\'glsCategory\'…)` を直接呼ばない）', () => {
    // 分類のプルダウンは絞り込みの帯 `LedgerFilterBar.tsx` にある（ページから切り出した）。直接呼ばないことは両方で見る
    const bar = readCode('client/src/contexts/sales/pages/projectLedger/LedgerFilterBar.tsx');
    const page = readCode('client/src/contexts/sales/pages/ProjectLedgerPage.tsx');
    expect(bar).toMatch(/onValueChange=\{\(v\) => s\.pickCategory/);
    expect(bar).not.toMatch(/setFilter\('glsCategory'/);
    expect(page).not.toMatch(/setFilter\('glsCategory'/);
  });
});

// ───────────────────────────────────────────────────────
// ③ 表からはみ出した貼り付け
// ───────────────────────────────────────────────────────

describe('③ 表からはみ出した貼り付けを黙って捨てない', () => {
  const grid = (r: number, c: number) =>
    Array.from({ length: r }, () => Array.from({ length: c }, () => 'x'));

  it('収まっていれば null（出すものが無い）', () => {
    expect(outOfBoundsOf(grid(3, 2), { row: 0, col: 0 }, 10, 5)).toBeNull();
    // ちょうど端まで使い切る場合も収まっている
    expect(outOfBoundsOf(grid(3, 2), { row: 7, col: 3 }, 10, 5)).toBeNull();
  });

  it('指摘の例: 100 行の表の 95 行目に 20 行貼ると 15 行はみ出す', () => {
    expect(outOfBoundsOf(grid(20, 1), { row: 95, col: 0 }, 100, 5))
      .toEqual({ rows: 15, cols: 0 });
  });

  it('右にもはみ出す（出す列が少ないとき）', () => {
    expect(outOfBoundsOf(grid(1, 6), { row: 0, col: 2 }, 10, 5))
      .toEqual({ rows: 0, cols: 3 });
  });

  it('行の長さが揃っていなくても、いちばん長い行で数える', () => {
    const ragged = [['a'], ['a', 'b', 'c', 'd']];
    expect(outOfBoundsOf(ragged, { row: 0, col: 0 }, 10, 2))
      .toEqual({ rows: 0, cols: 2 });
  });

  it('下見が持ち帰り、画面が出す', () => {
    const hook = readSrc('client/src/contexts/sales/pages/projectLedger/useLedgerGrid.ts');
    expect(hook).toMatch(/outOfBounds/);
    const dlg = readSrc('client/src/contexts/sales/pages/projectLedger/PastePlanDialog.tsx');
    expect(dlg).toContain('表からはみ出しています');
    expect(dlg).toContain('はみ出したぶんは書き込みません');
  });
});

// ───────────────────────────────────────────────────────
// ④ 候補が 100 件で頭打ち
// ───────────────────────────────────────────────────────

describe('④ 候補は最後のページまで集める', () => {
  const fetcher = readSrc('client/src/contexts/sales/pages/projectLedger/fetchAllNamed.ts');
  /** 「もう書いていないこと」を見るとき用（注釈を落とす） */
  const pageCode = readCode('client/src/contexts/sales/pages/ProjectLedgerPage.tsx');

  it('サーバーが 100 に丸めることを前提にしている', () => {
    const pag = readSrc('server/src/shared/services/pagination.ts');
    expect(pag).toMatch(/Math\.min\(100,/);
    expect(fetcher).toMatch(/const PER_PAGE = 100/);
  });

  it('`totalPages` まで、または空が返るまでたどる', () => {
    expect(fetcher).toMatch(/page >= totalPages/);
    expect(fetcher).toMatch(/batch\.length === 0/);
  });

  it('打ち切ったことを返す（黙って切らない）', () => {
    expect(fetcher).toMatch(/truncated: true/);
    expect(readSrc('client/src/contexts/sales/pages/projectLedger/LookupNotices.tsx'))
      .toContain('途中まで');
  });

  it('画面は `?limit=200` `?limit=500` を投げない（丸められて効かない）', () => {
    expect(pageCode).not.toMatch(/limit=200|limit=500/);
  });

  it('鍵を他の画面と分けている（同じ鍵に別の形を入れない）', () => {
    // `['users-list']` は案件作成と販管費、`['customers-for-new-project']` は
    // 案件作成が使っており、**応答そのもの**を入れている。行の配列を入れると壊れる
    const hookCode = readCode('client/src/contexts/sales/pages/projectLedger/useLedgerLookups.ts');
    expect(hookCode).toMatch(/'ledger-users-all'/);
    expect(hookCode).toMatch(/'ledger-customers-all'/);
    expect(hookCode).not.toMatch(/'users-list'|'customers-for-new-project'/);
    // 画面の側も、古い鍵を引き直していないこと
    expect(pageCode).not.toMatch(/'users-list'|'customers-for-new-project'/);
  });

  it('引き終わるまで名前の列は直せない（実在するのに「いません」と言わない）', () => {
    const hook = readSrc('client/src/contexts/sales/pages/projectLedger/useLedgerGrid.ts');
    // **列ごとに見る**（片方が落ちても、引けたほうは直せる・#146）
    expect((hook.match(/if \(nameCol && !lookupsReady\[nameCol\]\)/g) ?? []).length).toBe(2);
    expect(readSrc('client/src/contexts/sales/pages/projectLedger/LookupNotices.tsx'))
      .toContain('候補を読み込んでいます');
    // **引く気が無いときは `true`**（読むだけの人に永久に帯を出さない）
    const lookups = readSrc('client/src/contexts/sales/pages/projectLedger/useLedgerLookups.ts');
    expect(lookups).toMatch(/users: !enabled \|\| usersQ\.isSuccess/);
    expect(lookups).toMatch(/customers: !enabled \|\| customersQ\.isSuccess/);
  });
});

// ───────────────────────────────────────────────────────
// ⑤ カレンダーに無い日
// ───────────────────────────────────────────────────────

describe('⑤ カレンダーに無い日を通さない', () => {
  it('指摘の例: 2026-02-31 / 2026-04-31 は通らない', () => {
    expect(toIsoDate('2026-02-31')).toBeNull();
    expect(toIsoDate('2026-04-31')).toBeNull();
    expect(toIsoDate('2026-06-31')).toBeNull();
    expect(toIsoDate('2026-09-31')).toBeNull();
    expect(toIsoDate('2026-11-31')).toBeNull();
  });

  it('反証: 「日は 1〜31」だけを見る版だと通ってしまう', () => {
    const oldRule = (mm: number, dd: number) => !(mm < 1 || mm > 12 || dd < 1 || dd > 31);
    expect(oldRule(2, 31)).toBe(true);      // 前の版はこれで通していた
    expect(toIsoDate('2026-02-31')).toBeNull();
  });

  it('月末は通る（1日ずれて弾かない）', () => {
    expect(toIsoDate('2026-01-31')).toBe('2026-01-31');
    expect(toIsoDate('2026-04-30')).toBe('2026-04-30');
    expect(toIsoDate('2026-02-28')).toBe('2026-02-28');
  });

  it('閏年の 2/29 は通り、平年は通らない', () => {
    expect(toIsoDate('2024-02-29')).toBe('2024-02-29');   // 4 で割れる
    expect(toIsoDate('2026-02-29')).toBeNull();           // 平年
    expect(toIsoDate('2000-02-29')).toBe('2000-02-29');   // 400 で割れる
    expect(toIsoDate('1900-02-29')).toBeNull();           // 100 で割れて 400 で割れない
  });

  it('揺れた書き方でも同じように見る（Excel から来る形）', () => {
    expect(toIsoDate('2026/2/31')).toBeNull();
    expect(toIsoDate('2026年2月31日')).toBeNull();
    expect(toIsoDate('2026/2/28')).toBe('2026-02-28');
  });

  it('断る理由を分ける（形が違うのか、その日が無いのか）', () => {
    const ctx: ParseCtx = { users: [], customers: [], combos: [] };
    const noDay = parseCell('event_start', '2026-02-31', ctx);
    expect(noDay.ok).toBe(false);
    expect(noDay.ok === false && noDay.why).toContain('カレンダーに無い日');

    const noShape = parseCell('event_start', '来週', ctx);
    expect(noShape.ok).toBe(false);
    expect(noShape.ok === false && noShape.why).toContain('2026-08-15 の形');
  });
});

// ───────────────────────────────────────────────────────
// ⑥ 候補が引けなかったとき（レビューでの指摘 #146）
// ───────────────────────────────────────────────────────

describe('⑥ 候補が引けなかったら、待たせずにやり直させる', () => {
  const lookups = readSrc('client/src/contexts/sales/pages/projectLedger/useLedgerLookups.ts');
  const notices = readSrc('client/src/contexts/sales/pages/projectLedger/LookupNotices.tsx');

  it('引けたかを列ごとに持つ（片方の失敗で両方を止めない）', () => {
    expect(lookups).toMatch(/ready: \{\s*users:/);
    expect(lookups).toMatch(/failed: \{\s*users:/);
  });

  it('失敗を「まだ引いている」と混ぜない（永久に読み込み中にしない）', () => {
    expect(lookups).toMatch(/isError/);
    // 帯は「引いている」と「引けなかった」を別に出す
    expect(notices).toContain('候補を読み込んでいます');
    expect(notices).toContain('読み込めませんでした');
    expect(notices).toMatch(/loading && !broken/);
  });

  it('やり直せる（待っても直らないので）', () => {
    expect(lookups).toMatch(/retry: \(\) =>[\s\S]*?refetch\(\)/);
    expect(notices).toContain('やり直す');
  });

  it('落ちた列だけ名指しする（引けたほうを巻き添えにしない）', () => {
    expect(notices).toMatch(/failed\.users && '社内の担当'/);
    expect(notices).toMatch(/failed\.customers && 'お客様'/);
  });
});
