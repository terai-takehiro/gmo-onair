/**
 * **お金は二重に数えない／取りこぼさない**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この一群は**画面を見ても気づけません**:
 *
 * ・二重計上は「同時に押したとき」だけ起き、**押した人には成功に見えます**
 *   （どちらの応答も 201）。気づくのは月末に合計が合わないときで、
 *   そこから「どの行が余分か」を探すことになります
 * ・取りこぼし（グループ請求が一覧に出ない）は**行が出ないだけ**なので、
 *   出ていないことに気づく手がかりがありません
 *
 * v4 の PR には**この形の指摘が繰り返し付いています**（#53 / #56 / #57 / #87）。
 * 共通するのは「**確かめてから書く**の間に他人が入れる」ことなので、
 * **取引の中で行を押さえているか**を機械に見させます。
 *
 * ⚠️ **ここで見るのは書き方だけ**です。実際に同時に押して数えるのは
 * 実サーバーでやります（この版でも4通り実測しています）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ESTIMATE = read('server', 'src', 'contexts', 'sales', 'services', 'estimate.service.ts');
const BILLING = read('server', 'src', 'contexts', 'sales', 'routes', 'billing.routes.ts');
const HANDOFF = read('server', 'src', 'contexts', 'finance', 'services', 'doc-handoff.service.ts');
const INVOICE_NO = read('server', 'src', 'contexts', 'finance', 'services', 'invoice-number.service.ts');

/** `withTransaction(...)` の中身を取り出す（雑でよい — 行を押さえる位置だけ見る） */
function txBody(src: string, from: number): string {
  const at = src.indexOf('withTransaction', from);
  // ⚠️ `convertToRevenue` は版重複変換の防止（同じ見積の別バージョンが
  // 作った売上を上書きする分岐）や期間引き継ぎ（仕様変更 #14/#19）が増え、
  // コメントごと 6000 字を超えている。窓を狭いままにすると**中身は正しいのに
  // 試験だけが赤くなる**（別のテストの教訓と同じ形）ので、実測して余裕を持たせてある
  return at < 0 ? '' : src.slice(at, at + 9000);
}

describe('お金の二重計上・取りこぼし', () => {
  it('受注→売上の変換は、取引の中で見積を押さえてから書く', () => {
    // 押さえないと、同時に押したとき**両方が確認を通って売上が2行**できる。
    // `estimates.revenue_id` は後から書いたほうだけが残るので、
    // もう1行は**どこからも参照されないまま台帳に載り続ける**
    const body = txBody(ESTIMATE, ESTIMATE.indexOf('async convertToRevenue'));
    expect(body).toMatch(/SELECT revenue_id FROM estimates WHERE id = \$1 FOR UPDATE/);
    // 連番（`billing_key`）も取引の中で数える — 外だと同じ鍵の行が2つできる
    expect(body).toMatch(/tx\.queryOne\(\s*\n?\s*`SELECT COUNT\(\*\) AS c FROM revenues/);
  });

  it('値引きは売上の明細にも1行として写す', () => {
    // 見積の値引きは**単価を下げずに別建て**する決めごとなので、明細をそのまま
    // 写すと定価のまま。合計（`revenues.amount`）は値引き後なので、
    // **明細を足すと合計より大きい**（請求書 PDF は両方を刷る）
    const conv = ESTIMATE.slice(ESTIMATE.indexOf('async convertToRevenue'));
    expect(conv).toMatch(/const discount = Number\(est\.discount\) \|\| 0/);
    expect(conv).toMatch(/if \(discount > 0 && items\.length > 0\)/);
    expect(conv).toMatch(/値引き（見積 v\$\{est\.version\}）/);
    // **単価を按分して下げないこと**（どの品目をいくら引いたかは決めていない）
    expect(conv).not.toMatch(/unit_price \* \(1 - /);
  });

  it('グループ請求（按分）を一覧から外さない', () => {
    // `revenues` に子行は無い（内訳は `revenue_allocations`）。外していたので
    // グループ請求は**一覧にも締め処理にも1行も出ず**、入金も検収も付けられなかった
    expect(BILLING).not.toMatch(/AND r\.group_id IS NULL/);
    // 按分だと分かるように返す（金額はグループ全体・案件名は代表の1件）
    expect(BILLING).toMatch(/r\.group_id, g\.name AS group_name/);
    expect((BILLING.match(/LEFT JOIN project_groups g ON g\.id = r\.group_id/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);   // ⑤ 見積・請求と ② 締め処理の2か所
  });

  it('グループ請求だと画面に分かるように出す（満額の請求に見せない）', () => {
    // ⚠️ 一覧に出すようにした以上、**印を出さないと「その案件1件ぶんの満額の請求」**に
    // 見える（金額はグループ全体・案件名は代表の1件）。請求書を出す人・入金を
    // 記録する人が分け合っていることに気づけない（レビューでの指摘）
    const tag = read('client', 'src', 'contexts', 'shared', 'components', 'GroupTag.tsx');
    expect(tag).toMatch(/export function GroupTag/);
    expect(tag).toMatch(/export function groupNote/);
    // グループでなければ何も描かない
    expect(tag).toMatch(/if \(!name\) return null/);
    // ⚠️ **画面に出さないと決めた言葉を使わない**（`check-ui-tokens` の言葉の決めごと）。
    // 札は「分け合う」。`npm run lint` も止めるが、ここでも見ておく
    expect(tag).not.toMatch(/>\s*按分\s*</);

    // **出す先は3か所**（⑤ 見積・請求／② 締め処理／スマホの入金の確認）。
    // 1つ足りないと、その画面だけ満額の請求に見えたままになる
    for (const p of [
      ['client', 'src', 'contexts', 'sales', 'pages', 'billing', 'InvoiceRows.tsx'],
      ['client', 'src', 'contexts', 'finance', 'pages', 'billing', 'ClosingRows.tsx'],
      ['client', 'src', 'contexts', 'finance', 'pages', 'closing', 'MobileCollect.tsx'],
    ]) {
      const src = read(...p);
      expect(src).toMatch(/<GroupTag name=\{r\.group_name\} \/>/);
      expect(src).toMatch(/groupNote\(r\.group_name\)/);
    }

    // 型にも載せる（載せ忘れると画面が受け取れない）
    for (const p of [
      ['client', 'src', 'contexts', 'sales', 'pages', 'billing', 'types.ts'],
      ['client', 'src', 'contexts', 'finance', 'pages', 'billing', 'types.ts'],
    ]) {
      expect(read(...p)).toMatch(/group_name\?: string \| null/);
    }
  });

  it('書類の台帳への引き渡しは、取引の中で書類を押さえてから書く', () => {
    const body = txBody(HANDOFF, HANDOFF.indexOf('export async function handoffDoc'));
    expect(body).toMatch(/SELECT linked_id, status FROM finance_docs WHERE id = \? FOR UPDATE/);
    expect(body).toMatch(/ALREADY_LINKED/);
  });

  it('請求書番号は行を押さえてから採る（無駄に消費しない・嘘を返さない）', () => {
    expect(INVOICE_NO).toMatch(/SELECT invoice_no FROM revenues WHERE id = \? FOR UPDATE/);
    // すでに番号を持っていたら**入っている番号のほうを返す**
    expect(INVOICE_NO).toMatch(/if \(cur\.invoice_no\) return cur\.invoice_no/);
    // 採るのも同じ取引の中で（巻き戻っても番号だけ進む、を防ぐ）
    expect(INVOICE_NO).toMatch(/nextInvoiceNo\(entityCode, year, tx\)/);
    // 旧: 採ってから `WHERE invoice_no IS NULL` で書く形に戻っていないか
    expect(INVOICE_NO).not.toMatch(/WHERE id = \? AND invoice_no IS NULL/);
  });

  it('受注→売上の変換は sales editor に届く（全体のゲートより前）', () => {
    // 以前は `sales`/`budget` が別区画で、`requireAnyPermission(['sales','budget'])`
    // と書いてあっても router 全体の `sales` ゲートより後ろに置くと**経理はそこに
    // 到達できない**事故があった（書いてあるのに効かない）。権限モデル単純化で
    // `budget` は `sales` に統合されたため、この種の事故自体が起きなくなったが、
    // ルートの並び自体（全体ゲートより前）は引き続き固定しておく
    const src = read('server', 'src', 'contexts', 'sales', 'routes', 'estimates.routes.ts');
    const convAt = src.indexOf("router.post('/:id/convert-to-revenue'");
    const gateAt = src.indexOf("router.use(requireAuth, requirePermission('sales'))");
    expect(convAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(convAt).toBeLessThan(gateAt);
    expect(src.slice(convAt, convAt + 200)).toContain("requirePermission('sales', 'editor')");
  });
});
