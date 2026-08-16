/**
 * **請求・入金の進み具合を表す言葉を1か所に集める**（レビューでの指摘 #125）
 *
 * ── なぜ1か所にするか（実測）────────────────────────────────
 *
 * ⚠️ **同じ `state=unpaid` が、口によって違う集合を指していました。**
 *
 *   `GET /revenues`（財務の売上台帳）  … `invoice_issued = true AND paid_date IS NULL`
 *   `GET /billing/invoices`（見積・請求） … `paid_date IS NULL`（**請求書を出していないものも入る**）
 *
 * 画面の名前も割れていて、**⑤ 見積・請求は「入金前」、財務の台帳は「入金待ち」**でした。
 * 同じ言葉が違う集合を指すので、**2つの画面で違う件数が出て、どちらが正しいか
 * 画面からは分かりません**（実測: 40 件 と 3 件）。
 *
 * しかも広いほうは害が具体的です — ⑫ 入金の確認（スマホ）は一覧から入金を記録できるので、
 * **請求書を出していない売上に入金日が入る**（月次の締めは前から `invoice_issued` を
 * 要求しており、そちらとも食い違う）。
 *
 * ⚠️ **「片方を直す」では再発します。** 前回は広いほうを残したまま `unpaid_issued` を
 * 足しましたが、**名前が2つある状態そのもの**が食い違いの元でした。
 * ここに置いて**両方の口が同じ式を読む**ようにします。
 */

/**
 * `revenues` 1行の進み具合。**日付が入っていれば済み**
 * （フラグと日付を両方持つと必ず食い違うので、入金は `paid_date` だけを見る）。
 *
 * 別名を作らないこと — 1つの集合に2つの名前があると、**片方だけ直されて**また割れます。
 */
export const BILLING_STATE_SQL = {
  /** 請求書を出した（入金の有無は問わない） */
  issued: 'r.invoice_issued = true',
  /** まだ請求書を出していない。⚠️ **`false` と `NULL` の両方**を拾う */
  unissued: '(r.invoice_issued IS NOT TRUE)',
  /** **入金待ち** = 請求書を出したのに入金がまだ。**出していないものは入らない** */
  unpaid: 'r.invoice_issued = true AND r.paid_date IS NULL',
  /** 入金済み */
  paid: 'r.paid_date IS NOT NULL',
} as const;

export type BillingState = keyof typeof BILLING_STATE_SQL;

/**
 * 知っている言葉なら SQL を返す。**知らない言葉には `null`**。
 *
 * ⚠️ 呼ぶ側は `null` を**素通しさせないこと** — 絞り込んだのに全件返ると、
 * 画面には「絞り込みが効いていない」ではなく**「該当が多い」**に見えます。
 */
export function billingStateSql(state: string): string | null {
  return (BILLING_STATE_SQL as Record<string, string>)[state] ?? null;
}
