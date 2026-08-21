/**
 * **出した見積は書き換えない／お金の合計を画面で足さない**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * どちらも**画面を見ても気づけません**:
 *
 * ・出した版を後から書き換えても、画面には**新しい値がふつうに出る**だけです。
 *   お客様が持っている紙と食い違っていることは、突き合わせるまで分かりません
 *   （「何を出したか」を見返せることが、版を分けている理由そのものです）
 * ・合計の間違いは**それらしい数字が出る**ので、月末に合わないまで分かりません
 *
 * v4 の PR で繰り返し指摘された形です（#50 / #87 / #102 / #53）。
 * **決めごとが画面の側にしか無い**と、古いタブ・MCP・直接叩きで通ります。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ESTIMATE = read('server', 'src', 'contexts', 'sales', 'services', 'estimate.service.ts');
const BILLING = read('server', 'src', 'contexts', 'sales', 'routes', 'billing.routes.ts');
const PANE = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'RevenueBillingPane.tsx');

describe('見積とお金の記録を守る', () => {
  it('出した版・受注した版・差し替え済みの版は中身を直せない', () => {
    // 画面がボタンを出さないだけで、**サーバーは受け付けていた**（#50）
    expect(ESTIMATE).toMatch(/const CONTENT = \['title', 'tax_category', 'discount', 'valid_until', 'notes'\]/);
    expect(ESTIMATE).toMatch(/if \(touchesContent && existing\.status !== 'draft'\)/);
    // **`status` だけの更新は通す** — 送る・受注・失注は記録そのもの
    expect(ESTIMATE).toMatch(/if \(data\.status && existing\.status === 'superseded'\)/);
  });

  it('明細も下書きだけ。しかも消してから入れるので取引にする', () => {
    const at = ESTIMATE.indexOf('async replaceItems');
    const body = ESTIMATE.slice(at, at + 2200);
    expect(body).toMatch(/existing\.status !== 'draft'/);
    // 取引の外だと、途中で失敗したとき**前の明細が消えたまま**残る
    expect(body).toMatch(/await withTransaction\(async \(tx\) => \{/);
    expect(body).toMatch(/tx\.execute\(`DELETE FROM estimate_items/);
  });

  it('消せるのは下書きだけ（送った記録を消させない）', () => {
    const at = ESTIMATE.indexOf('async remove(');
    const body = ESTIMATE.slice(at, at + 900);
    expect(body).toMatch(/est\.status !== 'draft'/);
    // 画面も同じ条件（サーバーだけだと、押してからエラーになる）。
    // **PC の `Row` とスマホのカードで共有する `EstimateActions.tsx` に切り出してある**
    // （v4ネイティブUI監査・この回。写しを作らず1か所にした）
    const actions = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'EstimateActions.tsx');
    expect(actions).toMatch(/\{!e\.revenue_id && e\.status === 'draft' && \(/);
  });

  it('承認待ちの見積書は社外フォルダに置かない', () => {
    // 値引きが上限を超えた見積は**送れない**決めごとなのに、置き先は社外と
    // 共有するフォルダ。置いた時点で送ったのと同じになる（#102）
    const routes = read('server', 'src', 'contexts', 'sales', 'routes', 'estimates.routes.ts');
    expect(routes).toMatch(/const pending = approvalState === 'pending'/);
    expect(routes).toMatch(/docBoxSkipped\('estimate', 'NOT_APPROVED'\)/);
    // **紙にするのは止めない**（承認を頼む相手に見せるのに要る）
    expect(routes).toMatch(/res\.send\(buffer\)/);
    // 理由は画面に出す（黙って落とすと「保存されたつもり」になる）
    expect(read('client', 'src', 'lib', 'docPdf.ts')).toMatch(/NOT_APPROVED:/);
  });

  it('見積段階の売上には請求書の発行・入金・検収を記録できない', () => {
    const at = BILLING.indexOf("router.patch('/invoices/:id'");
    // ⚠️ **窓を字数で切らないこと**（この回で一度落ちた）。説明を1つ足しただけで
    // 見たい行が窓の外に出て、**中身は正しいのに試験だけが赤くなる**。
    // 次のルートまでを窓にする
    const body = BILLING.slice(at, BILLING.indexOf('router.', at + 10));
    // **列の並びではなく、読んでいることと弾いていることを見る**
    // （`invoice_issued` を足したときに、この試験だけが落ちた）
    expect(body).toMatch(/SELECT id, status[^)]*FROM revenues/);
    expect(body).toMatch(/existing\.status !== 'confirmed'/);
  });

  it('案件の売上・仕入の合計は、行を足さずサーバーの配分ぶんを使う', () => {
    // ①分け合う請求の `amount` は**グループ全体の額**（足すと粗利が膨らむ）
    // ②行は 100 件で切っている（101 件目から合計に入らない）— どちらも #87
    for (const p of [
      ['server', 'src', 'contexts', 'finance', 'routes', 'revenues.routes.ts'],
      ['server', 'src', 'contexts', 'finance', 'routes', 'purchases.routes.ts'],
    ]) {
      expect(read(...p)).toMatch(/total_allocated_amount/);
      expect(read(...p)).toMatch(/COALESCE\(SUM\(COALESCE\((ra|pa)\.allocated_amount, (r|pu)\.amount\)\), 0\)/);
    }
    expect(PANE).toMatch(/revenues\.data\?\.confirmed_allocated_amount/);
    expect(PANE).toMatch(/purchases\.data\?\.total_allocated_amount/);
    // **切ったことを書く**（黙って切ると「これで全部」と読まれる）
    expect(PANE).toMatch(/function MoreNote/);
    expect(PANE).toMatch(/moreRevenue > 0 && <MoreNote/);
    expect(PANE).toMatch(/morePurchase > 0 && <MoreNote/);
  });
});
