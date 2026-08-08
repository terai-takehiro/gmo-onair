/**
 * プロジェクト管理（GPM）の API (migration 161)
 *
 * マウントは `/api/v1/internal/gpm/*`。権限モジュールは `gpm`。
 *
 * **`gpm` を `UserListPage` の PERM_MODULES と `auth.routes` の MODULES に
 * 足してから**このルーターを守ること。逆順だと system_admin 以外の全員が 403 になり、
 * 画面から権限を付けることもできなくなる（`apps.ts` は前から `gpm` を宣言していたのに、
 * この2つに入っておらず**誰にも付与できない状態**だった）。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../shared/middleware/auth';
import { queryOne, execute } from '../../shared/db/connection';
import { estimateService } from '../sales/services/estimate.service';
import { gpmEstimateSummary } from './services/gpm-estimate.service';
import { AppError } from '../../shared/middleware/errorHandler';
import {
  templateService, projectService, openItemService, phaseService, memberService, gpmTaskService,
} from './services/gpm.service';
import { createGpmFolderTree, GPM_FOLDER_PREVIEW } from './services/gpm-box-folder.service';

/**
 * **その id はプロジェクト（GLS-B）か。**
 *
 * この口を通せば `gpm` の権限だけで案件（GLS-A）の見積を読み書きできてしまうので、
 * 見積を触るルートは必ずこれを通します。**`gls_category` を落とした瞬間に
 * 権限の壁が消える**ので、書き写さずにこの1本を呼ぶこと。
 */
async function isGpmProject(projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return false;
  const row = await queryOne(
    `SELECT id FROM projects WHERE id = ? AND gls_category = 'B' AND deleted_at IS NULL`,
    [projectId],
  );
  return !!row;
}

async function assertGpmProject(projectId: string): Promise<void> {
  if (!(await isGpmProject(projectId))) {
    throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');
  }
}

export function createGpmRoutes(): Router {
  const router = Router();
  const canRead = [requireAuth, requirePermission('gpm', 'reader')] as const;
  const canEdit = [requireAuth, requirePermission('gpm', 'editor')] as const;
  const canManage = [requireAuth, requirePermission('gpm', 'manager')] as const;

  // ── 標準工程テンプレート ────────────────────────────────
  router.get('/templates', ...canRead, async (_req, res) => {
    res.json({ success: true, data: await templateService.list() });
  });
  router.post('/templates', ...canEdit, async (req, res) => {
    res.status(201).json({ success: true, data: await templateService.create(req.body ?? {}, req.user!.id) });
  });
  router.put('/templates/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await templateService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  // **消すのは manager。** 適用中のプロジェクトがあっても消せてしまうので、
  // 誤って消したときの影響が大きい（写して使う作りなので既存には影響しないが、
  // 次に作る人が同じ工程を組み直すことになる）
  router.delete('/templates/:id', ...canManage, async (req, res) => {
    await templateService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  // ── プロジェクト（= GLS-B の案件）──────────────────────────
  router.get('/projects', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await projectService.list({
        stage: req.query.stage ? String(req.query.stage) : undefined,
        kind: req.query.kind ? String(req.query.kind) : undefined,
        q: req.query.q ? String(req.query.q) : undefined,
      }),
    });
  });
  router.get('/projects/:id', ...canRead, async (req, res) => {
    const row = await projectService.getById(String(req.params.id));
    if (!row) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'プロジェクトが見つかりません' } }); return; }
    res.json({ success: true, data: row });
  });
  router.post('/projects', ...canEdit, async (req, res) => {
    res.status(201).json({ success: true, data: await projectService.create(req.body ?? {}, req.user!.id) });
  });
  router.put('/projects/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await projectService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  router.delete('/projects/:id', ...canManage, async (req, res) => {
    await projectService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  /**
   * ── BOX フォルダ ────────────────────────────────────────
   *
   * **押したときだけ作る。** プロジェクトを作った流れで自動では作らない —
   * BOX に作ったフォルダはこのアプリからは消せず、人が手で消すことになる。
   * すでに URL を持っていたら 409 で止める（二重に作ると片方が迷子になる）。
   */
  router.get('/projects/:id/box-preview', ...canRead, async (_req, res) => {
    res.json({ success: true, data: GPM_FOLDER_PREVIEW });
  });

  router.post('/projects/:id/box-folder', ...canEdit, async (req, res) => {
    const id = String(req.params.id);
    const row = await queryOne(
      `SELECT name, box_url_internal, box_url_external FROM projects
        WHERE id = ? AND gls_category = 'B' AND deleted_at IS NULL`,
      [id],
    ) as { name: string; box_url_internal: string | null; box_url_external: string | null } | null;
    if (!row) throw new AppError(404, 'NOT_FOUND', 'プロジェクトが見つかりません');
    if (row.box_url_internal || row.box_url_external) {
      throw new AppError(409, 'ALREADY_EXISTS', 'このプロジェクトの BOX フォルダはすでに作られています');
    }

    const made = await createGpmFolderTree(row.name);
    if (!made.internal && !made.external) {
      throw new AppError(503, 'BOX_UNAVAILABLE', 'BOX にフォルダを作れませんでした。時間をおいて試してください');
    }
    await execute(
      'UPDATE projects SET box_url_internal = ?, box_url_external = ?, updated_at = NOW() WHERE id = ?',
      [made.internal?.folderUrl ?? null, made.external?.folderUrl ?? null, id],
    );
    res.json({ success: true, data: await projectService.getById(id) });
  });

  /**
   * ── タスク（⑤ 全プロジェクトのタスク一覧）────────────────
   *
   * **GLS-B のタスクだけを横断で見る口**。案件（GLS-A）のタスクは返しません。
   * migration 179 でタスクにも `project_id` が入ったので、案件管理の一覧・週報・
   * 「自分のタスク」にも出るようになりました（**GLS-B 案件のタスクなので正しい**）。
   * 案件管理の画面には `gls_category = 'A'` の絞り込みで出ません。
   */
  router.get('/tasks', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await gpmTaskService.listAll({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        project_id: typeof req.query.project_id === 'string' ? req.query.project_id : undefined,
      }),
    });
  });
  router.put('/tasks/:id/done', ...canEdit, async (req, res) => {
    res.json({
      success: true,
      data: await gpmTaskService.setDone(String(req.params.id), req.body?.done !== false, req.user!.id),
    });
  });

  /**
   * ── 見積（⑥ 見積・請求・v4 大⑤・migration 173）────────────
   *
   * `estimates` を案件と共用します（別表にすると版・明細・合計の作りが2つになり、
   * 片方だけ直る形が生まれる）。**案件管理側に混ざらないこと**は
   * `salesOverview`（返事待ち）と `billing.routes`（一覧）の2か所を実測して塞いだ
   * （migration 179 からは、どちらも `gls_category = 'A'` で絞っている）。
   */
  router.get('/projects/:id/estimates', ...canRead, async (req, res) => {
    const id = String(req.params.id);
    await assertGpmProject(id);
    res.json({ success: true, data: await estimateService.listByProject(id) });
  });

  router.post('/projects/:id/estimates', ...canEdit, async (req, res) => {
    const row = await estimateService.createForGpm(String(req.params.id), req.body ?? {}, req.user!.id);
    res.status(201).json({ success: true, data: row });
  });

  /**
   * 明細をまとめて置き換える。**案件の見積と同じサービス**（`replaceItems`）を呼ぶ。
   * 合計の計算を写すと、片方だけ直したときに同じ見積が2つの金額を持つ。
   *
   * **プロジェクトの見積しか触らせない。** 案件の見積は `sales` の持ち物で、
   * ここを通せば `gpm` だけの人が案件の金額を書き換えられてしまう
   * （`gpm_project_id IS NULL` を弾く）。
   */
  /** 1本ぶん（**明細つき**）。一覧は明細を積まない（重いので） */
  router.get('/estimates/:id', ...canRead, async (req, res) => {
    const row = await estimateService.getById(String(req.params.id));
    if (!row || !(await isGpmProject(row.project_id))) {
      throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    }
    res.json({ success: true, data: row });
  });

  router.put('/estimates/:id/items', ...canEdit, async (req, res) => {
    const id = String(req.params.id);
    const row = await estimateService.getById(id);
    if (!row) throw new AppError(404, 'NOT_FOUND', '見積が見つかりません');
    if (!(await isGpmProject(row.project_id))) {
      throw new AppError(403, 'FORBIDDEN', 'これは案件の見積です。案件管理の画面から直してください。');
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    res.json({ success: true, data: await estimateService.replaceItems(id, items) });
  });

  /** 見積のまとめ（ダッシュボードの KPI 2枚ぶん） */
  router.get('/estimates/summary', ...canRead, async (_req, res) => {
    res.json({ success: true, data: await gpmEstimateSummary() });
  });

  // ── 体制（組織図のメンバー・migration 169）────────────────
  router.post('/projects/:id/members', ...canEdit, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await memberService.add(String(req.params.id), req.body ?? {}),
    });
  });
  router.put('/members/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await memberService.update(String(req.params.id), req.body ?? {}) });
  });
  router.delete('/members/:id', ...canEdit, async (req, res) => {
    await memberService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  // ── 工程 ────────────────────────────────────────────────
  router.put('/phases/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await phaseService.update(String(req.params.id), req.body ?? {}) });
  });

  // ── 未確認事項 ──────────────────────────────────────────
  // **プロジェクトをまたいで引ける**のがこの表を作った理由
  // （議事録の JSONB では「いま何件止まっているか」を数えられない）
  router.get('/open-items', ...canRead, async (req, res) => {
    res.json({
      success: true,
      data: await openItemService.listAll({ status: req.query.status ? String(req.query.status) : undefined }),
    });
  });
  router.post('/projects/:id/open-items', ...canEdit, async (req, res) => {
    res.status(201).json({
      success: true,
      data: await openItemService.create(String(req.params.id), req.body ?? {}, req.user!.id),
    });
  });
  router.put('/open-items/:id', ...canEdit, async (req, res) => {
    res.json({ success: true, data: await openItemService.update(String(req.params.id), req.body ?? {}, req.user!.id) });
  });
  router.delete('/open-items/:id', ...canEdit, async (req, res) => {
    await openItemService.remove(String(req.params.id));
    res.json({ success: true, data: { deleted: true } });
  });

  return router;
}
