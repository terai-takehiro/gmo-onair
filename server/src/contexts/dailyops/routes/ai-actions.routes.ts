/**
 * AI 行動提案の API — 投入欄「AIに投げる」の受け口。
 *
 * 従来の `/dailyops/tasks/intake` は**タスクしか作れなかった**ので、
 * 案件・見積・お客様・予約・活動記録・議事録まで含めて提案する経路をここに置く。
 * 旧 intake も残してある (投入ログと ai-feedback の intake 指標が繋がっているため)。
 *
 * 権限:
 *   投入 (提案を作る) は dailyops/editor。**提案を作るだけでは何も書き込まれない**ので
 *   ここは緩くてよい。実行は 1 件ずつ、その操作に要るモジュール権限を
 *   action-executor が押した人の権限で確かめる (AI を通しても権限は増えない)。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll } from '../../../shared/db/connection';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { ACTION_CATALOG, ACTION_KINDS } from '../../tasks/services/action-catalog';
import {
  actionPlanService, ACTION_PLAN_AI_KIND,
} from '../../tasks/services/action-plan.service';
import {
  planActionsWithAi, actionAiModel, type ActionDraft, type PlanContext,
} from '../../tasks/services/action-ai.service';
import { isIntakeAiConfigured, resolveProvider } from '../../tasks/services/intake-ai.service';

const router = Router();
const canRead = [requireAuth, requirePermission('dailyops', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('dailyops', 'editor')] as const;

function me(req: { user?: { id: string } }): string {
  const id = req.user?.id;
  if (!id) throw new AppError(401, 'UNAUTHORIZED', 'ログインが必要です');
  return id;
}

// ── 過去の修正傾向 (ループを閉じる部分) ──────────────────
//
// 解析の前に「人が今までどう直したか」を読んでプロンプトに載せる。
// これが無いと記録しているだけで賢くならない (開発の絶対原則の条件4)。
// **取得に失敗しても投入は止めない** (傾向は無くても解析はできる)。
const ADVICE_TTL_MS = 5 * 60_000;
const ADVICE_WINDOW_DAYS = 60;
let adviceCache: { at: number; advice: string[] } | null = null;

async function getActionAdvice(): Promise<string[]> {
  if (adviceCache && Date.now() - adviceCache.at < ADVICE_TTL_MS) return adviceCache.advice;
  try {
    const digest = await getFeedbackDigest(ACTION_PLAN_AI_KIND, ADVICE_WINDOW_DAYS);
    const advice = digest.reviewed_outputs > 0 ? digest.advice : [];
    adviceCache = { at: Date.now(), advice };
    return advice;
  } catch (e) {
    console.warn('[ai-actions] 修正傾向の取得に失敗 (解析は続行):', (e as Error).message);
    return [];
  }
}

/** 実行・破棄で傾向が変わるのでキャッシュを捨てる */
function invalidateAdviceCache(): void {
  adviceCache = null;
}

/**
 * AI に渡す文脈 (お客様・案件・担当者・部屋)。
 *
 * **全件は渡さない。** 案件は数千件になり得るので、AI が実際に指す可能性のある
 * 範囲 (進行中 + 直近に触ったもの) に絞る。ここを広げると入力が膨らむだけで
 * 精度は上がらず、逆に似た名前の案件を取り違えやすくなる。
 */
const CTX_LIMIT_PROJECTS = 120;
const CTX_LIMIT_CUSTOMERS = 200;

async function loadPlanContext(): Promise<PlanContext> {
  const [users, customers, projects, rooms] = await Promise.all([
    queryAll(`SELECT id, name FROM users WHERE deleted_at IS NULL ORDER BY name`),
    queryAll(
      `SELECT id, name FROM customers WHERE deleted_at IS NULL
        ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT ?`,
      [CTX_LIMIT_CUSTOMERS],
    ),
    queryAll(
      // 終わった案件 (完了・失注) とお試し (練習) は指す対象にしない。
      // お試しを混ぜると練習用の案件に本物の見積が付く事故が起きる
      `SELECT p.id, p.name, p.gls_number, p.stage, c.name AS customer_name
         FROM projects p
         LEFT JOIN customers c ON c.id = p.customer_id
        WHERE p.deleted_at IS NULL AND p.is_sandbox = FALSE
          AND p.stage NOT IN ('s_completed', 'e_lost')
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC LIMIT ?`,
      [CTX_LIMIT_PROJECTS],
    ),
    queryAll(`SELECT id, name FROM studio_rooms WHERE deleted_at IS NULL ORDER BY sort_order, name`),
  ]);
  return {
    users: users as PlanContext['users'],
    customers: customers as PlanContext['customers'],
    projects: projects as PlanContext['projects'],
    rooms: rooms as PlanContext['rooms'],
  };
}

// ══════════════════════════════════════════════
// カタログ (画面が名札と「何が起きるか」を出すのに使う)
// ══════════════════════════════════════════════

router.get('/ai/actions/catalog', ...canRead, async (_req, res) => {
  res.json({
    success: true,
    data: {
      kinds: ACTION_KINDS.map((k) => {
        const s = ACTION_CATALOG[k];
        return {
          kind: s.kind, label: s.label, module: s.module, level: s.level,
          effects: s.effects, requires: s.requires, opt_out: !!s.optOut,
        };
      }),
      ai_configured: isIntakeAiConfigured(),
    },
  });
});

// ══════════════════════════════════════════════
// 投入 → 行動提案
// ══════════════════════════════════════════════

/**
 * 投げる。**何も実行しない**。
 * 投げたテキストを一次資料として保存し、行動案を返す。
 * クライアントはこの案を確認画面に出し、人が確認してから /execute を呼ぶ。
 */
router.post('/ai/actions/plan', ...canEdit, async (req, res) => {
  const userId = me(req);
  const rawText = String(req.body?.raw_text ?? '').trim();
  if (!rawText) throw new AppError(400, 'VALIDATION_ERROR', '投げるテキストを入力してください');

  const kind = ['freeform', 'minutes', 'mail', 'chat', 'other'].includes(String(req.body?.kind))
    ? String(req.body.kind) as 'freeform' | 'minutes' | 'mail' | 'chat' | 'other'
    : 'freeform';

  // AI が無い環境では**この機能は動かない**。
  // タスクだけの投入 (`/tasks/intake`) は規則ベースに縮退できるが、
  // 「どの操作にするか」は規則では決められないので、縮退させるふりをせず
  // 「タスクの投入なら使える」と案内する (できないことをできるように見せない)。
  if (!isIntakeAiConfigured()) {
    throw new AppError(
      503, 'AI_NOT_CONFIGURED',
      'AI の接続が設定されていないため、行動提案は使えません。' +
      'タスク・依頼の登録は「AIに投げる」の下の投入欄からできます (管理者に OPENAI_API_KEY の設定を依頼してください)',
    );
  }

  const ctx = await loadPlanContext();
  const advice = await getActionAdvice();

  const plan = await planActionsWithAi(rawText, ctx, {
    now: new Date(), submitterId: userId, advice,
  });

  const saved = await actionPlanService.createPlan({
    raw_text: rawText,
    kind,
    summary: plan.summary,
    actions: plan.actions,
    skipped: plan.skipped,
    model: plan.model,
    prompt_version: plan.promptVersion,
    tool_name: 'ui:ai-actions',
  }, userId);

  res.status(201).json({
    success: true,
    data: {
      ...saved,
      skipped: plan.skipped,
      // 画面が選び直せるように文脈も返す (お客様・案件・担当者のプルダウン)
      context: ctx,
      model: plan.model,
      provider: plan.provider,
    },
  });
});

/** 確認済みの行動案を実行する */
router.post('/ai/actions/plans/:id/execute', ...canEdit, async (req, res) => {
  const userId = me(req);
  const actions = req.body?.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '実行するものを選んでください');
  }
  const result = await actionPlanService.executePlan(
    String(req.params.id), actions as ActionDraft[], userId,
  );
  invalidateAdviceCache();
  res.json({ success: true, data: result });
});

/** 下書きを破棄する (原文は残す) */
router.post('/ai/actions/plans/:id/discard', ...canEdit, async (req, res) => {
  const userId = me(req);
  const plan = await actionPlanService.discardPlan(
    String(req.params.id), userId, req.body?.note ? String(req.body.note) : null,
  );
  invalidateAdviceCache();
  res.json({ success: true, data: plan });
});

/** 提案ログ。既定は本人の分だけ */
router.get('/ai/actions/plans', ...canRead, async (req, res) => {
  const userId = me(req);
  const all = req.query.all === '1' || req.query.all === 'true';
  const rows = await actionPlanService.list({
    userId: all ? undefined : userId,
    status: req.query.status ? String(req.query.status) as never : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({
    success: true,
    data: rows,
    meta: { pending: await actionPlanService.pendingCount(userId), model: actionAiModel(resolveProvider()) },
  });
});

router.get('/ai/actions/plans/:id', ...canRead, async (req, res) => {
  res.json({ success: true, data: await actionPlanService.get(String(req.params.id)) });
});

export default router;
