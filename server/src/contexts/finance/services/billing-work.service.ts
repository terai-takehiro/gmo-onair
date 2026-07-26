/**
 * 請求のしごと (デザイン 31章 31a / 仕様書 §7.5)
 *
 * 毎月やることが決まっている仕事なので、**対象を集めて → 確認して → まとめて出す**
 * を1画面で終わらせる。入金の確認も同じ画面に置く (別画面にすると「出したのに
 * 入ったか分からない」が起きる)。
 *
 * ── 決めごと ──────────────────────────────────────────
 *  - **申込書が揃っていない案件は選べない**。何が足りないかは案件の書類の判定
 *    (`projects.application_form`) と同じものを見る — 判定を2か所に書かない
 *  - 金額は**税抜で持つ**。消費税と支払額は表示のときに足す
 *  - 入金は日付で持つ。「入金済み」だけだと**期日より遅れて入ったか**が分からず
 *    催促の判断に使えない
 *  - **出した請求書は消せない**。取り消しは「発行を取り消す」で日付を外すだけにし、
 *    番号 (billing_key) は残す
 *  - 月次運用は**先月と金額が違うものだけ印**を付ける。全部に印を付けると印の意味が消える
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';

const TAX_RATE: Record<string, number> = { tax10: 0.10, tax8: 0.08, exempt: 0 };

/** 税抜 → 税込。表示のときだけ足す (保持は税抜) */
export function withTax(net: number, taxCategory: string): number {
  return net + Math.round(net * (TAX_RATE[taxCategory] ?? TAX_RATE.tax10));
}

/**
 * 請求書を出すのに足りていないものを返す。
 * 案件の書類の判定をここに写さない — `projects` の列をそのまま見る。
 */
export function missingDocs(project: { application_form?: number | null }): string[] {
  const missing: string[] = [];
  if (!Number(project.application_form)) missing.push('申込書');
  return missing;
}

const BASE_SELECT = `
  SELECT r.id, r.billing_key, r.amount, r.tax_category, r.status,
         r.recognition_date, r.billing_date, r.payment_due_date,
         r.invoice_issued, r.invoice_issued_at, r.paid_at, r.paid_amount,
         r.inspection_issued_at, r.subtitle, r.episode_id,
         p.id AS project_id, p.name AS project_name, p.gls_number,
         p.application_form, p.logo_permission,
         c.name AS customer_name, e.episode_code
  FROM revenues r
  LEFT JOIN projects p ON p.id = r.project_id
  LEFT JOIN customers c ON c.id = r.customer_id
  LEFT JOIN episodes e ON e.id = r.episode_id
  WHERE r.deleted_at IS NULL AND r.status = 'confirmed'`;

function shape(row: Record<string, any>) {
  const amount = Number(row.amount) || 0;
  const missing = missingDocs(row);
  return {
    id: row.id,
    billing_key: row.billing_key,
    project_id: row.project_id,
    project_name: row.project_name ?? '',
    episode_code: row.episode_code ?? null,
    gls_number: row.gls_number ?? null,
    customer_name: row.customer_name ?? '',
    subtitle: row.subtitle ?? null,
    amount,
    amount_with_tax: withTax(amount, String(row.tax_category)),
    tax_category: row.tax_category,
    recognition_date: row.recognition_date ?? null,
    payment_due_date: row.payment_due_date ?? null,
    invoice_issued: !!row.invoice_issued,
    invoice_issued_at: row.invoice_issued_at ?? null,
    paid_at: row.paid_at ?? null,
    paid_amount: row.paid_amount ?? null,
    inspection_issued_at: row.inspection_issued_at ?? null,
    missing,
    /** 出せる / 出せない (足りない書類がある) */
    can_issue: missing.length === 0,
  };
}

/** その月の締め。YYYY-MM を渡すと計上月で絞る (未指定は全部) */
function monthClause(month?: string): { sql: string; params: unknown[] } {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return { sql: '', params: [] };
  return {
    sql: ` AND r.recognition_date IS NOT NULL
           AND substr(r.recognition_date, 1, 7) = ?`,
    params: [month],
  };
}

/**
 * 画面1枚ぶん。3つのタブ (請求書を出す / 入金の確認 / 検収書を出す) と月次運用。
 */
export async function getBillingWork(month?: string) {
  const m = monthClause(month);

  // ① 請求書を出す — まだ出していない確定売上
  const toIssue = (await queryAll(
    `${BASE_SELECT} AND r.invoice_issued = FALSE ${m.sql}
     ORDER BY p.application_form DESC, r.payment_due_date ASC NULLS LAST, r.billing_key ASC`,
    m.params,
  )) as Array<Record<string, any>>;

  // ② 入金の確認 — 出したが入っていないもの。**期日を過ぎたものが上**
  const toCollect = (await queryAll(
    `${BASE_SELECT} AND r.invoice_issued = TRUE AND r.paid_at IS NULL
     ORDER BY r.payment_due_date ASC NULLS LAST`,
  )) as Array<Record<string, any>>;

  // ③ 検収書を出す — 請求済みでまだ検収書を出していないもの
  const toInspect = (await queryAll(
    `${BASE_SELECT} AND r.invoice_issued = TRUE AND r.inspection_issued_at IS NULL ${m.sql}
     ORDER BY r.invoice_issued_at DESC NULLS LAST`,
    m.params,
  )) as Array<Record<string, any>>;

  // 最近入金した分。**打ち間違いを直せないと使われない**ので、
  // 記録した直後に一覧から消えてしまわないよう 14 日ぶんだけ残して出す
  const recentlyPaid = (await queryAll(
    `${BASE_SELECT} AND r.paid_at IS NOT NULL AND r.paid_at > NOW() - INTERVAL '14 days'
     ORDER BY r.paid_at DESC LIMIT 20`,
  )) as Array<Record<string, any>>;

  const today = new Date().toISOString().slice(0, 10);
  return {
    month: month ?? null,
    recently_paid: recentlyPaid.map(shape),
    to_issue: toIssue.map(shape),
    to_collect: toCollect.map((r) => ({
      ...shape(r),
      overdue: !!r.payment_due_date && String(r.payment_due_date) < today,
    })),
    to_inspect: toInspect.map(shape),
    counts: {
      to_issue: toIssue.length,
      to_collect: toCollect.length,
      to_inspect: toInspect.length,
      /** 足りない書類があって出せないもの (数字で先に見せる) */
      blocked: toIssue.filter((r) => missingDocs(r).length > 0).length,
    },
    recurring: await getRecurring(month),
  };
}

/**
 * 毎月同じ請求 (月次運用)。
 *
 * 「毎月同じ」の判定は**先月にも同じ案件の確定売上があるか**で行う。
 * 専用のフラグを作らない — フラグは必ず付け忘れる (そして付け忘れた月だけ請求が漏れる)。
 * **先月と金額が違うものだけ印**を付ける (全部に印を付けると印の意味が消える)。
 */
export async function getRecurring(month?: string) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return [];
  const [y, mm] = month.split('-').map(Number);
  const prev = new Date(y, mm - 2, 1);
  const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

  return (await queryAll(
    `SELECT cur.id, cur.amount, cur.billing_key, cur.invoice_issued,
            p.id AS project_id, p.name AS project_name, c.name AS customer_name,
            prev.amount AS prev_amount
     FROM revenues cur
     LEFT JOIN projects p ON p.id = cur.project_id
     LEFT JOIN customers c ON c.id = cur.customer_id
     JOIN LATERAL (
       SELECT r2.amount FROM revenues r2
       WHERE r2.project_id = cur.project_id AND r2.status = 'confirmed' AND r2.deleted_at IS NULL
         AND r2.recognition_date IS NOT NULL AND substr(r2.recognition_date, 1, 7) = ?
       ORDER BY r2.created_at DESC LIMIT 1
     ) prev ON TRUE
     WHERE cur.deleted_at IS NULL AND cur.status = 'confirmed'
       AND cur.recognition_date IS NOT NULL AND substr(cur.recognition_date, 1, 7) = ?
     ORDER BY (cur.amount <> prev.amount) DESC, p.name`,
    [prevMonth, month],
  )) as Array<Record<string, any>>;
}

/**
 * 請求書を出したと記録する (まとめて)。
 *
 * **足りない書類がある売上は弾く** — 画面でも選べないが、
 * サーバーでも止める (画面だけの制限は必ず抜ける)。
 */
export async function markIssued(ids: string[], userId: string) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '請求書を出す売上を選んでください');
  }
  const rows = (await queryAll(
    `SELECT r.id, p.application_form, p.name AS project_name
     FROM revenues r LEFT JOIN projects p ON p.id = r.project_id
     WHERE r.id = ANY(?::text[]) AND r.deleted_at IS NULL AND r.status = 'confirmed'`,
    [ids],
  )) as Array<Record<string, any>>;

  const blocked = rows.filter((r) => missingDocs(r).length > 0);
  if (blocked.length) {
    const names = blocked.map((b) => `${b.project_name}（${missingDocs(b).join('・')}）`).join(' / ');
    throw new AppError(400, 'DOCS_MISSING', `書類が揃っていない案件が含まれています: ${names}`);
  }

  const okIds = rows.map((r) => String(r.id));
  if (!okIds.length) throw new AppError(404, 'NOT_FOUND', '対象の売上が見つかりません');

  await execute(
    `UPDATE revenues SET invoice_issued = TRUE, invoice_issued_at = NOW(),
            updated_at = NOW(), updated_by = ?
     WHERE id = ANY(?::text[]) AND invoice_issued = FALSE`,
    [userId, okIds],
  );
  return { issued: okIds };
}

/**
 * 発行を取り消す。**番号 (billing_key) は消さない** —
 * 出した請求書は取り消しても番号が飛ぶだけで、欠番のほうが後から追える。
 */
export async function unmarkIssued(id: string, userId: string) {
  const row = await queryOne(`SELECT id, paid_at FROM revenues WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  if ((row as any).paid_at) {
    throw new AppError(400, 'VALIDATION_ERROR', '入金済みの請求は取り消せません。先に入金の記録を外してください');
  }
  await execute(
    `UPDATE revenues SET invoice_issued = FALSE, invoice_issued_at = NULL,
            updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [userId, id],
  );
}

/** 入金を記録する。日付を省くと今日 */
export async function markPaid(
  id: string, userId: string, opts: { paid_at?: string | null; amount?: number | null } = {},
) {
  const row = await queryOne(
    `SELECT id, amount, tax_category, invoice_issued FROM revenues WHERE id = ? AND deleted_at IS NULL`, [id],
  ) as Record<string, any> | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');

  const paidAt = opts.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(opts.paid_at)
    ? opts.paid_at : new Date().toISOString().slice(0, 10);
  // 金額を省いたら「全額入った」とみなす (税込。実際に振り込まれる額)
  const amount = opts.amount != null && Number.isFinite(Number(opts.amount))
    ? Math.round(Number(opts.amount))
    : withTax(Number(row.amount) || 0, String(row.tax_category));

  await execute(
    `UPDATE revenues SET paid_at = ?::timestamp, paid_amount = ?, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [paidAt, amount, userId, id],
  );
  return { paid_at: paidAt, paid_amount: amount };
}

/** 入金の記録を外す (打ち間違いを直せないと使われない) */
export async function unmarkPaid(id: string, userId: string) {
  const row = await queryOne(`SELECT id FROM revenues WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  await execute(
    `UPDATE revenues SET paid_at = NULL, paid_amount = NULL, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [userId, id],
  );
}

/** 検収書を出したと記録する */
export async function markInspected(id: string, userId: string) {
  const row = await queryOne(`SELECT id FROM revenues WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  await execute(
    `UPDATE revenues SET inspection_issued_at = NOW(), updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [userId, id],
  );
}

/**
 * 催促する。
 *
 * **ONAiR はメールを送らない**ので、ここでやるのは
 * 「次にやること」を立てることだけ (見積の「申込書をもらう」と同じ形)。
 * 送るのは人。
 */
export async function createDunningAction(id: string, userId: string) {
  const row = await queryOne(
    `SELECT r.id, r.project_id, r.payment_due_date, c.name AS customer_name
     FROM revenues r LEFT JOIN customers c ON c.id = r.customer_id
     WHERE r.id = ? AND r.deleted_at IS NULL`, [id],
  ) as Record<string, any> | null;
  if (!row) throw new AppError(404, 'NOT_FOUND', '売上が見つかりません');
  if (!row.project_id) throw new AppError(400, 'VALIDATION_ERROR', '案件に紐づいていない売上です');

  const due = new Date();
  due.setDate(due.getDate() + 3);
  const dueStr = due.toISOString().slice(0, 10);
  await execute(
    `INSERT INTO activity_logs
       (id, project_id, user_id, activity_type, activity_date, subject, description,
        next_action, next_action_date, created_by)
     VALUES (?, ?, ?, 'email', ?, ?, ?, '入金を確かめて催促する', ?, ?)`,
    [uuidv4(), row.project_id, userId, new Date().toISOString().slice(0, 10),
     '入金の催促', `支払期日 ${row.payment_due_date ?? '未設定'} を過ぎています`, dueStr, userId],
  );
  return { next_action_date: dueStr };
}
