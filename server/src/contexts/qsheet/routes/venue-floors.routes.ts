/**
 * 会場図面 — 会場・階・エリア・備品カタログ（読み取り専用）。
 * 設計: docs/design/v4/venue-layout.md §5-4（API）。
 * 段F（④会場と階・⑤備品カタログの編集画面・書き込み API）は今回のスコープ外。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { wrap } from './wrap';
import { listVenueFloors, listVenueCatalog } from '../services/venue-floor.service';

const router = Router();
router.use(requireAuth, requirePermission('qsheet'));

/** 階＋エリア＋固定物＋下敷き（§5-4） */
router.get('/venue-floors', wrap(async (_req, res) => {
  const rows = await listVenueFloors();
  res.json({ success: true, data: rows });
}));

/** 備品カタログ（§5-4・§11。36件） */
router.get('/venue-catalog', wrap(async (_req, res) => {
  const rows = await listVenueCatalog();
  res.json({ success: true, data: rows });
}));

export default router;
