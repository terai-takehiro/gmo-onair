// 案件 (GLS-B) 共同編集の HTTP 入口 (要件 B1)
//
// 同時編集そのものは Socket.IO (`/project-collab`) が担う。
// こちらは共同編集を使わない経路のためにある:
//   - まだ画面が無い段階での確認・初期投入
//   - MCP / AI からの読み書き (要件 B5)
//   - 単に読むだけのページ
//
// 権限は socket 側と同じ `sales` (読みは reader / 書きは editor)。
// 判定を写さず `requirePermission` と `meetsPermissionLevel` を共有しているので、
// 「画面からは書けないのに API からは書ける」ような食い違いは起きない。

import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import { projectCollabService } from '../services/project-collab.service';
import type { ProjectCollabDoc } from '../../../shared/collab/projectCollabDoc';

const router = Router();

/** 作業メモとチェックリストを読む */
router.get(
  '/:id/collab',
  requireAuth,
  requirePermission('sales', 'reader'),
  async (req, res) => {
    const doc = await projectCollabService.getDoc(String(req.params.id));
    res.json({ success: true, data: doc });
  }
);

/**
 * 全置換で保存する。
 *
 * **だれかが同時編集中なら 409 で拒否する** (service 側で判定)。
 * 編集中に丸ごと差し替えると、いま画面で打っている人の入力を黙って消す。
 * 「後勝ち上書きをやめる」のがこの機能の目的なので、ここで上書きしたら本末転倒。
 */
router.put(
  '/:id/collab',
  requireAuth,
  requirePermission('sales', 'editor'),
  async (req, res) => {
    const userId = req.user?.id;
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'ログインが必要です');

    const body = (req.body ?? {}) as Partial<ProjectCollabDoc>;
    if (body.notes !== undefined && typeof body.notes !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'notes は文字列で指定してください');
    }
    if (body.checklist !== undefined && !Array.isArray(body.checklist)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'checklist は配列で指定してください');
    }
    const saved = await projectCollabService.putDoc(
      String(req.params.id),
      { notes: body.notes ?? '', checklist: body.checklist ?? [] },
      userId
    );
    res.json({ success: true, data: saved });
  }
);

export default router;
