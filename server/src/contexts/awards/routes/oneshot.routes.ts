import { Router, Request, Response, NextFunction } from 'express';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const DEFAULT_CUE = {
  entry_id: null,
  module_key: 'title',
  ticker_on: false,
  ticker_cat_idx: 0,
  transparent: false,
  lang: 'ja',
  is_live: false,
};

// ── 公開: 1S CG 出力用 (認証不要・ブラウザソース用) ─────────
// イベント詳細 + categories + entries(oneshot_data含む) + 現在の oneshot cue state
router.get('/events/:id/oneshot/output', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const event = await queryOne(
    `SELECT id, name, subtitle FROM awards_events WHERE id = ?`,
    [id]
  );
  if (!event) {
    res.status(404).json({ success: false });
    return;
  }

  const categories = await queryAll(
    `SELECT * FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`,
    [id]
  );
  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE event_id = ? ORDER BY category_id, rank NULLS LAST, id`,
    [id]
  );
  const cue = await queryOne(
    `SELECT entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live
     FROM awards_oneshot_cue_state WHERE event_id = ?`,
    [id]
  );

  const catMap = new Map<number, Record<string, unknown> & { entries: unknown[] }>();
  for (const c of categories) catMap.set(c.id as number, { ...c, entries: [] });
  for (const e of entries) catMap.get(e.category_id as number)?.entries.push(e);

  res.json({
    success: true,
    data: {
      ...event,
      categories: [...catMap.values()],
      cue: cue ?? DEFAULT_CUE,
    },
  });
}));

// 以降は認証必須
router.use(requireAuth, requirePermission('awards'));

// ── operator 用: イベント詳細 + 現在の cue state ─────────────
router.get('/events/:id/oneshot/state', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const event = await queryOne(
    `SELECT id, name, subtitle FROM awards_events WHERE id = ?`,
    [id]
  );
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const categories = await queryAll(
    `SELECT * FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`,
    [id]
  );
  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE event_id = ? ORDER BY category_id, rank NULLS LAST, id`,
    [id]
  );
  const cue = await queryOne(
    `SELECT entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live
     FROM awards_oneshot_cue_state WHERE event_id = ?`,
    [id]
  );

  const catMap = new Map<number, Record<string, unknown> & { entries: unknown[] }>();
  for (const c of categories) catMap.set(c.id as number, { ...c, entries: [] });
  for (const e of entries) catMap.get(e.category_id as number)?.entries.push(e);

  res.json({
    success: true,
    data: {
      ...event,
      categories: [...catMap.values()],
      cue: cue ?? DEFAULT_CUE,
    },
  });
}));

// ── HTTP 経由の cue 更新 (Socket.IO 不通時のフォールバック) ──
router.post('/events/:id/oneshot/cue', wrap(async (req, res) => {
  const eventId = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id FROM awards_events WHERE id = ?`, [eventId]);
  if (!event) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');

  const {
    entryId = null,
    moduleKey = 'title',
    tickerOn = false,
    tickerCatIdx = 0,
    transparent = false,
    lang = 'ja',
    isLive = false,
  } = req.body ?? {};

  await execute(
    `INSERT INTO awards_oneshot_cue_state
       (event_id, entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON CONFLICT (event_id) DO UPDATE
       SET entry_id = EXCLUDED.entry_id,
           module_key = EXCLUDED.module_key,
           ticker_on = EXCLUDED.ticker_on,
           ticker_cat_idx = EXCLUDED.ticker_cat_idx,
           transparent = EXCLUDED.transparent,
           lang = EXCLUDED.lang,
           is_live = EXCLUDED.is_live,
           updated_at = NOW()`,
    [eventId, entryId, moduleKey, tickerOn, tickerCatIdx, transparent, lang, isLive]
  );

  const io = req.app.get('io');
  if (io) {
    io.of('/awards').to(`event:${eventId}`).emit('oneshot:sync', {
      entryId,
      moduleKey,
      tickerOn,
      tickerCatIdx,
      transparent,
      lang,
      isLive,
      timestamp: Date.now(),
    });
  }

  res.json({ success: true });
}));

// ── エントリの oneshot_data を更新 (将来エディタUIから利用) ──
router.put('/entries/:id/oneshot-data', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const data = req.body?.oneshot_data ?? null;
  // pg の implicit cast に依存せず、明示的に ::jsonb キャスト
  await execute(
    `UPDATE awards_entries SET oneshot_data = ?::jsonb, updated_at = NOW() WHERE id = ?`,
    [data ? JSON.stringify(data) : null, id]
  );
  // 即時に保存後の状態を返す (クライアント側で UI 検証可能に)
  const row = await queryOne(
    `SELECT id, oneshot_data, updated_at FROM awards_entries WHERE id = ?`,
    [id]
  );
  res.json({ success: true, data: row });
}));

export default router;
