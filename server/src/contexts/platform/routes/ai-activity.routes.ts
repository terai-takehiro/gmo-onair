/**
 * AI活動 API（`/ai-activity/*`）— docs/core-redesign-plan.md Phase 2 ②。
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * digest（AI の直され方の集計）はこれまで **MCP 経由でしか読めず**、
 * 「AIが今日何をしたか」を人が見る場所が無かった（report-ai-map §5.2 / §10）。
 * ここは AI活動ページ（`/settings/ai-activity`・クライアント側の担当が作る）の
 * 読み口＋月次レビューの「確認した」を打刻する口。
 *
 * ── 営業系 kind に絞る（秘匿ルール）─────────────────────────
 *
 * qsheet 系 kind の `recent_examples` には台本の断片が入りうるため、MCP 側は
 * 「qsheet の manager 以上だけ」に degrade している（`aifeedback.tools.ts`）。
 * この HTTP の口では**そもそも営業系 kind しか受けない**のが簡単で安全 —
 * 制作側の数字は制作の月次レビュー（ops_reports.kind=ai_review_production）で見る。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { getFeedbackDigest, OPS_NEWS_ITEM_KIND } from '../../../shared/services/ai-feedback.service';
import { SALES_REVIEW_KINDS } from '../../sales/services/sales-ai-review.service';

const router = Router();
router.use(requireAuth, requirePermission('sales'));

/** この口で読める kind（営業系9種 + デイリーニュース）。qsheet 系は受けない（上の理由） */
const ALLOWED_KINDS: readonly string[] = [...SALES_REVIEW_KINDS, OPS_NEWS_ITEM_KIND];

const clampDays = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 1), 365) : fallback;
};

/**
 * digest。`kind` を渡せば1種、省略時は全種（一覧画面の初期表示用）。
 * qsheet 系 kind は 400 で断る — 黙って空を返すと「データが無い」と誤読される。
 */
router.get('/digest', async (req, res, next) => {
  try {
    const days = clampDays(req.query.days, 30);
    const kind = req.query.kind ? String(req.query.kind) : null;
    if (kind) {
      if (!ALLOWED_KINDS.includes(kind)) {
        throw new AppError(400, 'VALIDATION_ERROR', `この API で読めるのは営業系の kind だけです: ${ALLOWED_KINDS.join(', ')}`);
      }
      res.json({ success: true, data: { window_days: days, digests: [await getFeedbackDigest(kind, days)] } });
      return;
    }
    const digests = [];
    for (const k of ALLOWED_KINDS) digests.push(await getFeedbackDigest(k, days));
    res.json({ success: true, data: { window_days: days, digests } });
  } catch (e) {
    next(e);
  }
});

/**
 * 直近の AI 出力（一覧用の要約）。**payload 全文は返さない** — 一覧に全文は要らず、
 * 取込メールの本文などを一覧 API に載せない（読みたければ対象レコード側の画面で見る）。
 * 修正状況は ai_corrections の有無と type の集約で返す。
 */
router.get('/recent', async (req, res, next) => {
  try {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 1), 200) : 50;
    const rows = await queryAll(
      `SELECT o.id, o.kind, o.created_at, o.tool_name, o.target_table, o.target_id,
              o.model, o.prompt_version,
              COALESCE(c.types, ARRAY[]::text[]) AS correction_types
         FROM ai_outputs o
         LEFT JOIN LATERAL (
           SELECT array_agg(DISTINCT cc.correction_type) AS types
             FROM ai_corrections cc WHERE cc.output_id = o.id
         ) c ON TRUE
        WHERE o.kind = ANY(?::text[])
        ORDER BY o.created_at DESC
        LIMIT ?`,
      [[...ALLOWED_KINDS], limit],
    ) as Array<Record<string, unknown>>;
    const outputs = rows.map((r) => {
      const types = Array.isArray(r.correction_types) ? (r.correction_types as string[]) : [];
      return {
        id: r.id, kind: r.kind, created_at: r.created_at, tool_name: r.tool_name,
        target_table: r.target_table, target_id: r.target_id,
        model: r.model, prompt_version: r.prompt_version,
        // reviewed = 何かしらの記録がある（'none' も「無修正で採用」という人の裁き）
        reviewed: types.length > 0,
        correction_types: types,
      };
    });
    res.json({ success: true, data: { total: outputs.length, outputs } });
  } catch (e) {
    next(e);
  }
});

/** 月次 AI レビューの一覧（営業 ai_review_sales と制作 ai_review_production の両方。メタのみ） */
router.get('/reviews', async (_req, res, next) => {
  try {
    const rows = await queryAll(
      `SELECT id, kind, period_key, created_at, reviewed_at, reviewed_by
         FROM ops_reports
        WHERE kind LIKE 'ai_review_%' AND deleted_at IS NULL
        ORDER BY period_key DESC, kind ASC
        LIMIT 60`,
    );
    res.json({ success: true, data: { reviews: rows } });
  } catch (e) {
    next(e);
  }
});

/**
 * 月次レビューを「確認した」。制作側の実施率（`reviewCompletionRate`）が読むのと
 * 同じ列（`reviewed_at` / `reviewed_by`・migration 118）に打刻する。
 * **最初の確認を上書きしない**（COALESCE — 「渡さなければ今の値を保つ」の作法。
 * 2人目が押しても、いつ・誰が最初に確認したかの記録は残る）。
 */
router.post('/reviews/:id/reviewed', requirePermission('sales', 'manager'), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const row = await queryOne(
      `UPDATE ops_reports
          SET reviewed_at = COALESCE(reviewed_at, NOW()),
              reviewed_by = COALESCE(reviewed_by, ?),
              updated_at = NOW()
        WHERE id = ? AND kind LIKE 'ai_review_%' AND deleted_at IS NULL
        RETURNING id, kind, period_key, reviewed_at, reviewed_by`,
      [req.user!.id, id],
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'AI レビューが見つかりません');
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

export default router;
