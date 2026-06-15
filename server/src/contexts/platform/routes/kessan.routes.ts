/**
 * kessan.routes.ts — 決算データ取込 (管理者限定)
 *
 * POST /admin/kessan/run  — 総勘定元帳(Box)を予算管理/案件管理へ取込む
 *   body: { scope, commit, createMasters, excludeFixed, glFileId?, boxFolderId?, period? }
 *
 * ガード:
 *   - requireAuth + system_admin ロール限定
 *   - 本番DB/検証DB の両方で実行可 (レポートに targetDb/isProd を含め画面で明示)
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { runKessanImport, type KessanOptions } from '../services/kessan-import.service';
import { isBoxConfigured } from '../../../shared/services/box';

const router = Router();
router.use(requireAuth, requireRole('system_admin'));

/** Box フォルダ ID または共有URL (https://.../folder/123456) から数値 ID を取り出す */
function extractFolderId(input: string): string | undefined {
  const s = String(input || '').trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/folder\/(\d+)/);
  return m ? m[1] : undefined;
}

router.post('/run', async (req, res) => {
  try {
    if (!isBoxConfigured()) {
      res.status(400).json({ success: false, error: { code: 'BOX_NOT_CONFIGURED', message: 'Box が未設定です (BOX_CONFIG_JSON が必要)。Box連携が無効のため決算CSVを取得できません。' } });
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
      boxFolderId: typeof b.boxFolderId === 'string' && b.boxFolderId ? extractFolderId(b.boxFolderId) : undefined,
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
