/**
 * **「入金待ち」が指す集合を1つにする**（レビューでの指摘 #125）
 *
 * ── なぜ試験を書くか ────────────────────────────────────────
 *
 * ⚠️ **これは「それらしい数字が出る」種類の間違いです。**
 * 同じ `state=unpaid` が口によって違う集合を指していても、どちらの画面にも
 * **ちゃんとした件数が出ます**。気づくのは2つの画面を並べて数えたときか、
 * 出していない請求に入金日が入っているのを月末に見つけたときだけです。
 *
 * ここで見るのは**式そのもの**（`BILLING_STATE_SQL`）と、
 * **式を書き写している口が無いこと**（3つの口が同じ1つを読む）の2つです。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { BILLING_STATE_SQL, billingStateSql } from '../../server/src/shared/services/billing-state';

const SERVER = join(__dirname, '..', '..', 'server', 'src');

/** 注釈を外してから探す（この製品は前の版の形を説明として残す決めごと） */
function readCode(...parts: string[]): string {
  return readFileSync(join(SERVER, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('言葉の中身', () => {
  it('**入金待ち = 請求書を出したのに入金がまだ**（出していないものは入らない）', () => {
    expect(BILLING_STATE_SQL.unpaid).toBe('r.invoice_issued = true AND r.paid_date IS NULL');
  });

  it('⚠️ 未請求は `false` と `NULL` の両方を拾う', () => {
    // `invoice_issued = false` だけで絞ると、**既定値が入っていない古い行**が
    // どのチップにも出ない（「すべて」の合計とチップの合計が合わなくなる）
    expect(BILLING_STATE_SQL.unissued).toBe('(r.invoice_issued IS NOT TRUE)');
  });

  it('入金済みは**日付で見る**（フラグと日付を両方持つと必ず食い違う）', () => {
    expect(BILLING_STATE_SQL.paid).toBe('r.paid_date IS NOT NULL');
  });

  it('未請求と入金待ちは**重ならない**（同じ行が2つのチップに出ない）', () => {
    // 片方が `invoice_issued IS NOT TRUE`、もう片方が `= true` なので排他
    expect(BILLING_STATE_SQL.unissued).toContain('IS NOT TRUE');
    expect(BILLING_STATE_SQL.unpaid).toContain('= true');
  });

  it('知らない言葉には `null` を返す（呼ぶ側が素通しさせないため）', () => {
    expect(billingStateSql('unpaid_issued')).toBeNull();   // 前の版の別名。もう無い
    expect(billingStateSql('')).toBeNull();
    expect(billingStateSql('unpaid')).toBe(BILLING_STATE_SQL.unpaid);
  });
});

describe('⚠️ 式を書き写している口が無い', () => {
  /*
   * ここが試験の要点です。**値が正しいことより、写しが無いことのほうが大事**で、
   * 写しがあると片方だけ直されて**また割れます**（実際に割れていました）。
   */
  const FILES: Array<[string, string[]]> = [
    ['⑤ 見積・請求', ['contexts', 'sales', 'routes', 'billing.routes.ts']],
    ['財務の一覧（売上台帳・Excel）', ['contexts', 'finance', 'list-query.ts']],
    ['チップの件数', ['contexts', 'finance', 'routes', 'revenues.routes.ts']],
  ];

  for (const [name, parts] of FILES) {
    it(`${name} は共通の式を読む`, () => {
      const code = readCode(...parts);
      expect(code).toMatch(/billingStateSql|BILLING_STATE_SQL/);
      // **入金の条件を手で書いていない**
      expect(code).not.toMatch(/paid_date IS NULL'/);
    });
  }

  it('別名（`unpaid_issued`）はもうどこにも無い', () => {
    // 1つの集合に2つの名前があること自体が、片方だけ直されて割れる元だった
    for (const [, parts] of FILES) {
      expect(readCode(...parts)).not.toMatch(/unpaid_issued/);
    }
  });

  it('期日超過も**請求書を出したもの**に限る', () => {
    // 出していない売上の期日が過ぎているのは「お客様が遅れている」ではなく
    // **こちらが請求していない**という別の話で、押しても入金は来ない。
    // ここを直さないと「期日超過に出るのに入金待ちには出ない行」ができる
    const code = readCode('contexts', 'sales', 'routes', 'billing.routes.ts');
    expect(code).toMatch(/overdue'\) where \+= ` AND \$\{BILLING_STATE_SQL\.unpaid\}/);
  });
});

describe('画面の名前も1つ', () => {
  const CLIENT = join(__dirname, '..', '..', 'client', 'src', 'contexts');

  it('⑤ 見積・請求のチップは「入金待ち」（「入金前」ではない）', () => {
    // 前はここだけ「入金前」で、中身も広かった。**名前と中身の両方**をそろえる
    const src = readFileSync(join(CLIENT, 'sales', 'pages', 'BillingListPage.tsx'), 'utf8');
    expect(src).toMatch(/label: '入金待ち', state: 'unpaid'/);
    expect(src).not.toMatch(/label: '入金前'/);
  });

  it('出していないものは「未請求」から拾える（消していない）', () => {
    // 集合を狭めたぶんの行き先を作らないと、**画面から二度と見えなくなる**
    const src = readFileSync(join(CLIENT, 'sales', 'pages', 'BillingListPage.tsx'), 'utf8');
    expect(src).toMatch(/label: '未請求', state: 'unissued'/);
  });

  it('財務の売上台帳も同じ言葉', () => {
    const src = readFileSync(join(CLIENT, 'finance', 'pages', 'RevenueListPage.tsx'), 'utf8');
    expect(src).toMatch(/label: '入金待ち', status: 'all', state: 'unpaid'/);
  });
});
