/**
 * 財務ダッシュボードの内訳 — 「読めなかった」を「0件」と言わない
 *
 * ⚠️ **内訳が 504 で落ちても、画面には「この期間の確定売上はありません。」としか
 * 出ていませんでした。** 合計（`monthly-summary`）だけが `ErrorPanel` に繋がっており、
 * 内訳3列は失敗しても「0件」に落ちるだけだったためです。
 * **失敗が嘘の 0 件になる**ので、見ている人は「本当に無い」と受け取ります。
 *
 * しかも既定では 5xx を2回リトライするので、**その嘘が最大3回ぶんの待ち時間**
 * 表示され続けていました。
 *
 * 画面の描き分けそのものは実ブラウザで確かめています（1列だけ 504 にして、
 * 「—件」＋断り＋読み直しボタンが出て、隣の列は普通の「0件」のまま）。
 * ここでは**その形が崩れていないか**を固定します。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const BREAKDOWN = read('client/src/contexts/finance/pages/financeDashboard/Breakdown.tsx');
const PAGE = read('client/src/contexts/finance/pages/BudgetDashboardPage.tsx');
const DATA = read('client/src/contexts/finance/pages/financeDashboard/useDashboardData.ts');

describe('件数は「数えられなかった」を表せる', () => {
  it('`totalCount` が `number | null`（0 と区別できる）', () => {
    expect(BREAKDOWN).toMatch(/totalCount: number \| null;/);
  });

  it('数えられていないときは「0件」と言わない', () => {
    expect(BREAKDOWN).toContain("totalCount === null ? '—件'");
  });

  it('数が分かっていないときは「全 N 件をここで見る」を出さない', () => {
    const line = BREAKDOWN.split('\n').find((l) => l.includes('const canToggle'));
    expect(line).toBeDefined();
    expect(line).toContain('totalCount !== null');
    expect(line).toContain('!error');
  });
});

describe('失敗したことを画面に出す', () => {
  it('明細が読めなかったときの断りと、読み直す手がある', () => {
    expect(BREAKDOWN).toContain('内訳を読み込めませんでした');
    expect(BREAKDOWN).toContain('この内訳をもう一度読み込む');
  });

  it('文言は `humanizeError` を通す（HTTP コードを画面に出さない決めごとを守る）', () => {
    expect(BREAKDOWN).toContain('humanizeError(error)');
  });

  /*
   * ⚠️ 3列同時に落ちると読み上げが3連発で割り込むので `alert` にしない。
   * 全面の `ErrorPanel` が既に `alert` を持っている。
   */
  it('読み上げは `status`（`alert` ではない）', () => {
    expect(BREAKDOWN).toContain('role="status"');
    expect(BREAKDOWN).not.toContain('role="alert"');
  });

  it('一部だけ落ちたときも黙らない（行は出しつつ断る）', () => {
    expect(BREAKDOWN).toContain('下の一覧はそれを除いた分です');
  });
});

describe('画面が各列に失敗を渡している', () => {
  for (const q of ['revenues', 'sga']) {
    it(`${q}: 失敗したら件数を null にし、例外と読み直しを渡す`, () => {
      expect(PAGE).toContain(`${q}.isError ? null :`);
      expect(PAGE).toContain(`error={${q}.error}`);
      expect(PAGE).toContain(`onRetry={() => ${q}.refetch()}`);
    });
  }

  /*
   * ⚠️ **仕入の列は2本のクエリの合成**（変動原価＋固定原価）。
   * 足し算のままだと、片方が落ちただけで**失敗を出したのに件数だけ嘘**になる。
   */
  it('仕入: 片方でも落ちたら件数を null にする', () => {
    expect(PAGE).toContain('purchases.isError || fixed.isError ? null :');
    expect(PAGE).toContain('error={purchases.error ?? fixed.error}');
    expect(PAGE).toContain("partialLabel={!purchases.isError && fixed.isError ? '固定原価' : undefined}");
  });
});

describe('内訳は早く失敗を見せる', () => {
  /*
   * 既定は 5xx で2回リトライ（`queryClient.ts`）。内訳は補助情報なので、
   * **エラーが出るまで最悪3回ぶん待たされる**より早く失敗を見せるほうがよい。
   * 合計（`summaryQuery`）は元から `retry: 1`。
   */
  it('内訳のクエリにも `retry: 1` が入っている（合計と揃える）', () => {
    expect((DATA.match(/retry: 1,/g) ?? []).length).toBe(5);
  });
});
