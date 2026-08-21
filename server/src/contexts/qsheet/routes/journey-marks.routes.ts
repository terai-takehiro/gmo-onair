/**
 * 制作のジャーニーの人のピン（`production_journey_marks`）
 *
 * 「決まった」「要注意」「無視する」を人が押した記録。**行は消さず** `cleared_at` を立てる
 * （「決まった」と言ったあとに戻したこと自体がジャーニーの情報）。
 *
 * ⚠️ ピンを押せる人の範囲は `requirePermission('qsheet','editor')` — 案件の資料が
 * 1件も見えない人でも押せてしまう（01 §9-8。この段では既定のまま）。
 */
import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';

const SCOPE_TYPES = ['project', 'document'] as const;
const STAGES = ['day', 'flow', 'script'] as const;
const KINDS = ['settled', 'watch', 'dismissed'] as const;

const router = Router();

router.use(requireAuth, requirePermission('qsheet', 'editor'));

router.post('/journey/marks', async (req: Request, res: Response) => {
  try {
    const { scope_type, scope_id, target_date, stage, kind, hint_key, note } = req.body as Record<string, unknown>;

    if (typeof scope_type !== 'string' || !SCOPE_TYPES.includes(scope_type as (typeof SCOPE_TYPES)[number])) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'scope_type が不正です' } });
      return;
    }
    if (typeof scope_id !== 'string' || !scope_id) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'scope_id が必要です' } });
      return;
    }
    if (typeof stage !== 'string' || !STAGES.includes(stage as (typeof STAGES)[number])) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'stage が不正です' } });
      return;
    }
    if (typeof kind !== 'string' || !KINDS.includes(kind as (typeof KINDS)[number])) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'kind が不正です' } });
      return;
    }

    const id = uuid();
    await execute(
      `INSERT INTO production_journey_marks
         (id, scope_type, scope_id, target_date, stage, kind, hint_key, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
      [
        id,
        scope_type,
        scope_id,
        typeof target_date === 'string' ? target_date : null,
        stage,
        kind,
        typeof hint_key === 'string' ? hint_key : null,
        typeof note === 'string' ? note.slice(0, 2000) : null,
        req.user!.id,
      ],
    );

    const row = await queryOne('SELECT * FROM production_journey_marks WHERE id = ?', [id]);
    if (!row) {
      // 部分 UNIQUE (生きているピンの重複) に当たって INSERT が無視された
      const existing = await queryOne(
        `SELECT * FROM production_journey_marks
         WHERE scope_type = ? AND scope_id = ? AND COALESCE(target_date,'') = COALESCE(?, '')
           AND stage = ? AND kind = ? AND COALESCE(hint_key,'') = COALESCE(?, '') AND cleared_at IS NULL`,
        [scope_type, scope_id, typeof target_date === 'string' ? target_date : null, stage, kind, typeof hint_key === 'string' ? hint_key : null],
      );
      res.status(200).json({ success: true, data: existing ?? null });
      return;
    }

    res.status(201).json({ success: true, data: row });
  } catch (err: unknown) {
    console.error('POST /journey/marks error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

router.delete('/journey/marks/:id', async (req: Request, res: Response) => {
  try {
    const existing = await queryOne('SELECT id FROM production_journey_marks WHERE id = ? AND cleared_at IS NULL', [req.params.id]);
    if (!existing) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ピンが見つかりません' } });
      return;
    }
    await execute(
      'UPDATE production_journey_marks SET cleared_at = NOW(), cleared_by = ? WHERE id = ?',
      [req.user!.id, req.params.id],
    );
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err: unknown) {
    console.error('DELETE /journey/marks/:id error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

// 参照用（画面がまだ無いこの段では使わないが、ルーターとして完結させておく）
router.get('/journey/marks', async (req: Request, res: Response) => {
  try {
    const { scope_type, scope_id } = req.query;
    if (typeof scope_type !== 'string' || typeof scope_id !== 'string') {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'scope_type と scope_id が必要です' } });
      return;
    }
    const rows = await queryAll(
      'SELECT * FROM production_journey_marks WHERE scope_type = ? AND scope_id = ? AND cleared_at IS NULL ORDER BY created_at DESC',
      [scope_type, scope_id],
    );
    res.json({ success: true, data: rows });
  } catch (err: unknown) {
    console.error('GET /journey/marks error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: 'サーバー内部エラーが発生しました' } });
  }
});

export default router;
