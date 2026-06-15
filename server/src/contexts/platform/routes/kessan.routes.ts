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
import { isBoxConfigured } from '../../../shared/services/box';

const router = Router();
router.use(requireAuth, requireRole('system_admin'));

function isProdDb(): boolean {
  const s = String(process.env.DB_NAME || process.env.DATABASE_URL || '').toLowerCase();
  return s.includes('prod') || s.includes('production');
}

router.post('/run', async (req, res) => {
  try {
    if (isProdDb()) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '本番DBでは実行できません (検証DB専用)' } });
      return;
    }
    if (!isBoxConfigured()) {
      res.status(400).json({ success: false, error: { code: 'BOX_NOT_CONFIGURED', message: 'Box が未設定です (app_dev に BOX_CONFIG_JSON が必要)。Box連携が無効のため決算CSVを取得できません。' } });
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
      boxFolderId: typeof b.boxFolderId === 'string' && b.boxFolderId ? b.boxFolderId : undefined,
      period: typeof b.period === 'string' && /^\d{4}-\d{2}$/.test(b.period) ? b.period : undefined,
    };
    const report = await runKessanImport(opts, req.user!.id);
    res.json({ success: true, data: report });
  } catch (err) {
    // dev 専用の管理者ツールなので、原因切り分けのため実エラーを system_admin に返す
    const e = err as { message?: string; statusCode?: number; response?: { statusCode?: number; body?: unknown } };
    const boxStatus = e?.response?.statusCode;
    const msg = `${e?.message || '不明なエラー'}${boxStatus ? ` (Box応答: ${boxStatus})` : ''}`;
    console.error('[kessan] run error:', e?.message, boxStatus ?? '', JSON.stringify(e?.response?.body ?? '').slice(0, 300));
    res.status(500).json({ success: false, error: { code: 'KESSAN_IMPORT_ERROR', message: msg } });
  }
});

export default router;
