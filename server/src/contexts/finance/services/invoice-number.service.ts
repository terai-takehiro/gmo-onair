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
 * ── 2026年10月の事業再編: 発行者ごとの系列に分けた（P2 Round 1） ─────
 *
 * 会社が2つ（SCS/GSS）になり、請求書は発行者ごとに別の紙になるため、
 * 番号も発行者ごとの系列に分ける（`docs/reorg-2026-10-plan.md` §9-B・決定）。
 * **`INV-2026-0001` の旧系列は発行済みのまま凍結**（決めごと③の延長——
 * 過去の紙と食い違わせない）。**GSS も含めて新系列 `INV-GSS-2026-0001` から
 * 始める**（旧系列の続き番号にはしない — 発行者名そのものが変わるので
 * 系列も切ってよい、という判断）。SCS は最初から新系列のみ。
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
import { queryAll, queryOne, withTransaction } from '../../../shared/db/connection';
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';
import type { LegalEntityCode } from '../../platform/services/legal-entity.service';

/**
 * 年度の始まり月 (1 = 暦年)。
 *
 * **決算期を変えるときはここだけ直す。** 番号に年が入るので、
 * 途中で変えると同じ年の番号が2種類できる。変えるなら年度の切り替わりに合わせること。
 */
const FISCAL_START_MONTH = 1;

/** その日が属する年度 (`INV-<会社>-<この値>-0001`) */
export function fiscalYearOf(date: Date): number {
  const y = date.getFullYear();
  return date.getMonth() + 1 >= FISCAL_START_MONTH ? y : y - 1;
}

export function formatInvoiceNo(entityCode: LegalEntityCode, year: number, counter: number): string {
  return `INV-${entityCode}-${year}-${String(counter).padStart(4, '0')}`;
}

/** 取引の中でも外でも同じ SQL を使うための最小の口 */
interface Q { queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined> }

/**
 * 発行者・年度ごとの次の番号を1つ採る。**アトミック**。
 * `tx` を渡すと**その取引の中で**採る — 渡さないと、行を押さえている取引の外で
 * 採ることになり、書き込みが巻き戻っても番号だけ進む。
 */
async function nextInvoiceNo(entityCode: LegalEntityCode, year: number, tx?: Q): Promise<string> {
  const q: Q = tx ?? { queryOne };
  const row = await q.queryOne(
    `INSERT INTO sequences (seq_name, prefix, year_month, counter)
     VALUES (?, ?, ?, 1)
     ON CONFLICT (seq_name) DO UPDATE SET counter = sequences.counter + 1
     RETURNING counter`,
    [`invoice_${entityCode}_${year}`, `INV-${entityCode}-${year}`, String(year)],
  );
  return formatInvoiceNo(entityCode, year, row!.counter as number);
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
    `SELECT id, entity_code FROM revenues
      WHERE id = ANY($1::text[]) AND deleted_at IS NULL AND invoice_no IS NULL
      ORDER BY billing_date NULLS LAST, created_at`,
    [revenueIds],
  ) as { id: string; entity_code: LegalEntityCode | null }[];
  if (pending.length === 0) return [];

  const year = fiscalYearOf(now);
  const assigned: { id: string; invoice_no: string }[] = [];

  /*
   * **1件ずつ採る。** まとめて採ると、途中で失敗したときに採った番号が
   * どこにも付かないまま欠番になる (欠番は許すが、理由なく作らない)。
   *
   * ⚠️ **行を押さえてから採る**（レビューでの指摘 #57）。以前は
   * 「番号を採る → `WHERE invoice_no IS NULL` で書く」の順だったので、
   * 2人が同時に発行を押すと**片方の書き込みが 0 行**になり、
   * ①**採った番号が誰にも付かないまま消費され**（理由の無い欠番）、
   * ②**その番号を「採れました」と返して**いました — 画面はその番号を出すのに、
   * **行に入っているのは別の番号**です（相手に渡す紙の番号なので、食い違うと追えない）。
   *
   * 押さえてから採れば①は起きず、②はそもそも起こりえません。
   * すでに番号を持っていた行は**入っている番号のほうを返します**（真実を返す）。
   */
  for (const row of pending) {
    const done = await withTransaction(async (tx) => {
      const cur = await tx.queryOne(
        'SELECT invoice_no FROM revenues WHERE id = ? FOR UPDATE', [row.id],
      ) as { invoice_no: string | null } | undefined;
      if (!cur) return null;                      // 押さえる間に消えた
      if (cur.invoice_no) return cur.invoice_no;  // 先に採られていた = その番号が正

      // entity_code が無い行（このマイグレーション以前のデータ等）は今の会社ぶんに落とす
      const entityCode = row.entity_code ?? CURRENT_ENTITY_CODE;
      const minted = await nextInvoiceNo(entityCode, year, tx);
      await tx.execute(
        'UPDATE revenues SET invoice_no = ?, updated_at = NOW() WHERE id = ?',
        [minted, row.id],
      );
      return minted;
    });
    if (done) assigned.push({ id: row.id, invoice_no: done });
  }
  return assigned;
}
