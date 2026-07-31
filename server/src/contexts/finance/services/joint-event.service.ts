/**
 * 合同案件 (デザイン 32章 40a / 40b / 仕様書 §7.14)
 *
 * 1回のイベントを複数社で開き、**総額を分けて各社に請求する**。
 * 株主総会をグループ9社で開いたら請求書は9枚、宛名も9社。
 *
 * ── 既存の「費用を分け合う」と混ぜない ────────────────────
 *
 * 見分け方は **「請求書が何枚出るか」**。
 *  - 1枚         → 既存の費用分け (1社が払い、費用を案件で配る = 社内の原価配分)
 *  - 参加社数ぶん → 合同案件 (この道具)
 * 器を分けている理由は migration 147 のコメントに書いた。
 *
 * ── 決めごと ──────────────────────────────────────────
 *  - **会社を選ぶと案件が自動でできる**。9社なら9案件。手で作らせない
 *  - 金額は**税抜で持つ**。消費税と支払額は表示のときに足す
 *  - **あまりの1円の行き先を画面に出す**。既定は幹事、変更できる。
 *    黙って先頭に寄せない (既存の費用分けはそれをしていて、誰に付いたか追えなかった)
 *  - **合計が総額に合わないうちは請求書を出せない**。画面だけでなくサーバーでも止める
 *  - **出した請求書は消せない**。1社抜けたら取り消しの請求書を1枚出して配り直す
 *  - 請求書の番号は1枚ごとに採る。9枚出せば9本
 *  - 画面に「按分」という言葉を出さない
 */
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { withTax } from './billing-work.service';
import { normalizeTaxCategory, taxBillingSuffix } from '../../../shared/services/tax-category.service';
import type { GlsCategory } from '../../../shared/services/sequence.service';

export const SPLIT_MODES = ['equal', 'ratio', 'manual'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

export const SPLIT_MODE_LABELS: Record<SplitMode, string> = {
  equal: '均等に分ける',
  ratio: '割合で分ける',
  manual: '金額を直接入れる',
};

/** 合同案件で自動作成する案件の初期ステージ。
 *  請求書を出す = 実際に開催されたということなので、そのときに a_won へ上げる。
 *  最初から a_won にすると、まだ決まっていない段階の受注が数字に乗る。 */
const INITIAL_STAGE = 'b_verbal';

// ───────────────────────────────────────────────────────
// 分け方の計算
// ───────────────────────────────────────────────────────

/**
 * 総額を各社に配る。**あまりは指定した1社に寄せる** (黙って先頭に寄せない)。
 *
 * equal  : 総額 ÷ 社数。割り切れない分が「あまり」
 * ratio  : 万分率で配る。端数の切り捨て分が「あまり」
 * manual : 入れた金額をそのまま使う (あまりの概念が無い。合計チェックで担保する)
 */
export function computeSplit(
  total: number,
  rows: Array<{ id: string; ratio_bp?: number; amount?: number }>,
  mode: SplitMode,
  remainderRowId: string | null
): Array<{ id: string; amount: number; ratio_bp: number; is_remainder: boolean }> {
  const n = rows.length;
  if (n === 0) return [];

  if (mode === 'manual') {
    return rows.map((r) => ({
      id: r.id,
      amount: Math.max(0, Math.round(Number(r.amount ?? 0))),
      ratio_bp: total > 0 ? Math.round((Number(r.amount ?? 0) / total) * 10000) : 0,
      is_remainder: false,
    }));
  }

  // 割合を決める。equal は全社同じ割合。
  // 10000 を n で割り切れないとき (9社 = 1111.1...) の端数は割合側では直さない。
  // 割合と金額の両方で端数調整をすると、どちらの端数か分からなくなる。
  const ratios =
    mode === 'equal'
      ? rows.map(() => Math.floor(10000 / n))
      : rows.map((r) => Math.max(0, Math.round(Number(r.ratio_bp ?? 0))));

  const base =
    mode === 'equal'
      ? rows.map(() => Math.floor(total / n))
      : rows.map((_, i) => Math.floor((total * ratios[i]) / 10000));

  const assigned = base.reduce((a, b) => a + b, 0);
  const remainder = total - assigned;

  // あまりの行き先。指定が無い / 指定が参加者に居ないときは先頭ではなく
  // 「最初の会社」に付けるしかないが、その場合も is_remainder を立てて画面に出す。
  let idx = rows.findIndex((r) => r.id === remainderRowId);
  if (idx < 0) idx = 0;

  return rows.map((r, i) => ({
    id: r.id,
    amount: base[i] + (i === idx ? remainder : 0),
    ratio_bp: ratios[i],
    is_remainder: i === idx && remainder !== 0,
  }));
}

/** 合計と総額が合っているか。合わないうちは請求書を出せない。 */
export function checkTotals(total: number, amounts: number[]) {
  const sum = amounts.reduce((a, b) => a + b, 0);
  return { sum, total, matches: sum === total, diff: sum - total };
}

// ───────────────────────────────────────────────────────
// 読み取り
// ───────────────────────────────────────────────────────

/**
 * 会社を選ぶための候補。
 *
 * 顧客の一覧 (`/customers`) は `sales` 権限なので、**経理 (budget だけ) では読めない**。
 * 合同案件を作るのは経理なので、そのままでは会社を1社も選べない。
 * ここでは選ぶのに要る id と名前だけを返す (連絡先や住所は返さない)。
 */
export async function listCompanyChoices() {
  return (await queryAll(
    `SELECT id, name, short_name FROM customers
      WHERE deleted_at IS NULL ORDER BY name`
  )) as any[];
}

export async function listJointEvents() {
  return (await queryAll(
    `SELECT je.*,
            c.name AS organizer_name,
            (SELECT COUNT(*) FROM joint_event_companies jc
              WHERE jc.joint_event_id = je.id AND jc.cancelled_at IS NULL) AS company_count,
            (SELECT COUNT(*) FROM joint_event_companies jc
              WHERE jc.joint_event_id = je.id AND jc.revenue_id IS NOT NULL) AS issued_count
       FROM joint_events je
       JOIN customers c ON c.id = je.organizer_customer_id
      WHERE je.deleted_at IS NULL
      ORDER BY COALESCE(je.event_start, '9999-12-31') DESC, je.created_at DESC`
  )) as any[];
}

export async function getJointEvent(id: string) {
  const event = (await queryOne(
    `SELECT je.*, c.name AS organizer_name
       FROM joint_events je
       JOIN customers c ON c.id = je.organizer_customer_id
      WHERE je.id = ? AND je.deleted_at IS NULL`,
    [id]
  )) as any;
  if (!event) throw new AppError(404, 'NOT_FOUND', '合同案件が見つかりません');

  const companies = (await queryAll(
    `SELECT jc.*,
            c.name  AS company_name,
            bc.name AS billing_company_name,
            p.name  AS project_name, p.gls_number, p.stage,
            r.billing_key, r.invoice_issued, r.invoice_issued_at, r.paid_at, r.paid_amount,
            cr.billing_key AS cancel_billing_key
       FROM joint_event_companies jc
       JOIN customers c        ON c.id  = jc.customer_id
       LEFT JOIN customers bc  ON bc.id = jc.billing_customer_id
       LEFT JOIN projects  p   ON p.id  = jc.project_id
       LEFT JOIN revenues  r   ON r.id  = jc.revenue_id
       LEFT JOIN revenues  cr  ON cr.id = jc.cancel_revenue_id
      WHERE jc.joint_event_id = ?
      ORDER BY jc.sort_order, jc.created_at`,
    [id]
  )) as any[];

  const active = companies.filter((c) => !c.cancelled_at);
  const totals = checkTotals(Number(event.total_amount), active.map((c) => Number(c.amount)));

  // 全体の数字。1社ぶんだけ見ても全体が分からないので、参加案件を横断して集計する。
  const projectIds = companies.map((c) => c.project_id).filter(Boolean);
  let purchase = 0;
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => '?').join(',');
    const row = (await queryOne(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM purchases
        WHERE project_id IN (${placeholders}) AND deleted_at IS NULL`,
      projectIds
    )) as any;
    purchase = Number(row?.s ?? 0);
  }
  const revenue = active.reduce((a, c) => a + Number(c.amount), 0);
  const gross = revenue - purchase;

  return {
    ...event,
    companies: companies.map((c) => ({
      ...c,
      // 請求先が本社と違う会社は、出す前に一度確かめてほしい
      billing_differs: Boolean(c.billing_customer_id),
      amount_with_tax: withTax(Number(c.amount), String(event.tax_category)),
      ratio_percent: Number(event.total_amount) > 0
        ? Math.round((Number(c.amount) / Number(event.total_amount)) * 1000) / 10
        : 0,
    })),
    totals: {
      ...totals,
      total_with_tax: withTax(Number(event.total_amount), String(event.tax_category)),
      revenue,
      purchase,
      gross,
      gross_margin: revenue > 0 ? Math.round((gross / revenue) * 1000) / 10 : 0,
    },
  };
}

// ───────────────────────────────────────────────────────
// 作る
// ───────────────────────────────────────────────────────

/**
 * 合同案件を作る。**会社を選ぶと、その社数ぶんの案件が自動でできる。**
 * 9社なら9案件。ここを手作業にすると1社増えるたびに同じ入力を繰り返すことになる。
 */
export async function createJointEvent(
  data: {
    name?: string;
    event_start?: string | null;
    event_end?: string | null;
    organizer_customer_id?: string;
    company_ids?: string[];
    gls_category?: string;
    tax_category?: string;
    payment_due_date?: string | null;
    total_amount?: number;
  },
  userId: string
) {
  const name = String(data.name ?? '').trim();
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'イベント名を入れてください');

  const organizerId = String(data.organizer_customer_id ?? '');
  if (!organizerId) throw new AppError(400, 'VALIDATION_ERROR', '幹事の会社を選んでください');

  const companyIds = Array.from(new Set((data.company_ids ?? []).map(String).filter(Boolean)));
  if (companyIds.length < 2) {
    throw new AppError(400, 'VALIDATION_ERROR', '費用を分け合う会社を2社以上選んでください');
  }
  if (!companyIds.includes(organizerId)) {
    throw new AppError(400, 'VALIDATION_ERROR', '幹事の会社も参加する会社に含めてください');
  }

  const known = (await queryAll(
    `SELECT id, name, short_name FROM customers
      WHERE id IN (${companyIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
    companyIds
  )) as any[];
  if (known.length !== companyIds.length) {
    throw new AppError(400, 'VALIDATION_ERROR', '選んだ会社の中に見つからないものがあります');
  }
  const nameOf = new Map(known.map((c) => [c.id, c.short_name || c.name]));

  // 案件分類は 'A' (スタジオ) / 'B' (ビジネス)。GLS 発番に必須なので合同案件側で決める。
  const glsCategory: GlsCategory = data.gls_category === 'B' ? 'B' : 'A';
  const eventId = uuidv4();

  await execute(
    `INSERT INTO joint_events (id, name, event_start, event_end, organizer_customer_id,
                               gls_category, tax_category, total_amount, split_mode,
                               remainder_customer_id, payment_due_date, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'equal', NULL, ?, ?, ?)`,
    [
      eventId, name, data.event_start || null, data.event_end || null, organizerId,
      glsCategory, normalizeTaxCategory(data.tax_category), Math.max(0, Math.round(Number(data.total_amount ?? 0))),
      data.payment_due_date || null, userId, userId,
    ]
  );

  // 会社ごとに案件を1つ作る。幹事を先頭に置く (取りまとめる相手なので上に出す)。
  const ordered = [organizerId, ...companyIds.filter((c) => c !== organizerId)];
  const { generateSequenceNumber } = await import('../../../shared/services/sequence.service');

  for (let i = 0; i < ordered.length; i++) {
    const customerId = ordered[i];
    const projectId = uuidv4();
    const code = await generateSequenceNumber('opp_code', 'OPP');
    await execute(
      `INSERT INTO projects (id, code, name, customer_id, stage, project_type, gls_category,
                             expected_amount, assigned_to, event_start, event_end,
                             notes, customer_type, application_form, logo_permission, created_by)
       VALUES (?, ?, ?, ?, ?, 'other', ?, 0, ?, ?, ?, ?, 'external', 0, 0, ?)`,
      [
        projectId, code, `${name}（${nameOf.get(customerId)}）`, customerId, INITIAL_STAGE,
        glsCategory, userId, data.event_start || null, data.event_end || null,
        `合同案件「${name}」の${nameOf.get(customerId)}ぶん`, userId,
      ]
    );

    await execute(
      `INSERT INTO joint_event_companies (id, joint_event_id, customer_id, project_id,
                                          ratio_bp, amount, payment_due_date, sort_order)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [uuidv4(), eventId, customerId, projectId,
       Math.floor(10000 / ordered.length), data.payment_due_date || null, i]
    );
  }

  await recalcSplit(eventId, userId);
  return getJointEvent(eventId);
}

// ───────────────────────────────────────────────────────
// 総額と分け方
// ───────────────────────────────────────────────────────

/** いまの分け方の設定で amount を計算し直して保存する。 */
async function recalcSplit(eventId: string, userId: string) {
  const event = (await queryOne(
    `SELECT total_amount, split_mode, remainder_customer_id FROM joint_events WHERE id = ?`,
    [eventId]
  )) as any;
  if (!event) return;

  const rows = (await queryAll(
    `SELECT id, customer_id, ratio_bp, amount FROM joint_event_companies
      WHERE joint_event_id = ? AND cancelled_at IS NULL ORDER BY sort_order, created_at`,
    [eventId]
  )) as any[];
  if (rows.length === 0) return;

  const mode = (SPLIT_MODES as readonly string[]).includes(event.split_mode)
    ? (event.split_mode as SplitMode)
    : 'equal';

  // あまりの行き先。既定は幹事 (remainder_customer_id が NULL のとき先頭 = 幹事)。
  const remainderRow = event.remainder_customer_id
    ? rows.find((r) => r.customer_id === event.remainder_customer_id)
    : rows[0];

  const split = computeSplit(
    Number(event.total_amount),
    rows.map((r) => ({ id: r.id, ratio_bp: Number(r.ratio_bp), amount: Number(r.amount) })),
    mode,
    remainderRow?.id ?? null
  );

  for (const s of split) {
    await execute(
      `UPDATE joint_event_companies SET amount = ?, ratio_bp = ?, updated_at = NOW() WHERE id = ?`,
      [s.amount, s.ratio_bp, s.id]
    );
  }
  // 分けた金額はそのまま各案件の想定金額になる (税抜)
  for (const s of split) {
    await execute(
      `UPDATE projects SET expected_amount = ?, updated_at = NOW(), updated_by = ?
        WHERE id = (SELECT project_id FROM joint_event_companies WHERE id = ?)`,
      [s.amount, userId, s.id]
    );
  }
}

/** 総額・分け方・あまりの行き先・支払期日を更新して配り直す。 */
export async function updateJointEvent(
  id: string,
  data: {
    name?: string;
    event_start?: string | null;
    event_end?: string | null;
    total_amount?: number;
    split_mode?: string;
    remainder_customer_id?: string | null;
    payment_due_date?: string | null;
    tax_category?: string;
    // 割合 / 金額を直接入れるとき: [{ company_row_id, ratio_bp?, amount? }]
    entries?: Array<{ id: string; ratio_bp?: number; amount?: number; payment_due_date?: string | null; billing_customer_id?: string | null }>;
  },
  userId: string
) {
  const event = (await queryOne(
    `SELECT * FROM joint_events WHERE id = ? AND deleted_at IS NULL`, [id]
  )) as any;
  if (!event) throw new AppError(404, 'NOT_FOUND', '合同案件が見つかりません');

  const mode = data.split_mode && (SPLIT_MODES as readonly string[]).includes(data.split_mode)
    ? data.split_mode
    : event.split_mode;

  await execute(
    `UPDATE joint_events
        SET name = ?, event_start = ?, event_end = ?, total_amount = ?, split_mode = ?,
            remainder_customer_id = ?, payment_due_date = ?, tax_category = ?,
            updated_at = NOW(), updated_by = ?
      WHERE id = ?`,
    [
      data.name?.trim() || event.name,
      data.event_start !== undefined ? data.event_start : event.event_start,
      data.event_end !== undefined ? data.event_end : event.event_end,
      data.total_amount !== undefined ? Math.max(0, Math.round(Number(data.total_amount))) : event.total_amount,
      mode,
      data.remainder_customer_id !== undefined ? data.remainder_customer_id : event.remainder_customer_id,
      data.payment_due_date !== undefined ? data.payment_due_date : event.payment_due_date,
      data.tax_category ? normalizeTaxCategory(data.tax_category) : event.tax_category,
      userId, id,
    ]
  );

  for (const e of data.entries ?? []) {
    await execute(
      `UPDATE joint_event_companies
          SET ratio_bp = COALESCE(?, ratio_bp),
              amount   = COALESCE(?, amount),
              payment_due_date = COALESCE(?, payment_due_date),
              billing_customer_id = ?,
              updated_at = NOW()
        WHERE id = ? AND joint_event_id = ?`,
      [
        e.ratio_bp !== undefined ? Math.max(0, Math.round(Number(e.ratio_bp))) : null,
        e.amount !== undefined ? Math.max(0, Math.round(Number(e.amount))) : null,
        e.payment_due_date ?? null,
        e.billing_customer_id ?? null,
        e.id, id,
      ]
    );
  }

  await recalcSplit(id, userId);
  return getJointEvent(id);
}

/**
 * 1社だけ金額を直したときの差額の始末。
 *  - 'others'   … 残りの社で割り直す
 *  - 'organizer'… 幹事に寄せる
 * どちらも「合計を総額に合わせる」ためのもので、勝手には走らせない (人が選ぶ)。
 */
export async function absorbDifference(
  id: string, keepCompanyId: string, how: 'others' | 'organizer', userId: string
) {
  const event = (await queryOne(
    `SELECT * FROM joint_events WHERE id = ? AND deleted_at IS NULL`, [id]
  )) as any;
  if (!event) throw new AppError(404, 'NOT_FOUND', '合同案件が見つかりません');

  const rows = (await queryAll(
    `SELECT id, customer_id, amount FROM joint_event_companies
      WHERE joint_event_id = ? AND cancelled_at IS NULL ORDER BY sort_order, created_at`,
    [id]
  )) as any[];
  const kept = rows.find((r) => r.id === keepCompanyId);
  if (!kept) throw new AppError(404, 'NOT_FOUND', '対象の会社が見つかりません');

  const total = Number(event.total_amount);
  const rest = rows.filter((r) => r.id !== keepCompanyId);
  const remaining = total - Number(kept.amount);

  if (how === 'organizer') {
    const organizer = rows.find((r) => r.customer_id === event.organizer_customer_id);
    if (!organizer || organizer.id === keepCompanyId) {
      throw new AppError(400, 'VALIDATION_ERROR', '幹事の会社を直したときは「残りの社で割り直す」を選んでください');
    }
    const others = rest.filter((r) => r.id !== organizer.id);
    const othersSum = others.reduce((a, r) => a + Number(r.amount), 0);
    await execute(
      `UPDATE joint_event_companies SET amount = ?, updated_at = NOW() WHERE id = ?`,
      [Math.max(0, remaining - othersSum), organizer.id]
    );
  } else {
    if (rest.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '割り直す相手がいません');
    const base = Math.floor(remaining / rest.length);
    const rem = remaining - base * rest.length;
    for (let i = 0; i < rest.length; i++) {
      await execute(
        `UPDATE joint_event_companies SET amount = ?, updated_at = NOW() WHERE id = ?`,
        [base + (i === 0 ? rem : 0), rest[i].id]
      );
    }
  }

  // 直接いじったので、以降は金額をそのまま使う (割合で上書きしない)
  await execute(
    `UPDATE joint_events SET split_mode = 'manual', updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [userId, id]
  );
  return getJointEvent(id);
}

// ───────────────────────────────────────────────────────
// 請求書を出す
// ───────────────────────────────────────────────────────

async function ensureGls(projectId: string, userId: string): Promise<string> {
  const p = (await queryOne(`SELECT gls_number, gls_category FROM projects WHERE id = ?`, [projectId])) as any;
  if (p?.gls_number) return String(p.gls_number);
  const { generateGlsNumber } = await import('../../../shared/services/sequence.service');
  const gls = await generateGlsNumber(p?.gls_category === 'B' ? 'B' : 'A');
  await execute(
    `UPDATE projects SET gls_number = ?, stage = 'a_won', updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [gls, userId, projectId]
  );
  return gls;
}

// 税枝番は tax-category.service 1か所 (不課税を足したときに漏れないように)

/**
 * 参加社数ぶんの請求書をまとめて出す。
 *
 * **合計が総額に合わないうちは1枚も出さない。** 画面で押せないだけでなく
 * ここでも止める (画面だけの制限は必ず抜ける)。
 * 番号は1枚ごとに採る。9社なら9本。
 */
export async function issueInvoices(id: string, userId: string) {
  const detail = await getJointEvent(id);
  const active = detail.companies.filter((c: any) => !c.cancelled_at);

  if (active.length === 0) throw new AppError(400, 'VALIDATION_ERROR', '請求する会社がありません');
  if (Number(detail.total_amount) <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '総額を入れてから請求書を出してください');
  }
  if (!detail.totals.matches) {
    const diff = detail.totals.diff;
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `各社の合計が総額と ${Math.abs(diff).toLocaleString('ja-JP')}円 ${diff > 0 ? '多い' : '少ない'}ので出せません。` +
      `「残りの社で割り直す」か「幹事に寄せる」で合わせてください。`
    );
  }

  const issued: Array<{ company: string; billing_key: string }> = [];
  for (const c of active) {
    if (c.revenue_id) continue; // 既に出しているものは二度出さない
    if (!c.project_id) continue;

    const gls = await ensureGls(String(c.project_id), userId);
    // 同じ GLS の確定売上の本数から次の連番を採る。
    // 削除済みも数える (連番は飛んでよい。番号の重複のほうが困る)。
    const cnt = ((await queryOne(
      `SELECT COUNT(*) AS c FROM revenues r JOIN projects p ON p.id = r.project_id
        WHERE p.gls_number = ? AND r.status = 'confirmed'`, [gls]
    )) as any).c;
    const seq = String(Number(cnt) + 1).padStart(3, '0');
    const billingKey = `${gls}-${seq}-${taxBillingSuffix(detail.tax_category)}`;

    const revenueId = uuidv4();
    await execute(
      `INSERT INTO revenues (id, billing_key, project_id, customer_id, assigned_to, tax_category,
                             amount, status, payment_due_date, subtitle, notes,
                             invoice_issued, invoice_issued_at, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, TRUE, NOW(), ?, ?)`,
      [
        revenueId, billingKey, c.project_id,
        // 請求先が本社と違うときはそちらを宛名にする
        c.billing_customer_id || c.customer_id,
        userId, detail.tax_category, c.amount,
        c.payment_due_date || detail.payment_due_date || null,
        `合同案件「${detail.name}」`,
        `合同案件「${detail.name}」の${c.company_name}ぶん`,
        userId, userId,
      ]
    );
    await execute(
      `UPDATE joint_event_companies SET revenue_id = ?, updated_at = NOW() WHERE id = ?`,
      [revenueId, c.id]
    );
    issued.push({ company: String(c.company_name), billing_key: billingKey });
  }

  await execute(
    `UPDATE joint_events SET issued_at = COALESCE(issued_at, NOW()), updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [userId, id]
  );

  return { issued, count: issued.length, event: await getJointEvent(id) };
}

/**
 * 出したあとに1社抜けたとき。
 *
 * **出した請求書は消せない。** 取り消しの請求書 (マイナス1枚) を出して、
 * 残りの社に配り直す。画面には「取り消し済み」と出して履歴に残す。
 */
export async function cancelCompany(
  id: string, companyRowId: string,
  opts: { redistribute?: 'others' | 'organizer' | 'none' },
  userId: string
) {
  const event = (await queryOne(
    `SELECT * FROM joint_events WHERE id = ? AND deleted_at IS NULL`, [id]
  )) as any;
  if (!event) throw new AppError(404, 'NOT_FOUND', '合同案件が見つかりません');

  const row = (await queryOne(
    `SELECT jc.*, c.name AS company_name FROM joint_event_companies jc
       JOIN customers c ON c.id = jc.customer_id
      WHERE jc.id = ? AND jc.joint_event_id = ?`,
    [companyRowId, id]
  )) as any;
  if (!row) throw new AppError(404, 'NOT_FOUND', '対象の会社が見つかりません');
  if (row.cancelled_at) throw new AppError(400, 'VALIDATION_ERROR', 'この会社は既に外れています');
  if (row.customer_id === event.organizer_customer_id) {
    throw new AppError(400, 'VALIDATION_ERROR', '幹事の会社は外せません。先に幹事を変えてください');
  }

  const remaining = (await queryAll(
    `SELECT id, customer_id, amount FROM joint_event_companies
      WHERE joint_event_id = ? AND cancelled_at IS NULL AND id <> ?
      ORDER BY sort_order, created_at`,
    [id, companyRowId]
  )) as any[];
  if (remaining.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '最後の1社は外せません');
  }

  let cancelRevenueId: string | null = null;
  if (row.revenue_id) {
    // 既に出しているので、取り消しの請求書を1枚出す (元の請求書は消さない)
    const src = (await queryOne(`SELECT * FROM revenues WHERE id = ?`, [row.revenue_id])) as any;
    const p = (await queryOne(`SELECT gls_number FROM projects WHERE id = ?`, [row.project_id])) as any;
    const cnt = ((await queryOne(
      `SELECT COUNT(*) AS c FROM revenues r JOIN projects p2 ON p2.id = r.project_id
        WHERE p2.gls_number = ? AND r.status = 'confirmed'`, [p?.gls_number]
    )) as any).c;
    const seq = String(Number(cnt) + 1).padStart(3, '0');
    const billingKey = `${p?.gls_number}-${seq}-${taxBillingSuffix(event.tax_category)}`;

    cancelRevenueId = uuidv4();
    await execute(
      `INSERT INTO revenues (id, billing_key, project_id, customer_id, assigned_to, tax_category,
                             amount, status, subtitle, notes, invoice_issued, invoice_issued_at,
                             created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, TRUE, NOW(), ?, ?)`,
      [
        cancelRevenueId, billingKey, row.project_id, src?.customer_id ?? row.customer_id, userId,
        event.tax_category, -Math.abs(Number(row.amount)),
        `合同案件「${event.name}」取り消し`,
        `${row.company_name} が外れたための取り消し（元: ${src?.billing_key ?? ''}）`,
        userId, userId,
      ]
    );
  }

  await execute(
    `UPDATE joint_event_companies SET cancelled_at = NOW(), cancel_revenue_id = ?, updated_at = NOW() WHERE id = ?`,
    [cancelRevenueId, companyRowId]
  );

  // 抜けたぶんを配り直す。選ばれていなければ配り直さない (総額のほうを下げる想定)。
  const how = opts.redistribute ?? 'others';
  if (how === 'none') {
    await execute(
      `UPDATE joint_events SET total_amount = total_amount - ?, split_mode = 'manual',
              updated_at = NOW(), updated_by = ? WHERE id = ?`,
      [Math.abs(Number(row.amount)), userId, id]
    );
  } else if (how === 'organizer') {
    const organizer = remaining.find((r) => r.customer_id === event.organizer_customer_id);
    if (organizer) {
      await execute(
        `UPDATE joint_event_companies SET amount = amount + ?, updated_at = NOW() WHERE id = ?`,
        [Math.abs(Number(row.amount)), organizer.id]
      );
    }
    await execute(`UPDATE joint_events SET split_mode = 'manual', updated_at = NOW(), updated_by = ? WHERE id = ?`, [userId, id]);
  } else {
    const share = Math.abs(Number(row.amount));
    const base = Math.floor(share / remaining.length);
    const rem = share - base * remaining.length;
    for (let i = 0; i < remaining.length; i++) {
      await execute(
        `UPDATE joint_event_companies SET amount = amount + ?, updated_at = NOW() WHERE id = ?`,
        [base + (i === 0 ? rem : 0), remaining[i].id]
      );
    }
    await execute(`UPDATE joint_events SET split_mode = 'manual', updated_at = NOW(), updated_by = ? WHERE id = ?`, [userId, id]);
  }

  return getJointEvent(id);
}
