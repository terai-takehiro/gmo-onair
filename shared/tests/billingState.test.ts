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

describe('⚠️ 未請求の売上に入金日を入れさせない（レビューでの指摘・P1）', () => {
  /*
   * 「未請求」チップを足したことで、**請求書を出していない売上が ⑤ の表に並ぶ**
   * ようになりました。行の「入金前」ボタンは全行で押せたので、
   * **この版が ⑫ スマホで塞いだ穴を、PC 側で開け直して**いました。
   * できるのは「請求していないのに入金済み」という、**どの絞り込みにも出てこない行**です
   * （`unpaid` は出したものだけ・`unissued` は入金前だけ）。
   */
  const code = readCode('contexts', 'sales', 'routes', 'billing.routes.ts');

  it('1件ずつの口が止める（画面で隠すだけでは直接叩けば通る）', () => {
    expect(code).toMatch(/isSettingPaidDate\(body\) && !isIssuedAfter\(body, existing\.invoice_issued\)/);
  });

  it('まとめての口も止める（片方だけ塞ぐと締めからは通る）', () => {
    expect(code).toMatch(/if \(isSettingPaidDate\(body\)\) \{/);
    expect(code).toMatch(/invoice_issued IS NOT TRUE/);
  });

  it('⚠️ まとめては**更新したあとの姿**で見る（レビューでの指摘・P1・前の版の穴）', () => {
    /*
     * 前は**いまの `invoice_issued`** だけを引いていたので、
     * `{ invoice_issued: false, paid_date: … }` を**発行済みの行に**送ると、
     * その行は「いま未請求」ではないので飛ばされず、UPDATE が
     * **発行の取り消しと入金日を同時に書きました** — 止めようとしていた
     * 「未請求なのに入金済み」がそのままできます。
     */
    expect(code).toMatch(/if \('invoice_issued' in body\) \{[\s\S]*?if \(!issuing\) \{[\s\S]*?請求書の取り消しと入金の記録は同時にできません/);
    // 飛ばす道に入るのは**発行の状態を触らないとき**だけ（あとの姿＝いまの姿）
    expect(code).toMatch(/\} else \{[\s\S]*?invoice_issued IS NOT TRUE/);
  });

  it('同じ回で発行するのは通す（「出して入金も記録する」は普通の操作）', () => {
    expect(code).toMatch(/'invoice_issued' in body \? body\.invoice_issued === true : current === true/);
  });

  it('取り消し（`null`）は止めない（間違って入った入金日を消せなくなる）', () => {
    expect(code).toMatch(/'paid_date' in body && body\.paid_date !== null/);
  });

  it('⚠️ まとめては落とさずに飛ばし、**飛ばしたことを返す**', () => {
    // 200 件の締めを1件のために全部止めると、経理は原因の行を探すところから始める
    expect(code).toMatch(/skipped_unissued: skippedUnissued/);
  });

  it('画面は飛ばした件数を出す（「10件を記録しました」だけだと全部入ったと思う）', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'client', 'src', 'contexts', 'finance', 'pages', 'ClosingPage.tsx'), 'utf8',
    );
    expect(src).toMatch(/請求書を出していない \$\{d\.skipped_unissued\.length\}件は飛ばしました/);
  });

  it('⑤ の行は押せなくする（理由つき・枠は残す）', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'client', 'src', 'contexts', 'sales', 'pages', 'billing', 'InvoiceRows.tsx'),
      'utf8',
    );
    expect(src).toMatch(/blocked=\{r\.invoice_issued \? undefined : '請求書を出してから記録できます/);
    // **消さずに理由を出す** — 消すと、なぜ押せないのかが分からない
    expect(src).toMatch(/title=\{blocked\}/);
  });

  it('⚠️ 理由は hover だけに置かない（レビューでの指摘・P2）', () => {
    /*
     * `disabled` にすると**キーボードで辿り着けず**、指で触る端末には hover がありません。
     * その人たちに見えるのは**薄くなった「入金前」だけ**で、理由はどこにも出ません。
     */
    const src = readFileSync(
      join(__dirname, '..', '..', 'client', 'src', 'contexts', 'sales', 'pages', 'billing', 'InvoiceRows.tsx'),
      'utf8',
    );
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // 押せる（＝辿り着ける）まま。`disabled` は通信中だけ
    expect(code).toMatch(/disabled=\{busy\}/);
    expect(code).toMatch(/aria-disabled=\{blocked \? true : undefined\}/);
    // 押したら帯で理由を出す（**押しても何も起きない形にしない** — それが元の不具合と同じ）
    expect(code).toMatch(/notifyWarning\('入金を記録できません', \{ description: blocked \}\)/);
    // 読み上げには理由ごと渡す
    expect(code).toMatch(/aria-label=\{blocked \? `\$\{todoLabel\}（\$\{blocked\}）` : undefined\}/);
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
