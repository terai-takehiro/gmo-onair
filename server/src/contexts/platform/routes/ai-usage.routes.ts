/**
 * AI の使用量（`GET /admin/ai-usage`）
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * 「AI の費用を抑えたい」に answer するには、**どこにいくら掛かっているか**が
 * 先に見えていないといけません。見えていないと、削っても効いたのか分からず、
 * **効かない我慢だけが残ります**（下読みを止めたのに、実は写真の解析が主因だった、など）。
 *
 * 種類（投入口 / 議事録 / 文字起こし / 下読み）× モデルで足して返します。
 *
 * ── 金額は「単価が入っているときだけ」出す ──────────────────
 *
 * 公開価格をコードに焼き込みません（`ai-usage.service.ts` に理由）。
 * `AI_PRICING_JSON` が入っていない環境では**トークン数と時間だけ**を返します。
 *
 * ── 権限を掛けていない理由 ──────────────────────────────────
 *
 * 置き場所の「システムの情報」は**権限を掛けていない画面**です
 * （`client/CLAUDE.md`「設定トップとシステムの情報には権限を掛けていない」）。
 * ここだけ `admin` を要求すると、**使っている本人が自分の使い方の重さを見られません**。
 * 返すのは件数と合計だけで、**投入した文も出力も含みません**（ログインは要ります）。
 */
import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { usageSummary } from '../../../shared/services/ai-usage.service';

const router = Router();

router.get('/ai-usage', requireAuth, async (req, res, next) => {
  try {
    const raw = Number(req.query.days);
    // 既定は 30 日。**先月と比べたい**ときのために 90 まで受ける
    const days = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 1), 365) : 30;
    res.json({ success: true, data: await usageSummary(days) });
  } catch (e) {
    next(e);
  }
});

export default router;
