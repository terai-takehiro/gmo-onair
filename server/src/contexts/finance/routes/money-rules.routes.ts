/**
 * お金のルールの API — v4 設定 ⑤
 *
 * ── 期日の計算はサーバーだけが持つ ──────────────────────────
 *
 * この製品は **server が `shared/` を import しない構成**なので、画面側に
 * 同じ計算を書くと**写しが 2 つ**になります（締め日を過ぎた売上の扱いのような
 * 細かい所で必ず食い違います）。そこで**画面は計算せず、`preview` を訊きます**。
 * 設定を変えている最中でも、保存前の値を渡せば結果が返ります。
 *
 * 読むのは `budget` 権限があれば通します（見積・請求を作る人は税率と期日を
 * 知る必要がある）。直せるのは `budget` の manager だけ。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  getMoneyRules, saveMoneyRules, ruleForCustomer, computeDueDate, previewDueDate,
} from '../services/money-rules.service';
import { describeRule, type DueDateRule, type HolidayShift } from '../../../shared/services/dueDate';
// 2026年10月の事業再編（docs/reorg-2026-10-plan.md §4.5・§4.6・P2 Round 1）:
// お金のルールは会社（entity_code）ごとに1本になった（migration 286）
import { getLegalEntity, type LegalEntityCode } from '../../platform/services/legal-entity.service';
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';

/** 画面から来た寄せ方が読める値か（知らない値は保存済みの設定に落とす） */
const HOLIDAY_SHIFTS: readonly unknown[] = ['before', 'after', 'none'];

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

/**
 * クエリ・本文の `entity_code` を検査する（`renumber-preview` と同じ形・
 * `projects.routes.ts` 参照）。**省略時は今の会社（`CURRENT_ENTITY_CODE`）に落ちる**
 * ので、entity_code を送らない古い呼び出しも今までどおり動く。
 */
async function resolveEntityCode(raw: unknown): Promise<LegalEntityCode> {
  if (raw === undefined || raw === null || raw === '') return CURRENT_ENTITY_CODE;
  if (typeof raw !== 'string' || !(await getLegalEntity(raw))) {
    throw new AppError(400, 'VALIDATION_ERROR', '不正な計上会社です');
  }
  return raw as LegalEntityCode;
}

/** 値引きの上限（役割ごと）。役割の名前もいっしょに返す — 画面が引き直さずに済む */
async function discountLimits() {
  return queryAll(
    // **`role_id` は `r.id` から取る（`l.role_id` ではない）。** 上限を1件も決めていない
    // 役割は `role_discount_limits` に行が無く LEFT JOIN で `l.*` がまるごと NULL になる —
    // `l.role_id` のままだと画面の「決めていない役割」の行がすべて role_id=null で返り、
    // 編集フォームの開閉判定（`editing === l.role_id` が `null === null` で常に真になる）が
    // 壊れ、保存を押すと `/money-rules/limits/null` を叩いていた（実装で発見・修正）
    `SELECT r.id AS role_id, r.name AS role_name, l.max_rate, l.max_amount,
            l.approver_role_id, a.name AS approver_name, l.can_estimate
       FROM permission_roles r
       LEFT JOIN role_discount_limits l ON l.role_id = r.id
       LEFT JOIN permission_roles a ON a.id = l.approver_role_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.sort_order, r.name`,
  );
}

router.get('/', requirePermission('sales', 'reader'), wrap(async (req, res) => {
  const entityCode = await resolveEntityCode(req.query.entity_code);
  const rules = await getMoneyRules(entityCode);
  const company: DueDateRule = {
    closingDay: rules.closing_day, paymentMonths: rules.payment_months, paymentDay: rules.payment_day,
  };
  const purchase: DueDateRule = {
    closingDay: rules.closing_day,
    paymentMonths: rules.purchase_payment_months,
    paymentDay: rules.purchase_payment_day,
  };
  res.json({
    success: true,
    data: {
      entity_code: entityCode,
      rules,
      // 「末日締め ・ 翌月末日」のような読める文。画面で組み立てると言い回しがぶれる
      describe: { payment: describeRule(company), purchase: describeRule(purchase) },
      // 値引きの上限は役割ごとの全社共通ポリシー（会社では分けない）
      limits: await discountLimits(),
    },
  });
}));

router.put('/', requirePermission('sales', 'manager'), wrap(async (req, res) => {
  const patch = req.body ?? {};
  const entityCode = await resolveEntityCode(patch.entity_code);
  const saved = await saveMoneyRules(patch, req.user!.id, entityCode);
  res.json({ success: true, data: saved });
}));

/**
 * 保存前の値で期日を試す。**保存しない。**
 * `rule` を渡さなければ、いま保存されているルール（＋取引先の例外）で出す。
 */
router.post('/preview', requirePermission('sales', 'reader'), wrap(async (req, res) => {
  const { recognition_date, customer_id, rule, entity_code } = req.body ?? {};
  if (!recognition_date || typeof recognition_date !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', '計上日を入れてください');
  }
  const entityCode = await resolveEntityCode(entity_code);
  if (rule && typeof rule === 'object') {
    const r: DueDateRule = {
      closingDay: Number(rule.closingDay), paymentMonths: Number(rule.paymentMonths), paymentDay: Number(rule.paymentDay),
    };
    /*
     * ⚠️ **下見でも休業日の寄せを掛ける**（レビューでの指摘 #63）。
     * 掛けないと、設定の画面が出した日と実際に入る日が食い違います
     * （「8/31 になります」と見せて 8/29 が入る）。
     * 寄せ方は**画面が試している値**を優先し、無ければ保存済みの設定を使う。
     */
    const saved = await getMoneyRules(entityCode);
    const shift = HOLIDAY_SHIFTS.includes(rule.payment_holiday_shift)
      ? rule.payment_holiday_shift as HolidayShift
      : saved.payment_holiday_shift;
    res.json({
      success: true,
      data: {
        due_date: await previewDueDate(recognition_date, r, shift),
        describe: describeRule(r),
      },
    });
    return;
  }
  const used = await ruleForCustomer(customer_id ?? null, entityCode);
  res.json({
    success: true,
    data: {
      due_date: await computeDueDate(recognition_date, customer_id ?? null, entityCode),
      describe: describeRule(used),
    },
  });
}));

/**
 * 値引きの上限を保存する。
 *
 * **`max_rate` / `max_amount` の null は「上限なし」**で、0 とは別物。
 * 画面から空欄で送られたときに 0 として保存すると、**1 円も値引けなくなります**。
 */
router.put('/limits/:roleId', requirePermission('sales', 'manager'), wrap(async (req, res) => {
  const roleId = Array.isArray(req.params.roleId) ? req.params.roleId[0] : req.params.roleId;
  const { max_rate, max_amount, approver_role_id, can_estimate } = req.body ?? {};
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  await execute(
    `INSERT INTO role_discount_limits (role_id, max_rate, max_amount, approver_role_id, can_estimate)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (role_id) DO UPDATE SET
       max_rate = EXCLUDED.max_rate, max_amount = EXCLUDED.max_amount,
       approver_role_id = EXCLUDED.approver_role_id, can_estimate = EXCLUDED.can_estimate,
       updated_at = NOW()`,
    [roleId, num(max_rate), num(max_amount), approver_role_id || null, can_estimate !== false],
  );
  res.json({ success: true, data: await discountLimits() });
}));

export default router;
