import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';

/**
 * 現場の道具の成果物 (§4.14 / デザイン 12a)
 *
 * 翻訳・インタラクティブ・リアルタイムCG は案件に紐づかない使い方も普通にある
 * (社内資料の翻訳、社外イベントの演出)。案件を必須にすると入口の摩擦になり、
 * かといって何も残さないと「あの翻訳どこ行った」になる。
 *
 * ここに残すのは**メタだけ** (種類・題名・外部URL・作った人・案件は任意)。
 * 中身は各ツール側にあり、複製しない。
 */
const router = Router();

/**
 * このルーターは `/tool-outputs` に**パス付きでマウントする** (sales/index.ts)。
 *
 * 以前はパス無しでマウントし、ここで `router.use(requireAuth, requirePermission('sales'))`
 * を**パス無し**で掛けていた。Express のパス無し `use` は
 * **そのルーターに届いた全リクエスト**で発火するため、sales ルーターは API のルートに
 * マウントされている関係で「sales より後にマウントされた全コンテキスト
 * (finance / equipment / qsheet …) のリクエストにも sales 権限を要求する」状態になっていた。
 * 結果、**budget 権限だけの経理ユーザーは財務の全画面が 403** になっていた
 * (v2.8.96 で awards が踏んだのと同じ形)。
 *
 * パス付きマウント + ルート定義を '/' 基準にすることで、この漏れが構造的に起きない。
 */
router.use(requireAuth, requirePermission('sales'));

const TOOLS = ['translate', 'interactive', 'cg'] as const;
type Tool = (typeof TOOLS)[number];

const SELECT = `
  SELECT o.id, o.tool, o.title, o.external_url, o.project_id, o.is_internal_use, o.note,
         o.created_by, o.created_at, o.linked_at,
         u.name AS created_by_name,
         p.name AS project_name, p.gls_number
  FROM external_tool_outputs o
  LEFT JOIN users u ON u.id = o.created_by
  LEFT JOIN projects p ON p.id = o.project_id AND p.deleted_at IS NULL
`;

/**
 * 一覧。
 *   ?project_id=… → その案件の成果物
 *   ?unlinked=1   → まだ案件に紐づいていないもの (社内利用と決めたものは出さない)
 */
router.get('/', async (req, res) => {
  const { project_id, unlinked, tool } = req.query;
  const where: string[] = ['o.deleted_at IS NULL'];
  const params: unknown[] = [];

  if (typeof project_id === 'string' && project_id) {
    where.push('o.project_id = ?');
    params.push(project_id);
  } else if (unlinked === '1') {
    // 「社内利用」を押したものは以後案件を求めない (§4.14) ので、ここには出さない
    where.push('o.project_id IS NULL', 'o.is_internal_use = FALSE');
  }
  if (typeof tool === 'string' && TOOLS.includes(tool as Tool)) {
    where.push('o.tool = ?');
    params.push(tool);
  }

  const rows = await queryAll(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT 200`,
    params
  );
  res.json({ success: true, data: rows });
});

/** 記録する (ツールを開いたとき / 成果物ができたとき) */
router.post('/', requirePermission('sales', 'editor'), async (req, res) => {
  const { tool, title, external_url, project_id, note, is_internal_use } = req.body ?? {};
  if (!TOOLS.includes(tool)) {
    throw new AppError(400, 'VALIDATION_ERROR', `tool は ${TOOLS.join(' / ')} のいずれかです`);
  }
  if (typeof title !== 'string' || !title.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'title は必須です');
  }
  if (project_id) {
    const p = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [project_id]);
    if (!p) throw new AppError(400, 'VALIDATION_ERROR', '案件が見つかりません');
  }

  const id = uuidv4();
  await execute(
    `INSERT INTO external_tool_outputs
       (id, tool, title, external_url, project_id, note, is_internal_use, created_by, linked_at, linked_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, tool, title.trim(), external_url || null, project_id || null, note || null,
      !!is_internal_use, req.user!.id,
      project_id ? new Date().toISOString() : null,
      project_id ? req.user!.id : null,
    ]
  );
  const row = await queryOne(`${SELECT} WHERE o.id = ?`, [id]);
  res.status(201).json({ success: true, data: row });
});

/**
 * 後から紐づける / 社内利用にする。
 * どちらも「案件を探し続ける状態」を終わらせる操作なので同じ口にした。
 */
router.patch('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  const { project_id, is_internal_use, title, note } = req.body ?? {};
  const existing = await queryOne(
    'SELECT id FROM external_tool_outputs WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  );
  if (!existing) throw new AppError(404, 'NOT_FOUND', '成果物が見つかりません');

  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];

  if (project_id !== undefined) {
    if (project_id) {
      const p = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [project_id]);
      if (!p) throw new AppError(400, 'VALIDATION_ERROR', '案件が見つかりません');
      sets.push('project_id = ?', 'linked_at = NOW()', 'linked_by = ?');
      params.push(project_id, req.user!.id);
      // 案件に紐づけたら「社内利用」は取り下げる (両方立つと意味が矛盾する)
      sets.push('is_internal_use = FALSE');
    } else {
      sets.push('project_id = NULL', 'linked_at = NULL', 'linked_by = NULL');
    }
  }
  if (is_internal_use !== undefined) {
    sets.push('is_internal_use = ?');
    params.push(!!is_internal_use);
  }
  if (typeof title === 'string' && title.trim()) {
    sets.push('title = ?');
    params.push(title.trim());
  }
  if (note !== undefined) {
    sets.push('note = ?');
    params.push(note || null);
  }

  await execute(`UPDATE external_tool_outputs SET ${sets.join(', ')} WHERE id = ?`, [...params, req.params.id]);
  const row = await queryOne(`${SELECT} WHERE o.id = ?`, [req.params.id]);
  res.json({ success: true, data: row });
});

router.delete('/:id', requirePermission('sales', 'editor'), async (req, res) => {
  await execute(
    'UPDATE external_tool_outputs SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  );
  res.json({ success: true, data: { id: req.params.id } });
});

export default router;
