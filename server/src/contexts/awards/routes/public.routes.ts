import { Router, Request, Response, NextFunction } from 'express';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// v2.8.96: 公開 (auth 不要) エンドポイントを集約。
// 他 router (eventRoutes 等) は `router.use([...], requireAuth, ...)` で auth ガードを掛けているが、
// この middleware は **router 内のすべてのパス**で発火するため、Express が router を順次評価
// する過程で「他 router 担当の public path (例: oneshot.routes.ts の /events/:id/oneshot/output)」も
// eventRoutes の auth に蹴られてしまう。ここで一括して public 経路を**最初に**処理することで、
// auth 付き router に到達する前に解決する。

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const DEFAULT_ONESHOT_CUE = {
  entry_id: null,
  module_key: 'none',
  ticker_on: false,
  ticker_cat_idx: 0,
  transparent: false,
  lang: 'ja',
  is_live: false,
  show_portrait: true,
  bilingual: false,
};

// ── ランキングCG output (event 詳細 + categories + entries) ───────────
router.get('/events/:id/output', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const event = await queryOne(`SELECT id, name, subtitle FROM awards_events WHERE id = ?`, [id]);
  if (!event) { res.status(404).json({ success: false }); return; }

  const categories = await queryAll(
    `SELECT * FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`, [id]
  );
  const entries = await queryAll(
    `SELECT * FROM awards_entries WHERE event_id = ? ORDER BY category_id, rank NULLS LAST, id`, [id]
  );

  const catMap = new Map<number, Record<string, unknown> & { entries: unknown[] }>();
  for (const c of categories) catMap.set(c.id as number, { ...c, entries: [] });
  for (const e of entries) catMap.get(e.category_id as number)?.entries.push(e);

  res.json({ success: true, data: { ...event, categories: [...catMap.values()] } });
}));

// ── ランキングCG cue 状態 (HTTP fallback、Socket.IO 不通時用) ──────
router.get('/events/:eventId/cue', wrap(async (req, res) => {
  const eventId = parseInt(req.params.eventId as string);
  const state = await queryOne(
    `SELECT step, category_id, oneshot_style, updated_at FROM awards_cue_state WHERE event_id=?`,
    [eventId]
  );
  res.json({
    success: true,
    data: state ?? { step: 'idle', category_id: null, oneshot_style: 'classic' },
  });
}));

// ── 表彰CG (1S) module 構成 (放送送出ページ用) ─────────────
router.get('/events/:id/module-config', wrap(async (req, res) => {
  const id = parseInt(req.params.id as string);
  const row = await queryOne(
    `SELECT module_config FROM awards_events WHERE id = ?`, [id]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', 'イベントが見つかりません');
  res.json({ success: true, data: row.module_config ?? null });
}));

// ── 表彰CG (1S) output (event 詳細 + categories + entries(oneshot_data含む) + 現在の oneshot cue state) ──
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
    `SELECT entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live, show_portrait, bilingual
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
      cue: cue ?? DEFAULT_ONESHOT_CUE,
    },
  });
}));

export default router;
