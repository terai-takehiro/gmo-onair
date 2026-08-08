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
import { getMoneyRules, saveMoneyRules, ruleForCustomer, computeDueDate } from '../services/money-rules.service';
import { dueDateOf, describeRule, type DueDateRule } from '../../../shared/services/dueDate';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

/** 値引きの上限（役割ごと）。役割の名前もいっしょに返す — 画面が引き直さずに済む */
async function discountLimits() {
  return queryAll(
    `SELECT l.role_id, r.name AS role_name, l.max_rate, l.max_amount,
            l.approver_role_id, a.name AS approver_name, l.can_estimate
       FROM permission_roles r
       LEFT JOIN role_discount_limits l ON l.role_id = r.id
       LEFT JOIN permission_roles a ON a.id = l.approver_role_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.sort_order, r.name`,
  );
}

router.get('/', requirePermission('budget', 'reader'), wrap(async (_req, res) => {
  const rules = await getMoneyRules();
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
      rules,
      // 「末日締め ・ 翌月末日」のような読める文。画面で組み立てると言い回しがぶれる
      describe: { payment: describeRule(company), purchase: describeRule(purchase) },
      limits: await discountLimits(),
    },
  });
}));

router.put('/', requirePermission('budget', 'manager'), wrap(async (req, res) => {
  const saved = await saveMoneyRules(req.body ?? {}, req.user!.id);
  res.json({ success: true, data: saved });
}));

/**
 * 保存前の値で期日を試す。**保存しない。**
 * `rule` を渡さなければ、いま保存されているルール（＋取引先の例外）で出す。
 */
router.post('/preview', requirePermission('budget', 'reader'), wrap(async (req, res) => {
  const { recognition_date, customer_id, rule } = req.body ?? {};
  if (!recognition_date || typeof recognition_date !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', '計上日を入れてください');
  }
  if (rule && typeof rule === 'object') {
    const r: DueDateRule = {
      closingDay: Number(rule.closingDay), paymentMonths: Number(rule.paymentMonths), paymentDay: Number(rule.paymentDay),
    };
    res.json({ success: true, data: { due_date: dueDateOf(recognition_date, r), describe: describeRule(r) } });
    return;
  }
  const used = await ruleForCustomer(customer_id ?? null);
  res.json({
    success: true,
    data: { due_date: await computeDueDate(recognition_date, customer_id ?? null), describe: describeRule(used) },
  });
}));

/**
 * 値引きの上限を保存する。
 *
 * **`max_rate` / `max_amount` の null は「上限なし」**で、0 とは別物。
 * 画面から空欄で送られたときに 0 として保存すると、**1 円も値引けなくなります**。
 */
router.put('/limits/:roleId', requirePermission('budget', 'manager'), wrap(async (req, res) => {
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
