/**
 * 値引きの承認は**サーバーが決める**（画面に規則を写さない）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ①**承認できるのは、その見積を作った人の役割に決めた承認者だけ**です
 *   （設定 → お金のルール）。この規則は `estimate.service` の1か所にあり、
 *   画面には `can_approve` という**答えだけ**が渡ります。
 *   画面が役割や上限を読んで自分で判定し始めると、**承認者の決め方を変えた日に
 *   ボタンだけ古い規則で出ます**（押すと 403 ＝ 押した人には「壊れている」としか見えない）。
 *
 * ②**帯と「承認する」の置き場所は2つ**あります（案件の見積タブ・GPM の見積タブ）。
 *   2回書くと、片方だけ直した日から**「案件では承認できるのにプロジェクトでは押せない」**
 *   が起きます（帳票のボタンで一度やっています）。
 *
 * ③**GPM には承認の口そのものがありませんでした。** 案件側の口は `sales` を
 *   要求するので、`gpm` だけの人は自分のプロジェクトの見積を承認できません。
 *
 * どれも**型検査にも lint にも出ません**（画面を開いた人だけが気づく）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const APPROVAL_ROW = read('client', 'src', 'contexts', 'shared', 'components', 'ApprovalRow.tsx');
const SALES_TAB = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'EstimateTab.tsx');
const GPM_TAB = read('client', 'src', 'contexts', 'gpm', 'pages', 'projectDetail', 'EstimatesTab.tsx');
const GPM_ROUTES = read('server', 'src', 'contexts', 'gpm', 'index.ts');
const ESTIMATE_SERVICE = read('server', 'src', 'contexts', 'sales', 'services', 'estimate.service.ts');

describe('値引きの承認', () => {
  it('ボタンを出すかどうかはサーバーの can_approve だけで決める', () => {
    expect(APPROVAL_ROW).toContain('estimate.can_approve');
    // 画面が役割・上限を読んで判定し始めていないか
    expect(APPROVAL_ROW).not.toMatch(/discount_limit|role_discount|permissions\?\./);
  });

  it('承認できない人にはボタンを出さない（出して 403 にしない）', () => {
    // `can_approve &&` の形で囲われていること
    expect(APPROVAL_ROW).toMatch(/\{estimate\.can_approve && \(/);
  });

  it('案件とプロジェクトの見積タブが同じ部品を呼ぶ', () => {
    for (const tab of [SALES_TAB, GPM_TAB]) {
      expect(tab).toContain('ApprovalNotice');
      expect(tab).toMatch(/from '@\/contexts\/shared\/components\/ApprovalRow'/);
    }
    // 行き先（API のもと）だけが違う
    expect(SALES_TAB).toContain('estimates');
    expect(GPM_TAB).toContain('/gpm/estimates');
  });

  it('GPM にも承認の口がある（案件側の口は sales を要求するので使えない）', () => {
    expect(GPM_ROUTES).toMatch(/estimates\/:id\/approve/);
  });

  it('承認できるかの判定はサーバーに1つだけ', () => {
    expect(ESTIMATE_SERVICE).toContain('withCanApprove');
    // 作った人の役割で見る（送った人ではない）
    expect(ESTIMATE_SERVICE).toContain('OWNER_SQL');
  });
});
