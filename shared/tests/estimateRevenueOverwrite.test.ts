/**
 * 見積の版重複変換 — **同じ見積の別の版から作った売上は、新しく行を作らず上書きする**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ユーザー報告: 「一度登録した売上を上書き出来るようにしたい（見積もりに修正が
 * 入ったとき、新しい版の見積もりを登録すると過去の売上として登録されている
 * 見積もりとダブルカウントになる）」。
 *
 * 具体的な事故の形: 見積 v1 を受注・売上変換（`revenues` に確定売上ができ、
 * `estimates.revenue_id` にリンクされる）→ 修正が入り v2 を作成（`createNextVersion`
 * は前の版が `sent` のときしか `superseded` にしないので、v1 は `accepted`＋
 * `revenue_id` 付きのまま残る）→ v2 も受注・売上変換すると、`convertToRevenue` の
 * 「二重変換防止」チェックは `est.revenue_id`（v2 自身）だけを見ており、v1 が
 * 既に持っている売上には気づかない → 案件に確定売上が2行でき、財務ダッシュボード
 * でも案件詳細でも合算されて**ダブルカウント**になる。
 *
 * 画面を見ても気づけない（v2 の変換は「登録できました」で正常に終わる）ので、
 * ソースの構造を固定する。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ESTIMATE = read('server', 'src', 'contexts', 'sales', 'services', 'estimate.service.ts');

describe('見積 → 売上変換（convertToRevenue）が同じ見積の別バージョンを二重計上しない', () => {
  const body = ESTIMATE.slice(
    ESTIMATE.indexOf('async convertToRevenue('),
    ESTIMATE.indexOf('\n};', ESTIMATE.indexOf('async convertToRevenue(')),
  );

  it('同じ group_id の別の版がすでに変換済みか、取引の中で確かめる', () => {
    expect(body).toMatch(
      /FROM estimates e JOIN revenues r ON r\.id = e\.revenue_id[\s\S]*?WHERE e\.group_id = \$1 AND e\.id != \$2/,
    );
  });

  it('見つかったら新規 INSERT ではなく、既存の売上行を UPDATE で上書きする', () => {
    expect(body).toMatch(/if \(sibling\) \{/);
    expect(body).toMatch(/UPDATE revenues SET billing_key=\$2, customer_id=\$3, tax_category=\$4, amount=\$5/);
    // billing_key は変えない（請求書・検収書 PDF に既に印字されている可能性があるため、
    // 税区分が変わったときの末尾枝番だけ差し替える）
    expect(body).toMatch(/sibling\.r_billing_key\.replace\(\/-\\d\$\/, `-\$\{taxBillingSuffix\(taxCategory\)\}`\)/);
  });

  it('明細の全置換でも、画面に無い列（単位・仕入・仕入先・AI由来）は引き継ぐ', () => {
    // `PUT /revenues/:id` と同じ carryover の仕組みを使っていること
    expect(ESTIMATE).toMatch(
      /import \{ loadRevenueItemCarryover \} from '\.\.\/\.\.\/finance\/services\/revenue-item-carryover\.service'/,
    );
    expect(body).toMatch(/loadRevenueItemCarryover\(revenueId, tx\.queryAll\)/);
    expect(body).toMatch(/DELETE FROM revenue_items WHERE revenue_id = \$1/);
  });

  it('配分グループに入っている売上は自動で上書きせず、案内して止まる', () => {
    expect(body).toMatch(/if \(sibling\?\.r_group_id\)/);
    expect(body).toMatch(/REVENUE_IN_ALLOCATION_GROUP/);
  });

  it('請求書発行・検収・入金が済んだ売上は上書きせず、案内して止まる', () => {
    // 事故の形: v1 を変換 → 請求書発行 (invoice_no 採番) → 入金記録 → v2 を作成・
    // 受注・変換すると、入金済みの売上行の金額・明細が v2 の値に置き換わり、
    // 番号付き請求書・入金記録と帳簿が黙って食い違う。
    // 発行済み・検収済み・入金済みのどれかが付いていたら 400 で止める。
    expect(body).toMatch(/r\.invoice_issued AS r_invoice_issued/);
    expect(body).toMatch(/r\.inspection_date AS r_inspection_date/);
    expect(body).toMatch(/r\.paid_date AS r_paid_date/);
    expect(body).toMatch(
      /sibling\.r_invoice_issued \|\| sibling\.r_inspection_date \|\| sibling\.r_paid_date/,
    );
    expect(body).toMatch(/REVENUE_ALREADY_BILLED/);
  });

  it('sibling が無いときは、これまで通り新しい売上行を作る（既存の一意な採番はそのまま）', () => {
    expect(body).toMatch(/\} else \{[\s\S]*?INSERT INTO revenues \(id, billing_key, project_id/);
  });
});
