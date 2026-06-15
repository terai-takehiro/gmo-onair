/**
 * kessan.routes.ts — 決算データ取込 (検証DB専用・管理者限定)
 *
 * POST /admin/kessan/run  — 総勘定元帳(Box)を予算管理/案件管理へ取込む
 *   body: { scope, commit, createMasters, excludeFixed, glFileId?, period? }
 *
 * ガード:
 *   - requireAuth + system_admin ロール限定
 *   - DB 名が prod っぽい場合は 403 (本番では実行不可)
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { runKessanImport, type KessanOptions } from '../services/kessan-import.service';

const router = Router();
router.use(requireAuth, requireRole('system_admin'));

function isProdDb(): boolean {
  const s = String(process.env.DB_NAME || process.env.DATABASE_URL || '').toLowerCase();
  return s.includes('prod') || s.includes('production');
}

router.post('/run', async (req, res, next) => {
  try {
    if (isProdDb()) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '本番DBでは実行できません (検証DB専用)' } });
      return;
    }
    const b = req.body || {};
    const scope = ['sga', 'revenues', 'purchases', 'all'].includes(b.scope) ? b.scope : 'sga';
    const opts: KessanOptions = {
      scope,
      commit: b.commit === true,
      createMasters: b.createMasters === true,
      excludeFixed: b.excludeFixed === true,
      glFileId: typeof b.glFileId === 'string' && b.glFileId ? b.glFileId : undefined,
      period: typeof b.period === 'string' && /^\d{4}-\d{2}$/.test(b.period) ? b.period : undefined,
    };
    const report = await runKessanImport(opts, req.user!.id);
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

export default router;
