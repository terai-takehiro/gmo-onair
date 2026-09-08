/**
 * kessan.routes.ts — 決算データ取込 (管理者限定)
 *
 * POST /admin/kessan/run  — 総勘定元帳(PCアップロード)を予算管理/案件管理へ取込む
 *   multipart/form-data: file (CSV/xlsx 本体) + scope, commit, createMasters, excludeFixed,
 *   skipDuplicates, period? (いずれも文字列で届く)
 *
 * ガード:
 *   - requireAuth + system_admin ロール限定
 *   - 本番DB/検証DB の両方で実行可 (レポートに targetDb/isProd を含め画面で明示)
 */
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { runKessanImport, screenKessanDuplicates, type KessanOptions, type DedupScreenOptions } from '../services/kessan-import.service';

const router = Router();
router.use(requireAuth, requireRole('system_admin'));

// 総勘定元帳CSV/xlsxは半期〜年間分になり得るため xpoint (PDF・20MB) より緩めの 50MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/run', upload.single('file'), async (req, res) => {
  try {
    const f = req.file;
    if (!f || !f.buffer || !f.buffer.length) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: '総勘定元帳ファイル（CSVまたはxlsx）を指定してください' } });
      return;
    }
    // multipart のファイル名は latin1 で届くことがあるため UTF-8 に復元 (xpoint.routes.ts と同じ処理)
    let originalName = f.originalname || 'gl.csv';
    try {
      const decoded = Buffer.from(originalName, 'latin1').toString('utf8');
      if (!decoded.includes('�')) originalName = decoded;
    } catch { /* 変換失敗時はそのまま */ }
    if (!/\.(csv|xlsx)$/i.test(originalName)) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'CSV または xlsx ファイルのみアップロードできます' } });
      return;
    }

    const b = req.body || {};
    const scope = ['sga', 'revenues', 'purchases', 'all'].includes(b.scope) ? b.scope : 'sga';
    const opts: KessanOptions = {
      scope,
      commit: b.commit === 'true',
      createMasters: b.createMasters === 'true',
      excludeFixed: b.excludeFixed === 'true',
      skipDuplicates: b.skipDuplicates === 'true',
      period: typeof b.period === 'string' && /^\d{4}-\d{2}$/.test(b.period) ? b.period : undefined,
      file: { buffer: f.buffer, name: originalName },
    };
    const report = await runKessanImport(opts, req.user!.id);
    res.json({ success: true, data: report });
  } catch (err) {
    // dev 専用の管理者ツールなので、原因切り分けのため実エラーを system_admin に返す
    const e = err as { message?: string };
    console.error('[kessan] run error:', e?.message);
    res.status(500).json({ success: false, error: { code: 'KESSAN_IMPORT_ERROR', message: e?.message || '不明なエラー' } });
  }
});

/**
 * POST /admin/kessan/screen-duplicates — 二重計上スクリーニング
 *   決算インポート行 (notes が [kessan:...]) のうち、手入力行と同一
 *   (金額+GLS/取引先+計上年月) のものを検出し、決算側だけを削除候補にする。
 *   body: { scope?, commit?, monthFrom?, monthTo? }
 */
router.post('/screen-duplicates', async (req, res) => {
  try {
    const b = req.body || {};
    const scope = ['sga', 'revenues', 'purchases', 'all'].includes(b.scope) ? b.scope : 'all';
    const opts: DedupScreenOptions = {
      scope,
      commit: b.commit === true,
      monthFrom: typeof b.monthFrom === 'string' && /^\d{4}-\d{2}$/.test(b.monthFrom) ? b.monthFrom : undefined,
      monthTo: typeof b.monthTo === 'string' && /^\d{4}-\d{2}$/.test(b.monthTo) ? b.monthTo : undefined,
    };
    const report = await screenKessanDuplicates(opts, req.user!.id);
    res.json({ success: true, data: report });
  } catch (err) {
    const e = err as { message?: string };
    console.error('[kessan] screen-duplicates error:', e?.message);
    res.status(500).json({ success: false, error: { code: 'KESSAN_DEDUP_ERROR', message: e?.message || '不明なエラー' } });
  }
});

export default router;
