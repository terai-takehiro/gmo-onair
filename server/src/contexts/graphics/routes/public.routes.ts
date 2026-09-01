import { Router, Request, Response, NextFunction } from 'express';
import { fetchBundle } from '../store';

// 認証不要の公開エンドポイント（OBS・スイッチャーのブラウザソース用。
// graphics.md §7「公開URL・認証なし」の契約）。
// awards の public.routes.ts と同じ理由で、auth 付き router より**先に**マウントする
// （後続 router の `router.use(requireAuth, ...)` が全パスで発火するため）。

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

// ── 出力（PGM/PVW・OBS ブラウザソース）が読む一式 ─────────────────
// serverNow: 時計・カウントダウンをサーバー時刻基準に補正するための基準時刻（§7）
router.get('/projects/:id/output', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (!id || isNaN(id)) {
    res.status(404).json({ success: false });
    return;
  }
  const bundle = await fetchBundle(id);
  if (!bundle) {
    res.status(404).json({ success: false });
    return;
  }
  res.json({ success: true, data: { ...bundle, serverNow: Date.now() } });
}));

export default router;
