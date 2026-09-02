/**
 * 売上の「請求の進み具合」を1つのバッジにする（③ 売上）。
 *
 * ── なぜ台帳から切り出したか ──────────────────────────────
 *
 * 元は `RevenueListPage.tsx` の中のローカル関数でした。財務ダッシュボードの
 * **売上の内訳にも同じ状態を出す**ことになった（ご指示「一応売上も入れておいてください」）
 * とき、写して2本にすると**必ず片方が古くなります** — 仕入・販管費の
 * `settlementState.ts` を1本にしてあるのと同じ理由です。
 *
 * ── 日付が入っていれば「済み」 ────────────────────────────
 *
 * 入金は `paid_date`、請求書は `invoice_issued` が正です。
 * 「入金済 → 発行済 → 未請求」の順に見て、**先に当たったものを出します**
 * （入金まで済んだ行に「発行済」と出しても意味がないため）。
 *
 * ⚠️ **`to`（行き先）は台帳だけが使います。** 内訳の行はカード全体が
 * 明細一覧への遷移になっているので、バッジの中にさらにリンクを入れると
 * 入れ子の当たり判定になります。内訳側は `label` / `tone` / `title` だけを
 * 取り出して使ってください（`BreakdownItem.badge` の型がそうなっています）。
 */
import type { LedgerRow } from './types';

/** `billingState` が読む列だけ。台帳の行でも内訳の行でも渡せるようにする */
export interface BillingStateSource {
  paid_date?: string | null;
  invoice_issued?: boolean | null;
}

/**
 * スマホの詳細シートで `to` へ移るボタンに書く文字。**行き先と一緒に持たせる**
 * （`types.ts` の `toLabel` の説明）。既定の文言「状態の画面をひらく」は
 * どこへ行くのか分からないので、行き先の名前をそのまま出す。
 */
const TO_LABEL = '請求・入金をひらく';

export function billingState(r: BillingStateSource): NonNullable<LedgerRow['state']> {
  // **同じ財務の中の「請求・入金」へ送る。** 台帳から状態を変えられるようにすると、
  // 経理が入金を記録した直後に別の画面から戻される事故が起きる
  const to = '/budget/billing';
  if (r.paid_date) {
    return { label: '入金済', tone: 'ok', to, toLabel: TO_LABEL, title: `${r.paid_date} に入金。押すと請求・入金の画面へ` };
  }
  if (r.invoice_issued) {
    return { label: '発行済', tone: 'warn', to, toLabel: TO_LABEL, title: '請求書は出しました。入金待ちです' };
  }
  return { label: '未請求', tone: 'neutral', to, toLabel: TO_LABEL, title: 'まだ請求書を出していません' };
}
