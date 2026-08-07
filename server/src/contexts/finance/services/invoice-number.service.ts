/**
 * 請求書番号の採番 (v4・migration 163)
 *
 * ── 決めごと (2026-08-07 承認) ──────────────────────────────
 *
 * ① **年度ごとの通し番号**。年度は暦年 (`INV-2026-0001`)
 * ② **取り消しても番号は消さない。** 同じ請求は何度出し直しても同じ番号になり、
 *    取り消したまま終わった番号は**欠番**として残る。
 *    詰めると、すでに相手に渡した請求書と番号が食い違う
 * ③ **既存の行は空のまま。** 新しく発行するぶんから採る —
 *    経理がいま使っている番号と二重に付けないため
 *
 * ── なぜ「発行のとき」に採るのか ────────────────────────────
 *
 * 売上を作った時点で採ると、**出さなかった見込みの行にも番号が付いて**
 * 欠番だらけになる。相手に渡す紙ができた瞬間 (`invoice_issued = true`) が
 * 番号の意味を持つ瞬間なので、そこで採る。
 *
 * ── 二重採番を止める ────────────────────────────────────────
 *
 * `sequences` の `ON CONFLICT DO UPDATE ... RETURNING` でアトミックに採る
 * (`sequence.service.ts` の GLS 番号と同じやり方)。画面と MCP から同時に
 * 発行しても同じ番号は出ない。さらに `revenues.invoice_no` に部分一意索引を
 * 張ってあるので、経路が増えても DB が最後の砦になる。
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';

/**
 * 年度の始まり月 (1 = 暦年)。
 *
 * **決算期を変えるときはここだけ直す。** 番号に年が入るので、
 * 途中で変えると同じ年の番号が2種類できる。変えるなら年度の切り替わりに合わせること。
 */
const FISCAL_START_MONTH = 1;

/** その日が属する年度 (`INV-<この値>-0001`) */
export function fiscalYearOf(date: Date): number {
  const y = date.getFullYear();
  return date.getMonth() + 1 >= FISCAL_START_MONTH ? y : y - 1;
}

export function formatInvoiceNo(year: number, counter: number): string {
  return `INV-${year}-${String(counter).padStart(4, '0')}`;
}

/** 年度ごとの次の番号を1つ採る。**アトミック** */
async function nextInvoiceNo(year: number): Promise<string> {
  const row = await queryOne(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (seq_name) DO UPDATE SET counter = sequences.counter + 1
     RETURNING counter`,
    [`invoice_${year}`, `INV-${year}`, String(year)],
  );
  return formatInvoiceNo(year, row!.counter as number);
}

/**
 * 請求書を発行する売上に番号を採る。
 *
 * **すでに番号を持っている行は飛ばす** — 取り消して出し直したときに
 * 番号が変わると、相手が持っている紙と食い違う。
 *
 * @returns 採番した `{ id, invoice_no }` の並び (飛ばしたものは入らない)
 */
export async function assignInvoiceNumbers(
  revenueIds: string[],
  now: Date = new Date(),
): Promise<{ id: string; invoice_no: string }[]> {
  if (revenueIds.length === 0) return [];

  const pending = await queryAll(
    `SELECT id FROM revenues
      WHERE id = ANY($1::text[]) AND deleted_at IS NULL AND invoice_no IS NULL
      ORDER BY billing_date NULLS LAST, created_at`,
    [revenueIds],
  ) as { id: string }[];
  if (pending.length === 0) return [];

  const year = fiscalYearOf(now);
  const assigned: { id: string; invoice_no: string }[] = [];

  // **1件ずつ採る。** まとめて採ると、途中で失敗したときに採った番号が
  // どこにも付かないまま欠番になる (欠番は許すが、理由なく作らない)
  for (const row of pending) {
    const invoiceNo = await nextInvoiceNo(year);
    await execute(
      'UPDATE revenues SET invoice_no = ?, updated_at = NOW() WHERE id = ? AND invoice_no IS NULL',
      [invoiceNo, row.id],
    );
    assigned.push({ id: row.id, invoice_no: invoiceNo });
  }
  return assigned;
}
