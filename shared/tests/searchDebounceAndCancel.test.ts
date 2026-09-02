/**
 * 台帳の絞り込み — 打鍵ごとに問い合わせない／中断をエラーにしない
 *
 * ⚠️ **中断の扱いを間違えると「絞り込むたびにエラーが出る画面」になります。**
 * 中断された通信は HTTP の状態を持たないので、`queryClient` の retry 判定では
 * **4xx に当たらず2回リトライ**され、3回失敗したあと `ErrorPanel` が
 * `status === undefined` の枝を選んで**「通信ができませんでした。ネットワークを
 * 確かめて…」**と出します。しかも**打鍵のたびに起きる**ので、画面としては壊れて見えます。
 *
 * ここは DB もブラウザも使わずに、その2点だけを固定します。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCanceled } from '../src/client/isCanceled';
import { humanizeError } from '../src/client/states/ErrorPanel';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('中断の見分け', () => {
  it('axios / fetch / DOM のどの形でも中断と分かる', () => {
    expect(isCanceled({ code: 'ERR_CANCELED' })).toBe(true);   // axios 1.x
    expect(isCanceled({ name: 'CanceledError' })).toBe(true);
    expect(isCanceled({ name: 'AbortError' })).toBe(true);     // 素の fetch
  });

  it('本物の失敗を中断と取り違えない', () => {
    expect(isCanceled({ message: 'Network Error' })).toBe(false);
    expect(isCanceled({ response: { status: 500 } })).toBe(false);
    expect(isCanceled(null)).toBe(false);
    expect(isCanceled(undefined)).toBe(false);
  });
});

describe('中断は画面のエラーにしない', () => {
  it('「通信ができませんでした」に丸めない', () => {
    const cancelled = humanizeError({ code: 'ERR_CANCELED', message: 'canceled' });
    expect(cancelled.cause).not.toBe('通信ができませんでした。');
    expect(cancelled.cause).toContain('中断');
  });

  it('本物の通信断は今までどおり', () => {
    expect(humanizeError({ message: 'Network Error' }).cause).toBe('通信ができませんでした。');
  });

  it('retry の判定が中断を最初に外している', () => {
    // ⚠️ 順番が肝。`status` を見る行より**前**で中断を落とさないと、
    // 4xx 判定に当たらず2回リトライされる
    const src = read('shared/src/client/queryClient.ts');
    const body = src.slice(src.indexOf('retry: (failureCount'), src.indexOf('retryDelay:'));
    expect(body).toContain('isCanceled(error)');
    expect(body.indexOf('isCanceled(error)')).toBeLessThan(body.indexOf('response?.status'));
  });
});

describe('打鍵ごとに問い合わせない', () => {
  const CRUD = read('shared/src/client/hooks/useCrudPage.ts');
  const REVENUE = read('client/src/contexts/finance/pages/RevenueListPage.tsx');

  it('問い合わせの鍵には遅らせた値を使う（即時の値を入れない）', () => {
    const key = CRUD.slice(CRUD.indexOf('queryKey: [...options.queryKey'), CRUD.indexOf('queryFn:'));
    expect(key).toContain('search: appliedSearch');
    // ⚠️ 両方入れると遅らせた意味が消える
    expect(key).not.toMatch(/[^d]\bsearch,/);
  });

  it('送るパラメータも遅らせた値', () => {
    expect(CRUD).toContain('if (appliedSearch) params[searchParam] = appliedSearch;');
  });

  it('前の一覧を消さない（打鍵のたびに骨組みへ戻らない）', () => {
    expect(CRUD).toContain('placeholderData: (prev) => prev');
    expect(REVENUE).toContain('placeholderData: (prev) => prev');
  });

  it('`signal` を axios に渡している', () => {
    expect(CRUD).toMatch(/queryFn: async \(\{ signal \}\)/);
    expect(CRUD).toMatch(/api\.get\(options\.endpoint, \{ params, signal \}\)/);
    expect(REVENUE).toMatch(/queryFn: async \(\{ signal \}\)/);
    expect(REVENUE).toMatch(/\{ params, signal \}/);
  });

  /*
   * ⚠️ **`AbortController` を自分で作らないこと。** 作ると axios の中断が
   * 普通の失敗として react-query に届き、2回リトライされたうえでエラー表示になる。
   */
  it('自前の AbortController を作っていない', () => {
    for (const [name, src] of [['useCrudPage', CRUD], ['RevenueListPage', REVENUE]] as const) {
      expect(src.includes('new AbortController'), name).toBe(false);
    }
  });

  it('売上台帳も直っている（`useCrudPage` を使っていないので取り残されやすい）', () => {
    expect(REVENUE).toContain('const appliedSearch = useDebounced(');
    expect(REVENUE).toMatch(/queryKey: \['revenues-all', page, appliedSearch/);
  });
});

describe('「0件でした」は遅らせた値で判定する', () => {
  /*
   * ⚠️ 即時の値で判定すると、**まだ問い合わせていない言葉で「該当なし」**が
   * 一瞬出る（前の一覧を残すようにしたので、なおさら目立つ）。
   */
  const PAGES = [
    'client/src/contexts/finance/pages/PurchaseListPage.tsx',
    'client/src/contexts/finance/pages/SgaListPage.tsx',
    'client/src/contexts/finance/pages/CounterpartyPage.tsx',
    'client/src/contexts/sales/pages/CompanyListPage.tsx',
  ];

  for (const p of PAGES) {
    it(`${p.split('/').pop()}: 結果を語る場所が appliedSearch`, () => {
      const src = read(p);
      expect(src).toMatch(/keyword=\{crud\.appliedSearch\}/);
      expect(src).not.toMatch(/keyword=\{crud\.search\}/);
    });
  }

  it('入力欄が読む値は即時のまま（打鍵が遅れて見えないこと）', () => {
    /*
     * 入力欄まで遅らせると別の不具合になる。
     * ⚠️ 台帳の絞り込みは `LedgerFilterBar` に畳んだので、渡し方が JSX の属性
     * (`value={...}`) から object の項目 (`value: ...`) に変わっている。
     * **見たいのは書き方ではなく「入力欄へ渡すのが即時の値か」**なので、
     * どちらの形でも通し、`appliedSearch` を渡していないことだけを固定する。
     */
    expect(read(PAGES[0])).toMatch(/value(=\{|:\s*)crud\.search[\s,}]/);
    expect(read(PAGES[0])).not.toMatch(/value(=\{|:\s*)crud\.appliedSearch[\s,}]/);
    expect(read('client/src/contexts/finance/pages/RevenueListPage.tsx')).toMatch(/value(=\{|:\s*)search[\s,}]/);
  });

  it('畳んだ絞り込みの部品も、渡された即時の値をそのまま入力欄に入れている', () => {
    // 上の3画面は `LedgerFilterBar` 越しに渡すので、ここが繋がっていないと意味がない
    const BAR = read('client/src/contexts/finance/pages/ledger/LedgerFilterBar.tsx');
    expect(BAR).toMatch(/value=\{p\.search\.value\}/);      // PC (LedgerSearch)
    expect(BAR).toMatch(/search=\{p\.search\}/);             // スマホ (MobileFilterBar)
  });
});
