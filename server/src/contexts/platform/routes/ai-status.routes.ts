/**
 * GET /ai/status — AI が使える状態かどうかを1か所で答える (v3.0.9)
 *
 * ── なぜ要るか ─────────────────────────────────────────────
 *
 * v3.0.8 の時点で、人が押すと LLM が呼ばれるボタンは **7 種 / 8 か所**あった:
 *
 *   1. 「今日」の投入欄 (AIに投げる)          — 押す前に未設定を判定していた ✅
 *   2. 「タスク > 自分」の同じ投入欄            — 同じ部品なので同上 ✅
 *   3. 見積の「下書きを作る / 作り直す」        — 押してから 503
 *   4. 問い合わせの返信「下書きを作る」        — 押してから 503
 *   5. 同じ画面の「作り直す」                  — 押してから 503
 *   6. 運営マニュアルの「AIに下書きさせる」    — 押してから 503
 *   7. リアルタイムCG 取り込みの「整えてもらう」— 押してから 503
 *
 * つまり **7 のうち 6 が「できるふり」**をしていた。AI のキーが無い環境
 * (検証環境や、キーが切れているとき) では押しても必ず失敗するのに、
 * ボタンは普通に押せる見た目で出ている。
 *
 * 未設定かどうかを知る手段は `/dailyops/ai/actions/catalog` にしか無く、
 * これは **dailyops 権限が要る**ので、見積 (sales) や CG (awards) の画面からは
 * 使えなかった。だから**認証だけで通る軽い口**を1つ置く。
 *
 * ここは「使えるか」だけを返す。**キーそのものやモデル名は返さない**
 * (どの鍵が入っているかは運用の情報で、画面に出す必要が無い)。
 */
import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { isIntakeAiConfigured } from '../../tasks/services/intake-ai.service';

const router = Router();

// 認証のみ。どのアプリの画面からでも押す前に判定できるようにする
router.use(requireAuth);

router.get('/status', (_req, res) => {
  res.json({
    success: true,
    data: {
      /** AI に頼める状態か。false のときは画面がボタンを出さない */
      available: isIntakeAiConfigured(),
    },
  });
});

export default router;
