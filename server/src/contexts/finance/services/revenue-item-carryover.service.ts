/**
 * 明細の全置換 (DELETE→INSERT) をまたいで、**この版の画面が知らない列**を引き継ぐ。
 *
 * ── なぜ要るか ────────────────────────────────────────
 *
 * この版の売上明細には「単位」「行ごとの仕入」「仕入先」「AI が出した行か」の
 * 入力欄が無い。一方 DB にはその列がある (migration 145 / 147 で追加され、
 * 新しい版の見積画面が値を入れている)。
 *
 * 明細の保存は `DELETE FROM revenue_items` → `INSERT` の全置換なので、
 * **画面に無い列は保存のたびに既定値へ戻る**。しかも画面に出ないので
 * 誰も気づけない (同じ形の消え方が v3.1.5 で1度直されている)。
 *
 * `period_start` / `period_end` / `item_notes` / `category` も、
 * 呼び出し側によっては送ってこない (合同案件・按分グループの口)。同じ扱いにする。
 *
 * ── 引き継ぎの鍵 ──────────────────────────────────────
 *
 * 品目名で対応を取る。行の増減・並べ替えがあっても追随できる。
 * 同じ品目名が複数あるときは、出てきた順に1つずつ使う (先着で消費する)。
 *
 * **対応が取れなかった行は引き継がない。** 別の行の仕入額や仕入先を
 * 付け替えるくらいなら、引き継がないほうが安全 (金額が絡むので、
 * 間違った行に付くと請求まで間違う)。
 */

export interface CarriedRevenueItemColumns {
  unit: string | null;
  cost_amount: number;
  cost_vendor_id: string | null;
  is_ai_suggested: boolean;
  period_start: string | null;
  period_end: string | null;
  item_notes: string | null;
  category: string | null;
}

export const EMPTY_CARRIED: CarriedRevenueItemColumns = {
  unit: null,
  cost_amount: 0,
  cost_vendor_id: null,
  is_ai_suggested: false,
  period_start: null,
  period_end: null,
  item_notes: null,
  category: null,
};

type QueryAll = (sql: string, params?: unknown[]) => Promise<unknown[]>;

/** 品目名 → 引き継ぐ値。1回引くと消費される (同名の行が複数あっても取り違えない) */
export type CarryoverLookup = (description: unknown) => CarriedRevenueItemColumns;

const isEmpty = (c: CarriedRevenueItemColumns): boolean =>
  !c.unit && !c.cost_amount && !c.cost_vendor_id && !c.is_ai_suggested &&
  !c.period_start && !c.period_end && !c.item_notes && !c.category;

/**
 * DELETE する**前**に呼ぶこと。削除後だと引き継ぐ値が読めない。
 * トランザクションの中で使うときは `tx.queryAll` を渡す
 * (プールから別の接続で読むと、同じトランザクションの DELETE が見えない)。
 */
export async function loadRevenueItemCarryover(
  revenueId: string,
  queryAll: QueryAll,
): Promise<CarryoverLookup> {
  const rows = (await queryAll(
    `SELECT description, unit, cost_amount, cost_vendor_id, is_ai_suggested,
            period_start, period_end, item_notes, category
       FROM revenue_items
      WHERE revenue_id = ?
      ORDER BY sort_order`,
    [revenueId],
  )) as Record<string, unknown>[];

  const byDescription = new Map<string, CarriedRevenueItemColumns[]>();

  for (const r of rows) {
    const carried: CarriedRevenueItemColumns = {
      unit: (r.unit as string) ?? null,
      cost_amount: Number(r.cost_amount ?? 0) || 0,
      cost_vendor_id: (r.cost_vendor_id as string) ?? null,
      is_ai_suggested: Boolean(r.is_ai_suggested),
      period_start: (r.period_start as string) ?? null,
      period_end: (r.period_end as string) ?? null,
      item_notes: (r.item_notes as string) ?? null,
      category: (r.category as string) ?? null,
    };
    // 何も入っていない行を覚えても意味がない (同名の行の消費だけ進んでしまう)
    if (isEmpty(carried)) continue;

    const key = String(r.description ?? '');
    const queue = byDescription.get(key);
    if (queue) queue.push(carried);
    else byDescription.set(key, [carried]);
  }

  return (description: unknown): CarriedRevenueItemColumns => {
    const queue = byDescription.get(String(description ?? ''));
    if (!queue || queue.length === 0) return EMPTY_CARRIED;
    return queue.shift() as CarriedRevenueItemColumns;
  };
}
