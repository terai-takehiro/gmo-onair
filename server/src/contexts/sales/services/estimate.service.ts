/**
 * 見積をつくる (デザイン 30章 37a / 仕様書 §7.4)
 *
 * 案件の「お金」の中で、料金表と似た案件から明細を組み、粗利をその場で出して確定する。
 *
 * ── 器は既存の概算見積を使う ──────────────────────────
 * `revenues(status='estimate')` + `revenue_items`。新しいテーブルは作っていない
 * (理由は migration 145 のコメント)。1案件 = 見積1本で、作り直しても行を差し替えるだけ。
 *
 * ── 決めごと ──────────────────────────────────────────
 *  - **金額を決めるのは人**。AI は明細の下書きまで。確定 (confirm) は人が押す
 *  - **ONAiR はメールを送らない**。PDF を出して BOX に残し、送るのは人。「送った」は記録するだけ
 *  - 金額は**税抜で保持**する (消費税と支払額は表示のときに足す)
 *  - 値引きは明細を書き換えず `discount_amount` に持つ (元の単価を消さない)
 *  - 行の「仕入(見込み)」は**受注したときに見込み仕入になる** (二度打ちしない)
 *
 * ── AI を使い捨てにしない (5条件) ──────────────────────
 *  ①出力を記録   → `ai_outputs` (kind='estimate_draft'・target_table='revenues'・全文)
 *  ②修正を差分で → `ai_corrections` (保存時にサーバーが自動で突合。none/fix/reject/enrich)
 *  ③成果を紐づけ → `ai_outcomes` (confirmed / sent / won / lost + 粗利率・値引き率)
 *  ④AIに戻す     → 生成前に `getFeedbackDigest('estimate_draft')` を読んでプロンプトに載せる
 *  ⑤レビュー     → MCP `get_ai_feedback_digest` と `/review`
 *
 * 既存の料金シミュレーション (`simulations`) は `target_table='projects'` で同じ kind を
 * 使っているため、突合が混ざらない (こちらは 'revenues')。kind を揃えているのは
 * 「見積の下書きの成績」を1つの数字で読みたいから。
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import * as z from 'zod/v4';
import { zodTextFormat } from 'openai/helpers/zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  recordAiOutput, recordCorrections, recordAiOutcome, diffByKey,
} from '../../../shared/services/ai-output.service';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { resolveProvider, intakeAiModel } from '../../tasks/services/intake-ai.service';

const KIND = 'estimate_draft';
const PROMPT_VERSION_BASE = 'estimate-draft-v1';
const TIMEOUT_MS = 40_000;

/** 明細のグループ。デザイン 30a の3つに固定する (増やすと並び順が読めなくなる) */
export const ESTIMATE_GROUPS = ['スタジオ', '技術・人員', '制作・その他'] as const;
export type EstimateGroup = typeof ESTIMATE_GROUPS[number];

/** 粗利率がこれを切ると画面で赤く出す (止めはしない) */
export const GROSS_MARGIN_WARN = 0.30;

const TAX_RATE: Record<string, number> = { tax10: 0.10, tax8: 0.08, exempt: 0 };

export interface EstimateItemInput {
  id?: string | null;
  description: string;
  category?: string | null;
  quantity?: number;
  unit?: string | null;
  unit_price?: number;
  amount?: number;
  cost_amount?: number;
  cost_vendor_id?: string | null;
  item_notes?: string | null;
  /** この行だけの期間 (日付だけ)。空なら見積書 PDF は案件の予定で出す */
  period_start?: string | null;
  period_end?: string | null;
  pricing_item_id?: string | null;
  is_ai_suggested?: boolean;
}

export interface EstimateTotals {
  items_total: number;
  discount_amount: number;
  subtotal: number;
  tax_amount: number;
  payable: number;
  cost_total: number;
  gross_profit: number;
  /** 0〜1。小計が 0 のときは null (0% と 0 件を区別する) */
  gross_margin: number | null;
  below_warn: boolean;
}

/** 明細とグループから合計を組む。**画面とサーバーで同じ式を使う**ための一点 */
export function computeTotals(
  items: Array<{ amount?: number; cost_amount?: number }>,
  discount: number,
  taxCategory: string,
): EstimateTotals {
  const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const costTotal = items.reduce((s, it) => s + (Number(it.cost_amount) || 0), 0);
  const discountAmount = Math.max(0, Math.round(Number(discount) || 0));
  const subtotal = itemsTotal - discountAmount;
  const rate = TAX_RATE[taxCategory] ?? TAX_RATE.tax10;
  const taxAmount = Math.round(subtotal * rate);
  const grossProfit = subtotal - costTotal;
  const grossMargin = subtotal > 0 ? grossProfit / subtotal : null;
  return {
    items_total: itemsTotal,
    discount_amount: discountAmount,
    subtotal,
    tax_amount: taxAmount,
    payable: subtotal + taxAmount,
    cost_total: costTotal,
    gross_profit: grossProfit,
    gross_margin: grossMargin,
    below_warn: grossMargin !== null && grossMargin < GROSS_MARGIN_WARN,
  };
}

const ITEM_COLS = `id, revenue_id, description, category, quantity, unit, unit_price, amount,
  cost_amount, cost_vendor_id, item_notes, period_start, period_end,
  pricing_item_id, is_ai_suggested, sort_order`;

/** この案件の見積 (1本)。無ければ null */
async function findEstimateRow(projectId: string) {
  return (await queryOne(
    `SELECT r.*, c.name AS customer_name, c.address AS customer_address, c.contact_name AS customer_contact
     FROM revenues r
     LEFT JOIN customers c ON c.id = r.customer_id
     WHERE r.project_id = ? AND r.status = 'estimate' AND r.deleted_at IS NULL
     ORDER BY r.created_at ASC LIMIT 1`,
    [projectId],
  )) as Record<string, any> | null;
}

async function loadProject(projectId: string) {
  // customer_type は **projects** の列 (migration 051)。顧客マスタ側ではない
  const project = await queryOne(
    `SELECT p.*, c.name AS customer_name
     FROM projects p LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.id = ? AND p.deleted_at IS NULL AND p.is_sandbox = FALSE`,
    [projectId],
  ) as Record<string, any> | null;
  if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
  return project;
}

/**
 * 似た案件。同じお客様 → 同じくらいの規模 の順で拾い、確定売上と仕入から粗利率を出す。
 *
 * 見積を作る人が最初に知りたいのは「前回この会社に幾らで出したか」なので、
 * 同じ顧客を優先する。実績 (確定売上) がある案件だけを返す — 見積だけの案件を混ぜると
 * 「その金額で通ったのか」が分からず参考にならない。
 */
export async function findSimilarProjects(projectId: string, limit = 3) {
  const project = await loadProject(projectId);
  return await queryAll(
    `SELECT p.id, p.name, p.gls_number, p.event_start, p.customer_id,
            c.name AS customer_name,
            COALESCE(rev.total, 0) AS revenue_total,
            COALESCE(pur.total, 0) AS purchase_total,
            (p.customer_id IS NOT NULL AND p.customer_id = ?) AS same_customer
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     LEFT JOIN (
       SELECT project_id, SUM(amount) AS total FROM revenues
       WHERE status = 'confirmed' AND deleted_at IS NULL GROUP BY project_id
     ) rev ON rev.project_id = p.id
     LEFT JOIN (
       SELECT project_id, SUM(amount) AS total FROM purchases
       WHERE deleted_at IS NULL GROUP BY project_id
     ) pur ON pur.project_id = p.id
     WHERE p.id <> ? AND p.deleted_at IS NULL AND p.is_sandbox = FALSE AND COALESCE(rev.total, 0) > 0
     ORDER BY (p.customer_id IS NOT NULL AND p.customer_id = ?) DESC,
              ABS(COALESCE(rev.total, 0) - ?) ASC,
              p.event_start DESC NULLS LAST
     LIMIT ?`,
    [project.customer_id, projectId, project.customer_id, Number(project.expected_amount) || 0, limit],
  ) as Array<Record<string, any>>;
}

/**
 * 画面 1 枚ぶんをまとめて返す。
 * 見積が無い案件でも 200 で返す (estimate: null) — 「まだ作っていない」は異常ではない。
 */
export async function getEstimate(projectId: string) {
  const project = await loadProject(projectId);
  const row = await findEstimateRow(projectId);

  const items = row
    ? (await queryAll(
        `SELECT ${ITEM_COLS} FROM revenue_items WHERE revenue_id = ? ORDER BY sort_order, created_at`,
        [row.id],
      )) as Array<Record<string, any>>
    : [];

  const taxCategory = String(row?.tax_category ?? 'tax10');
  const totals = computeTotals(items, Number(row?.discount_amount) || 0, taxCategory);

  // AI 下書きの由来 (いつ・誰の指示・どのモデル)。人が足した行と区別して見せるために出す
  let aiOrigin: Record<string, any> | null = null;
  if (row) {
    aiOrigin = (await queryOne(
      `SELECT o.created_at, o.model, o.prompt_version, o.requested_by, u.name AS actor_name
       FROM ai_outputs o LEFT JOIN users u ON u.id = o.actor_id
       WHERE o.kind = ? AND o.target_table = 'revenues' AND o.target_id = ?
       ORDER BY o.created_at DESC LIMIT 1`,
      [KIND, row.id],
    )) as Record<string, any> | null;
  }

  // 送付期限。**新しい列は作らない** — 案件の未完了の次回アクションを正とする
  // (「待たせているもの」と同じ元データを使う。ここだけ別の期限を持つと2つの締切ができる)
  const nextAction = (await queryOne(
    `SELECT next_action, next_action_date FROM activity_logs
     WHERE project_id = ? AND deleted_at IS NULL
       AND next_action IS NOT NULL AND next_action <> ''
       AND next_action_date IS NOT NULL AND next_action_done_at IS NULL
     ORDER BY next_action_date ASC LIMIT 1`,
    [projectId],
  )) as Record<string, any> | null;

  return {
    project: {
      id: project.id,
      name: project.name,
      gls_number: project.gls_number,
      stage: project.stage,
      customer_id: project.customer_id,
      customer_name: project.customer_name,
      customer_type: project.customer_type,
      expected_amount: Number(project.expected_amount) || 0,
      event_start: project.event_start,
      event_end: project.event_end,
      box_url_external: project.box_url_external ?? null,
    },
    estimate: row
      ? {
          id: row.id,
          billing_key: row.billing_key,
          subtitle: row.subtitle ?? null,
          tax_category: taxCategory,
          discount_amount: Number(row.discount_amount) || 0,
          version: Number(row.estimate_version) || 1,
          sent_at: row.estimate_sent_at ?? null,
          confirmed_at: row.estimate_confirmed_at ?? null,
          pdf_box_file_id: row.estimate_pdf_box_file_id ?? null,
          notes: row.notes ?? null,
          updated_at: row.updated_at,
        }
      : null,
    items,
    totals,
    groups: ESTIMATE_GROUPS,
    ai_origin: aiOrigin,
    next_action: nextAction
      ? { text: nextAction.next_action, date: nextAction.next_action_date }
      : null,
    similar: await findSimilarProjects(projectId),
  };
}

interface NormalizedItem {
  id: string | null;
  description: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  amount: number;
  cost_amount: number;
  cost_vendor_id: string | null;
  item_notes: string | null;
  period_start: string | null;
  period_end: string | null;
  pricing_item_id: string | null;
  is_ai_suggested: boolean;
}

/**
 * 行の期間は**日付だけ (YYYY-MM-DD)** で持つ。
 *
 * `revenue_items.period_start` は TEXT (migration 073) なので、何を入れても列は通る。
 * 空文字を入れると PDF が「期間: 」と中身の無い行を出すので **null に寄せる**。
 * 秒つきの値が来ても日付だけに切る (既存の売上明細に混ざっている形)。
 */
function normalizeDateOnly(value: unknown, label: string): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) {
    throw new AppError(
      400, 'VALIDATION_ERROR',
      `${label}は年月日で指定してください（受け取った値: ${s.slice(0, 40)}）`,
    );
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizeItems(items: EstimateItemInput[]): NormalizedItem[] {
  return (items ?? []).map((it) => {
    const quantity = Number(it.quantity) || 0;
    const unitPrice = Math.round(Number(it.unit_price) || 0);
    // 金額は渡された値を優先する (料金表の計算タイプで数量×単価にならない行がある)。
    // 未指定なら数量×単価で埋める
    const amount = it.amount != null && it.amount !== undefined
      ? Math.round(Number(it.amount) || 0)
      : Math.round(quantity * unitPrice);
    const description = String(it.description ?? '').trim();
    const shown = description || '（品目名なし）';
    const periodStart = normalizeDateOnly(it.period_start, `「${shown}」の期間（開始）`);
    const periodEnd = normalizeDateOnly(it.period_end, `「${shown}」の期間（終了）`);
    // 逆さまの期間は入れさせない。PDF は「期間: 8/21 〜 8/19」とそのまま刷るので、
    // 受け取った側が読めないものが社外に出る
    if (periodStart && periodEnd && periodEnd < periodStart) {
      throw new AppError(
        400, 'VALIDATION_ERROR',
        `「${shown}」の期間が逆さまです（終了 ${periodEnd} が開始 ${periodStart} より前）。開始と終了を入れ替えてください`,
      );
    }
    return {
      id: it.id ?? null,
      description,
      category: it.category ? String(it.category) : null,
      quantity,
      unit: it.unit ? String(it.unit) : null,
      unit_price: unitPrice,
      amount,
      cost_amount: Math.max(0, Math.round(Number(it.cost_amount) || 0)),
      cost_vendor_id: it.cost_vendor_id || null,
      item_notes: it.item_notes ? String(it.item_notes) : null,
      period_start: periodStart,
      period_end: periodEnd,
      pricing_item_id: it.pricing_item_id || null,
      is_ai_suggested: !!it.is_ai_suggested,
    };
  }).filter((it) => it.description !== '');
}

/**
 * 保存 (下書きのまま)。**確定ではない** ので想定金額とステージには触らない。
 *
 * 保存のたびに AI 下書きとの差分を `ai_corrections` に積む。ここが教師データの回収点で、
 * 「AI は 120 万・営業は 95 万に直した」という一番価値のある情報を、
 * 明細が上書きされる前に取る。突合は行の**品目名**で行う (index だと 1 行足しただけで
 * 以降すべてが「変更された」ことになり修正率が実態とかけ離れる)。
 */
export async function saveEstimate(
  projectId: string,
  body: { items: EstimateItemInput[]; discount_amount?: number; tax_category?: string; subtitle?: string | null; notes?: string | null },
  actor: { userId: string },
) {
  const project = await loadProject(projectId);
  if (!Array.isArray(body?.items)) {
    throw new AppError(400, 'VALIDATION_ERROR', '明細 (items) は配列で指定してください');
  }
  const items = normalizeItems(body.items);
  const taxCategory = TAX_RATE[String(body.tax_category ?? '')] !== undefined
    ? String(body.tax_category) : 'tax10';
  const discount = Math.max(0, Math.round(Number(body.discount_amount) || 0));

  let row = await findEstimateRow(projectId);

  await withTransaction(async (tx) => {
    if (!row) {
      if (!project.customer_id) {
        throw new AppError(400, 'VALIDATION_ERROR', 'お客様が未設定の案件では見積を作れません。先に案件のお客様を選んでください');
      }
      const id = uuidv4();
      // 概算見積の billing_key は案件コード基底 (GLS 未発番のため)。
      // GLS 発番時に migrateEstimates が確定売上の採番へ振り替える
      const billingKey = `EST-${project.code ?? String(project.id).slice(0, 8)}-1`;
      await tx.execute(
        `INSERT INTO revenues
           (id, billing_key, project_id, customer_id, assigned_to, tax_category, amount,
            status, discount_amount, estimate_version, subtitle, notes, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'estimate', ?, 1, ?, ?, ?, ?)`,
        [id, billingKey, projectId, project.customer_id, project.assigned_to ?? actor.userId,
         taxCategory, discount, body.subtitle ?? null, body.notes ?? null, actor.userId, actor.userId],
      );
      row = { id } as Record<string, any>;
    }

    const totals = computeTotals(items, discount, taxCategory);
    await tx.execute(
      `UPDATE revenues SET amount = ?, tax_category = ?, discount_amount = ?,
              subtitle = COALESCE(?, subtitle), notes = COALESCE(?, notes),
              updated_at = NOW(), updated_by = ?
       WHERE id = ?`,
      [totals.subtotal, taxCategory, discount, body.subtitle ?? null, body.notes ?? null, actor.userId, row!.id],
    );

    await tx.execute(`DELETE FROM revenue_items WHERE revenue_id = ?`, [row!.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await tx.execute(
        `INSERT INTO revenue_items
           (id, revenue_id, description, category, quantity, unit, unit_price, amount,
            cost_amount, cost_vendor_id, item_notes, period_start, period_end,
            pricing_item_id, is_ai_suggested, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), row!.id, it.description, it.category, it.quantity, it.unit, it.unit_price, it.amount,
         it.cost_amount, it.cost_vendor_id, it.item_notes, it.period_start, it.period_end,
         it.pricing_item_id, it.is_ai_suggested, i],
      );
    }
  });

  await recordEstimateCorrections(row!.id, items, actor.userId);
  return getEstimate(projectId);
}

/** AI 下書きと人が保存した明細を突き合わせて差分を積む (best-effort) */
async function recordEstimateCorrections(
  revenueId: string,
  items: Array<Record<string, any>>,
  userId: string,
) {
  const draft = (await queryOne(
    `SELECT id, payload_snapshot FROM ai_outputs
     WHERE kind = ? AND target_table = 'revenues' AND target_id = ?
       AND created_at > NOW() - INTERVAL '7 days'
     ORDER BY created_at DESC LIMIT 1`,
    [KIND, revenueId],
  )) as Record<string, any> | null;
  if (!draft) return;

  // 差分を書いた出力は次から飛ばす (何度保存しても数字が動かないようにする)。
  // これが無いと保存のたびに分母が膨らんで無修正採用率が壊れる (v2.9.275 と同じ理由)
  const already = (await queryOne(
    `SELECT 1 AS x FROM ai_corrections WHERE output_id = ? LIMIT 1`, [draft.id],
  )) as Record<string, any> | null;
  if (already) return;

  const payload = typeof draft.payload_snapshot === 'string'
    ? JSON.parse(draft.payload_snapshot) : draft.payload_snapshot;
  const before = (payload?.items ?? []) as Array<Record<string, any>>;
  const corrections = diffByKey(
    before, items, 'description',
    ['quantity', 'unit_price', 'amount', 'cost_amount', 'category'],
  );
  await recordCorrections(
    draft.id,
    corrections.length ? corrections : [{ fieldPath: 'items', type: 'none', note: '無修正で保存' }],
    userId,
  );
}

/**
 * この金額で確定する。想定金額に入れ、ステージを見積提案に進める。
 *
 * **ステージは前に戻さない**。口頭決定・受注済の案件で見積を直したときに
 * 見積提案へ引き戻すと、進んだ案件が巻き戻って営業の一覧が嘘になる。
 */
export async function confirmEstimate(projectId: string, actor: { userId: string }) {
  const project = await loadProject(projectId);
  const row = await findEstimateRow(projectId);
  if (!row) throw new AppError(400, 'VALIDATION_ERROR', '見積がまだありません。明細を作って保存してください');

  const items = (await queryAll(
    `SELECT amount, cost_amount FROM revenue_items WHERE revenue_id = ?`, [row.id],
  )) as Array<Record<string, any>>;
  if (!items.length) throw new AppError(400, 'VALIDATION_ERROR', '明細が1行もありません');

  const totals = computeTotals(items, Number(row.discount_amount) || 0, String(row.tax_category));

  // 想定金額は**税抜**で入れる (この製品は金額を税抜で保持する)
  await execute(
    `UPDATE projects SET expected_amount = ?, updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [totals.subtotal, actor.userId, projectId],
  );

  const forwardable = ['neta', 'd_hold'];
  let stageChanged = false;
  if (forwardable.includes(String(project.stage))) {
    await execute(
      `UPDATE projects SET stage = 'c_proposal', updated_at = NOW(), updated_by = ? WHERE id = ?`,
      [actor.userId, projectId],
    );
    stageChanged = true;
  }

  await execute(
    `UPDATE revenues SET estimate_confirmed_at = NOW(), updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [actor.userId, row.id],
  );

  await recordEstimateOutcome(row.id, 'confirmed', totals);
  return { ...(await getEstimate(projectId)), stage_changed: stageChanged };
}

/**
 * 送ったと記録する (ONAiR は送らない)。
 * 次にやること「申込書をもらう」を自動で立てる — 送ったあとに何が起きるかは決まっているので
 * 人に思い出させない。
 */
export async function markEstimateSent(
  projectId: string,
  actor: { userId: string },
  opts: { note?: string | null } = {},
) {
  const row = await findEstimateRow(projectId);
  if (!row) throw new AppError(400, 'VALIDATION_ERROR', '見積がまだありません');

  await execute(
    `UPDATE revenues SET estimate_sent_at = NOW(), updated_at = NOW(), updated_by = ? WHERE id = ?`,
    [actor.userId, row.id],
  );

  // 申込書をもらう = 1週間後を期限に立てる (日付だけの列なので、この製品の約束どおり 18:00 締めとして読む)
  const due = new Date();
  due.setDate(due.getDate() + 7);
  const dueStr = due.toISOString().slice(0, 10);
  await execute(
    `INSERT INTO activity_logs
       (id, project_id, user_id, activity_type, activity_date, subject, description,
        next_action, next_action_date, created_by)
     VALUES (?, ?, ?, 'email', ?, ?, ?, '申込書をもらう', ?, ?)`,
    [uuidv4(), projectId, actor.userId, new Date().toISOString().slice(0, 10),
     '見積を送付', opts.note ?? null, dueStr, actor.userId],
  );

  const items = (await queryAll(
    `SELECT amount, cost_amount FROM revenue_items WHERE revenue_id = ?`, [row.id],
  )) as Array<Record<string, any>>;
  await recordEstimateOutcome(
    row.id, 'sent',
    computeTotals(items, Number(row.discount_amount) || 0, String(row.tax_category)),
  );
  return getEstimate(projectId);
}

/** 成果を AI 出力に紐づける (best-effort・出力が無ければ何もしない) */
async function recordEstimateOutcome(revenueId: string, outcome: string, totals: EstimateTotals) {
  const draft = (await queryOne(
    `SELECT id FROM ai_outputs
     WHERE kind = ? AND target_table = 'revenues' AND target_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [KIND, revenueId],
  )) as Record<string, any> | null;
  if (!draft) return;
  await recordAiOutcome(
    draft.id, outcome,
    { key: 'gross_margin', value: totals.gross_margin ?? 0 },
    `小計 ${totals.subtotal} / 仕入 ${totals.cost_total} / 値引き ${totals.discount_amount}`,
  );
}

// ── AI の下書き ────────────────────────────────────────

const DraftSchema = z.object({
  items: z.array(z.object({
    group: z.enum(ESTIMATE_GROUPS),
    description: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unit_price: z.number(),
    cost_amount: z.number(),
    note: z.string(),
    /** 料金表にも似た案件にも無く、AI が推測で足した行。画面でオレンジの印を出す */
    inferred: z.boolean(),
  })),
  /** 何を根拠にしたか (画面のチップに出す) */
  bases: z.array(z.string()),
});

const SYSTEM_PROMPT = [
  'あなたは映像制作スタジオ (GMOグローバルスタジオ) の見積明細を下書きする担当です。',
  '渡された料金表と過去の似た案件から、この案件の見積明細を組んでください。',
  '',
  '守ること:',
  '- **料金表にある品目は料金表の単価をそのまま使う**。勝手に値引きや割増をしない',
  '- 料金表に無い品目を足すときは inferred=true にする (人が確認するための印)',
  '- グループは「スタジオ」「技術・人員」「制作・その他」の3つだけを使う',
  '- 数量と単位は案件の内容 (日数・台数・系統数) から決める。分からなければ 1 と「式」にする',
  '- cost_amount は**外部に払う見込み額**。社内でまわせる作業は 0 にする。推測で大きな数字を入れない',
  '- note は 1 行だけ。日付や根拠を短く書く。空でよい',
  '- **合計金額・粗利・値引きは書かない** (人が画面で決める)',
  '- 10〜14 行に収める。細かすぎる行を並べない',
].join('\n');

function buildDraftPrompt(
  project: Record<string, any>,
  pricing: Array<Record<string, any>>,
  similar: Array<Record<string, any>>,
  advice: string | null,
): string {
  const lines: string[] = ['# この案件', `案件名: ${project.name}`];
  if (project.customer_name) lines.push(`お客様: ${project.customer_name}（${project.customer_type === 'internal' ? 'グループ内' : 'グループ外'}）`);
  if (project.project_type) lines.push(`案件種別: ${project.project_type}`);
  if (project.event_start) lines.push(`実施日: ${project.event_start}${project.event_end && project.event_end !== project.event_start ? ` 〜 ${project.event_end}` : ''}`);
  if (project.expected_amount) lines.push(`想定金額 (税抜・参考): ${project.expected_amount}`);
  if (project.notes) lines.push(`案件のメモ:\n${String(project.notes).slice(0, 1500)}`);

  lines.push('', '# 料金表 (単価は税抜)');
  for (const p of pricing) {
    const price = project.customer_type === 'internal'
      ? (p.group_price ?? p.unit_price) : (p.unit_price ?? p.group_price);
    lines.push(`- [${p.category_name}] ${p.name}${p.sub_label ? `（${p.sub_label}）` : ''} … ${price ?? '（設定なし）'} / ${p.calc_type}`);
  }

  if (similar.length) {
    lines.push('', '# 似た案件 (確定した実績)');
    for (const s of similar) {
      const gp = Number(s.revenue_total) > 0
        ? Math.round(((Number(s.revenue_total) - Number(s.purchase_total)) / Number(s.revenue_total)) * 100)
        : null;
      lines.push(`- ${s.name}（${s.event_start ?? '実施日不明'}・${s.same_customer ? '同じお客様' : '別のお客様'}）売上 ${s.revenue_total}・粗利率 ${gp ?? '—'}%`);
    }
  }

  if (advice) {
    lines.push(
      '', '# 前回までの傾向 (人がどこを直したか)', advice, '',
      '**原文に書かれていないことを補ってはいけません。傾向は書き方の重み付けにだけ使ってください。**',
    );
  }
  return lines.join('\n');
}

async function callDraftAi(model: string, provider: 'openai' | 'anthropic', prompt: string) {
  if (provider === 'openai') {
    const client = new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 1 });
    const res = await client.responses.parse({
      model, instructions: SYSTEM_PROMPT, input: prompt,
      text: { format: zodTextFormat(DraftSchema, 'estimate_draft') },
    });
    if (res.status === 'incomplete') {
      throw new Error(`下書きが途中で終わりました: ${res.incomplete_details?.reason ?? '理由不明'}`);
    }
    const parsed = res.output_parsed;
    if (!parsed) throw new Error('下書きを読み取れませんでした');
    return parsed as z.infer<typeof DraftSchema>;
  }
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 });
  const res = await client.messages.parse({
    model, max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: zodOutputFormat(DraftSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') {
    throw new Error(`下書きが拒否されました: ${res.stop_details?.explanation ?? '理由不明'}`);
  }
  const parsed = res.parsed_output;
  if (!parsed) throw new Error('下書きを読み取れませんでした');
  return parsed as z.infer<typeof DraftSchema>;
}

/**
 * AI に明細を下書きさせて保存する (作り直しは差し替え)。
 *
 * **確定はしない**。想定金額にもステージにも触らない。人が画面で直して
 * 「この金額で確定する」を押すまで、この見積はどこにも出ない。
 */
export async function draftEstimateWithAi(projectId: string, actor: { userId: string }) {
  const project = await loadProject(projectId);

  const provider = resolveProvider();
  if (!provider) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'AI が使えない設定のため下書きを作れません。明細は「料金表から足す」「1行足す」で自分で組めます。',
    );
  }
  const model = intakeAiModel(provider);

  const pricing = (await queryAll(
    `SELECT pi.id, pi.name, pi.sub_label, pi.unit_price, pi.group_price, pi.calc_type,
            pc.name AS category_name
     FROM pricing_items pi
     JOIN pricing_categories pc ON pc.id = pi.category_id
     WHERE pi.deleted_at IS NULL AND pc.deleted_at IS NULL
     ORDER BY pc.sort_order, pi.sort_order`,
  )) as Array<Record<string, any>>;
  if (!pricing.length) {
    throw new AppError(400, 'VALIDATION_ERROR', '料金表が登録されていないため下書きを作れません（設定 ＞ 料金表）');
  }
  const similar = await findSimilarProjects(projectId);

  // ④次の生成に効かせる。取得に失敗しても下書きは止めない
  let advice: string | null = null;
  try {
    const digest = await getFeedbackDigest(KIND, 90);
    const raw = Array.isArray(digest.advice) ? digest.advice.join('\n') : digest.advice;
    advice = raw && String(raw).trim() ? String(raw) : null;
  } catch (e) {
    console.warn('[estimate] digest 取得に失敗 (下書きは続行):', (e as Error).message);
  }
  const promptVersion = advice ? `${PROMPT_VERSION_BASE}+fb` : PROMPT_VERSION_BASE;

  const draft = await callDraftAi(model, provider, buildDraftPrompt(project, pricing, similar, advice));

  // 料金表の品目名と一致する行には pricing_item_id を付ける (あとで単価を追える)
  const byName = new Map<string, string>();
  for (const p of pricing) byName.set(String(p.name).trim(), String(p.id));

  const items: EstimateItemInput[] = draft.items.map((d) => {
    const quantity = Number.isFinite(d.quantity) && d.quantity > 0 ? Math.round(d.quantity) : 1;
    const unitPrice = Math.max(0, Math.round(Number(d.unit_price) || 0));
    return {
      description: String(d.description).trim(),
      category: ESTIMATE_GROUPS.includes(d.group as EstimateGroup) ? d.group : '制作・その他',
      quantity,
      unit: String(d.unit || '式').trim(),
      unit_price: unitPrice,
      amount: quantity * unitPrice,
      cost_amount: Math.max(0, Math.round(Number(d.cost_amount) || 0)),
      item_notes: String(d.note || '').trim() || null,
      pricing_item_id: byName.get(String(d.description).trim()) ?? null,
      is_ai_suggested: !!d.inferred,
    };
  }).filter((it) => it.description);

  if (!items.length) throw new AppError(502, 'AI_EMPTY', 'AI が明細を出しませんでした。もう一度お試しください');

  const normalized = normalizeItems(items);
  const saved = await saveEstimate(
    projectId,
    { items: normalized, discount_amount: 0, tax_category: 'tax10' },
    actor,
  );

  // ①出力を記録 (切り詰めない)。突合の鍵は description なので、保存した形で残す
  const outputId = await recordAiOutput({
    kind: KIND,
    targetTable: 'revenues',
    targetId: saved.estimate!.id,
    payload: {
      items: normalized,
      bases: draft.bases,
      sources: {
        pricing_items: pricing.length,
        similar_projects: similar.map((s) => ({ id: s.id, name: s.name, revenue_total: Number(s.revenue_total) })),
      },
    },
    model, promptVersion, actorId: actor.userId,
  });

  return {
    ...(await getEstimate(projectId)),
    ai_draft: { output_id: outputId, bases: draft.bases, used_advice: !!advice, model },
  };
}

/**
 * 受注したときに、見積の「仕入(見込み)」列を見込み仕入の明細にする (二度打ちしない)。
 *
 * - `is_provisional = TRUE` で入れる。確定した支払いではないので、確定仕入と混ぜない
 * - **冪等**。notes のマーカーで既に作った行を見分け、ステージを往復しても増えない
 * - 仕入先が未定の行は「(仕入先未定)」に寄せる。ここで落とすと粗利の裏付けが消える
 * - 計上日は**その行の期間の開始日**。入っていなければ案件の実施日にする
 *   (前日設営・翌月の編集のように、案件の実施日と月が違う行があるため。
 *    ここで案件の実施日に丸めると月次の損益がずれる)
 */
export async function materializeEstimateCosts(
  projectId: string, userId: string,
): Promise<{ created: number; skipped: number }> {
  const row = await findEstimateRow(projectId);
  if (!row) return { created: 0, skipped: 0 };

  const items = (await queryAll(
    `SELECT id, description, amount, cost_amount, cost_vendor_id, period_start
     FROM revenue_items WHERE revenue_id = ? AND cost_amount > 0 ORDER BY sort_order`,
    [row.id],
  )) as Array<Record<string, any>>;
  if (!items.length) return { created: 0, skipped: 0 };

  const project = await loadProject(projectId);
  let created = 0, skipped = 0;
  let fallbackVendorId: string | null = null;

  for (const it of items) {
    const marker = `[from_estimate:${it.id}]`;
    const exists = await queryOne(
      `SELECT id FROM purchases WHERE project_id = ? AND notes LIKE ? AND deleted_at IS NULL LIMIT 1`,
      [projectId, `%${marker}%`],
    );
    if (exists) { skipped++; continue; }

    let vendorId = it.cost_vendor_id as string | null;
    if (!vendorId) {
      if (!fallbackVendorId) fallbackVendorId = await ensureFallbackVendor(userId);
      vendorId = fallbackVendorId;
    }
    await execute(
      `INSERT INTO purchases
         (id, project_id, vendor_id, assigned_to, tax_category, invoice_qualified, amount,
          description, recognition_date, is_provisional, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'tax10', 1, ?, ?, ?, TRUE, ?, ?, ?)`,
      [uuidv4(), projectId, vendorId, project.assigned_to ?? userId,
       Math.round(Number(it.cost_amount) || 0), it.description,
       it.period_start || project.event_start || null, `見積から自動作成 ${marker}`, userId, userId],
    );
    created++;
  }
  return { created, skipped };
}

/** 「(仕入先未定)」を1件だけ持つ (決算取込の「(顧客不明)」と同じ寄せ方) */
async function ensureFallbackVendor(userId: string): Promise<string> {
  const name = '(仕入先未定)';
  const found = await queryOne(
    `SELECT id FROM vendors WHERE name = ? AND deleted_at IS NULL LIMIT 1`, [name],
  ) as Record<string, any> | null;
  if (found) return String(found.id);
  const id = uuidv4();
  await execute(
    `INSERT INTO vendors (id, name, notes, created_by, updated_by)
     VALUES (?, ?, '見積の仕入列から作られた見込み仕入の受け皿。実際の仕入先が決まったら差し替えてください', ?, ?)`,
    [id, name, userId, userId],
  );
  return id;
}
