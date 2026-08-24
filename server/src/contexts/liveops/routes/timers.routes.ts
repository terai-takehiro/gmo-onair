import { Router } from 'express';
import { queryAll as query, queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const canRead  = [requireAuth, requirePermission('qsheet', 'reader')] as const;
const canWrite = [requireAuth, requirePermission('qsheet', 'manager')] as const;

// `shared/src/client/live/displayLayout.ts` の DISPLAY_ELEMENT_KEYS と同じ6キー。
// server はビルドを持たず shared/src/client を import しない構成のためここで複製する
// （`shared/CLAUDE.md` の `src/collab/` と同じ「意図的な複製」パターン）。
// PUT /:id/layout がここを緩く見ていると、表示画面（client-live/TimerDisplayPage.tsx の
// isValidDisplayLayout）側だけを固くしても、qsheet manager 権限で直接 API を叩けば
// 不正な要素（未知の key・null要素等）を保存できてしまう。
const VALID_DISPLAY_ELEMENT_KEYS = new Set(['timer', 'youtube', 'jstream', 'zoom', 'teams', 'total']);

function isValidDisplayLayoutElement(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const e = el as Record<string, unknown>;
  if (typeof e.key !== 'string' || !VALID_DISPLAY_ELEMENT_KEYS.has(e.key)) return false;
  if (typeof e.visible !== 'boolean') return false;
  return (['x', 'y', 'w', 'h'] as const).every(
    (k) => typeof e[k] === 'number' && Number.isFinite(e[k] as number),
  );
}

// 公開: 表示画面用（認証不要・ブラウザソース用）
router.get('/:id/display', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT id, viewer_overlay_program_id, program_id FROM liveops_timers WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 公開: 表示画面用（認証不要・読み取り専用）。自由配置レイアウトの配信。
// 行が無いタイマーは data: null → TimerDisplayPage.tsx 側で固定3パターンにフォールバック。
//
// ⚠️ ルート名は '/:id/display' という契約テスト監視対象の文字列から意図的に離す
// （'/:id/display-layout' のような近接命名は避ける。将来ルートをグルーピングする
// リファクタが入った際に保護対象行を巻き込みにくくするため）。
router.get('/:id/layout', async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT layout FROM liveops_timer_display_layouts WHERE timer_id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: row ? (row as any).layout : null });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/', ...canRead, async (req, res) => {
  try {
    const { project_id, program_id } = req.query;
    const params: string[] = [];
    const filters: string[] = [];
    if (program_id) { params.push(String(program_id)); filters.push(`t.program_id = $${params.length}`); }
    if (project_id) { params.push(String(project_id)); filters.push(`t.project_id = $${params.length}`); }
    const where = filters.length ? `AND (${filters.join(' OR ')})` : '';
    const rows = await query(
      `SELECT t.*, p.name AS project_name, p.gls_number
       FROM liveops_timers t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.deleted_at IS NULL ${where}
       ORDER BY t.updated_at DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id', ...canRead, async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT t.*, p.name AS project_name, p.gls_number
       FROM liveops_timers t
       LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND t.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: computeClientState(row) });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { name, projectId, programId, warningThresholdSec = 60, viewerOverlayProgramId } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name required' });

    const id = uuidv4();
    await execute(
      `INSERT INTO liveops_timers
         (id, name, project_id, program_id, warning_threshold_sec, viewer_overlay_program_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name, projectId || null, programId || null, warningThresholdSec, viewerOverlayProgramId || null, userId]
    );
    const row = await queryOne('SELECT * FROM liveops_timers WHERE id = $1', [id]);
    res.status(201).json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put('/:id', ...canWrite, async (req, res) => {
  try {
    const { name, projectId, programId, warningThresholdSec, viewerOverlayProgramId } = req.body;
    await execute(
      `UPDATE liveops_timers SET
         name = COALESCE($2, name),
         project_id = $3,
         program_id = $4,
         warning_threshold_sec = COALESCE($5, warning_threshold_sec),
         viewer_overlay_program_id = $6,
         updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id, name ?? null, projectId ?? null, programId ?? null, warningThresholdSec ?? null, viewerOverlayProgramId ?? null]
    );
    const row = await queryOne('SELECT * FROM liveops_timers WHERE id = $1', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: row });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/:id', ...canWrite, async (req, res) => {
  try {
    await execute(
      'UPDATE liveops_timers SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// エディタでの直接編集の保存（認証あり・canWrite）。テンプレート適用
// （display-templates.routes.ts の /apply）とは別経路。
router.put('/:id/layout', ...canWrite, async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    const { layout } = req.body;
    if (
      !layout ||
      (layout.background !== 'dark' && layout.background !== 'light') ||
      !Array.isArray(layout.elements) ||
      !layout.elements.every(isValidDisplayLayoutElement)
    ) {
      return res.status(400).json({ success: false, message: 'layout.elements required' });
    }
    await execute(
      `INSERT INTO liveops_timer_display_layouts (timer_id, layout, source_template_id, updated_by, updated_at)
       VALUES ($1, $2, NULL, $3, NOW())
       ON CONFLICT (timer_id) DO UPDATE SET
         layout = EXCLUDED.layout,
         source_template_id = NULL,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [req.params.id, JSON.stringify(layout), userId]
    );
    res.json({ success: true, data: layout });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// 「未設定に戻す」＝ 固定3パターン描画へ戻す（認証あり・canWrite）。
router.delete('/:id/layout', ...canWrite, async (req, res) => {
  try {
    await execute('DELETE FROM liveops_timer_display_layouts WHERE timer_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

function computeClientState(row: any) {
  if (!row.running) {
    return { ...row, remainingMs: Number(row.paused_remaining_ms ?? row.remaining_ms) };
  }
  const elapsed = row.started_at ? Date.now() - new Date(row.started_at).getTime() : 0;
  // ⚠️ 稼働中も remainingMs（キャメルケース）で統一する。socket.ts の getClientState()
  //   と同じキー名にすること（この応答だけキー名が割れていると、素直に読むクライアント側が
  //   片方の状態で値を取れなくなる）。
  return { ...row, remainingMs: Number(row.paused_remaining_ms) - elapsed };
}

export default router;
