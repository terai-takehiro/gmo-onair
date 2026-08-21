/**
 * 計測（サーバー側の視聴者取得）の開始・停止・状態・記録。
 * 実装設計 §4・§5・§7。
 */
import { Router } from 'express';
import { queryOne, queryAll } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { startMeasurement, stopMeasurement, defaultMeasureUntil, getTodayYoutubeUnits } from '../measure.service';

const router = Router();
const canRead = [requireAuth, requirePermission('liveops', 'reader')] as const;
// ⚠️ 開始・停止は manager だけ（reader にすると誰でも1日の割り当てを使い切れる）
const canWrite = [requireAuth, requirePermission('liveops', 'manager')] as const;

const YOUTUBE_DAILY_QUOTA = 10000;

router.get('/quota', ...canRead, async (_req, res) => {
  try {
    const used = await getTodayYoutubeUnits();
    res.json({
      success: true,
      data: { used, limit: YOUTUBE_DAILY_QUOTA, warn: used >= YOUTUBE_DAILY_QUOTA * 0.9 },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:programId', ...canRead, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT id, measuring, measure_started_at, measure_started_by, measure_until, measure_until_kind,
              measure_platforms, measure_last_ok_at, measure_fail_count
         FROM liveops_programs WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.programId],
    );
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:programId/log', ...canRead, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 300);
    const rows = await queryAll(
      `SELECT at, platform, level, count, units, message
         FROM liveops_poll_log WHERE program_id = $1
        ORDER BY at DESC LIMIT $2`,
      [req.params.programId, limit],
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/:programId/start', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user!.id;
    const { until, platforms } = req.body ?? {};
    const result = await startMeasurement({ programId: String(req.params.programId), userId, until, platforms });
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message, current: result.current });
    }
    res.status(201).json({ success: true, data: result.program });
  } catch (e) {
    console.warn('[liveops-measure] start failed:', (e as Error).message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/:programId/stop', ...canWrite, async (req, res) => {
  try {
    await stopMeasurement(String(req.params.programId), 'manual');
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 計測中に終了予定時刻を延ばす（画面の帯から）。24時間を超えてもよい。
router.patch('/:programId', ...canWrite, async (req, res) => {
  try {
    const { until } = req.body ?? {};
    if (!until) return res.status(400).json({ success: false, message: 'until required' });
    const untilDate = new Date(until);
    if (isNaN(untilDate.getTime())) return res.status(400).json({ success: false, message: '終了時刻の形式が不正です。' });
    if (untilDate.getTime() <= Date.now()) return res.status(400).json({ success: false, message: '終了時刻が過ぎています。' });

    const row = await queryOne(
      `UPDATE liveops_programs
          SET measure_until = $2, measure_until_kind = 'manual', updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL AND measuring = TRUE
      RETURNING id, measure_until, measure_until_kind`,
      [req.params.programId, untilDate],
    );
    if (!row) return res.status(404).json({ success: false, message: '計測中ではありません。' });
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 既定の終了時刻（開始日23:59 JST）を画面のプレビュー用に返す
router.get('/:programId/default-until', ...canRead, async (_req, res) => {
  res.json({ success: true, data: { until: defaultMeasureUntil().toISOString() } });
});

export default router;
