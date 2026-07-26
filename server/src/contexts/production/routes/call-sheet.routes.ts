/**
 * 香盤表 (デザイン 21章 28a) の HTTP 口
 *
 * 案件から開くので `sales` 権限。読みは reader、直すのは editor。
 * (予約や機材は `studio` / `equipment` 権限だが、香盤表そのものは案件の書類なので
 *  営業も現場も同じ口から見る。元データは service 側で読む。)
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import {
  ensureCallSheet, listCallSheets, getCallSheet, rebuildFromSources,
  upsertBlock, deleteBlock, setLaneVisible, updateSheet, sendBlocksToTimer,
  CATEGORIES, SOURCES, HOUR_PX,
} from '../services/call-sheet.service';

const router = Router();
router.use(requireAuth, requirePermission('sales'));

const uid = (req: any) => String(req.user?.id ?? '');

// 目盛りと色分けの決まり (案件に依らない)。画面が同じ寸法で描くために返す
router.get('/format', async (_req, res) => {
  res.json({ success: true, data: { hour_px: HOUR_PX, categories: CATEGORIES, sources: SOURCES } });
});

// 案件の香盤表の一覧 (前日・当日・撤収で1日1枚)
router.get('/projects/:projectId', async (req, res) => {
  res.json({ success: true, data: await listCallSheets(String(req.params.projectId)) });
});

// その日の1枚を開く。無ければ作って**自動で組む** (白紙を見せない)
router.post('/projects/:projectId', requirePermission('sales', 'editor'), async (req, res) => {
  const date = String(req.body?.sheet_date ?? '');
  const sheet = await ensureCallSheet(String(req.params.projectId), date, uid(req));
  res.status(201).json({ success: true, data: await getCallSheet(String(sheet.id)) });
});

router.get('/:id', async (req, res) => {
  res.json({ success: true, data: await getCallSheet(String(req.params.id)) });
});

// 元データから組み直す。人が置いた枠には触らない
router.post('/:id/rebuild', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await rebuildFromSources(String(req.params.id), uid(req)) });
});

router.put('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await updateSheet(String(req.params.id), req.body ?? {}, uid(req)) });
});

// 枠を置く / 直す
router.put('/:id/blocks', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await upsertBlock(String(req.params.id), req.body ?? {}) });
});

router.delete('/:id/blocks/:blockId', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({ success: true, data: await deleteBlock(String(req.params.id), String(req.params.blockId)) });
});

// レーンの出し入れ (消さずに隠す)
router.put('/:id/lanes/:laneId/visible', requirePermission('sales', 'editor'), async (req, res) => {
  res.json({
    success: true,
    data: await setLaneVisible(String(req.params.id), String(req.params.laneId), req.body?.visible !== false),
  });
});

// 選んだ枠を計時LIVEのタイマーにする (枠の長さがそのまま尺)
router.post('/:id/to-timer', requirePermission('sales', 'editor'), async (req, res) => {
  const ids = Array.isArray(req.body?.block_ids) ? req.body.block_ids.map(String) : [];
  res.json({ success: true, data: await sendBlocksToTimer(String(req.params.id), ids, uid(req)) });
});

export default router;
