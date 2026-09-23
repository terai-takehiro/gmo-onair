/**
 * Wiki — スペース管理の API（区画 `wiki` の manager・設計 §8）。
 *
 * - `GET    /wiki/manage/spaces`                       管理用の一覧（読めるスペースだけ）
 * - `POST   /wiki/manage/spaces`                       追加
 * - `PATCH  /wiki/manage/spaces/:id`                   編集（渡した項目だけ。`key` は変えられない）
 * - `DELETE /wiki/manage/spaces/:id`                   削除（ページが残っていれば 400）
 * - `GET    /wiki/manage/spaces/:id/members`           メンバーの一覧
 * - `PUT    /wiki/manage/spaces/:id/members/:userId`   メンバーに加える
 * - `DELETE /wiki/manage/spaces/:id/members/:userId`   メンバーから外す
 *
 * ⚠️ 道は `/wiki/spaces/...` の下に置きません。`spaces.routes.ts` の `/spaces/:key` が
 * `manage` を `key` として食べてしまうためです。
 *
 * ⚠️ 読めないスペースは 403 ではなく 404（§8）。判定は service が持ちます。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { ValidationError } from '../../qsheet/services/httpErrors';
import {
  addSpaceMember, createSpace, deleteSpace, listSpaceMembers, listSpacesForAdmin,
  removeSpaceMember, updateSpace, type UpdateSpaceInput,
} from '../services/wiki-space-admin.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canManage = [requireAuth, requirePermission('wiki', 'manager')] as const;

function body(req: { body?: unknown }): Record<string, unknown> {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

router.get('/manage/spaces', ...canManage, wrap(async (req, res) => {
  res.json({ success: true, data: await listSpacesForAdmin(req.user!) });
}));

router.post('/manage/spaces', ...canManage, wrap(async (req, res) => {
  const b = body(req);
  const row = await createSpace(req.user!, {
    key: b.key, name: b.name, description: b.description,
    visibility: b.visibility, owner_user_id: b.owner_user_id,
  });
  res.status(201).json({ success: true, data: row });
}));

router.patch('/manage/spaces/:id', ...canManage, wrap(async (req, res) => {
  const b = body(req);
  if (Object.prototype.hasOwnProperty.call(b, 'key')) {
    throw new ValidationError('URL に使う名前はあとから変えられません（貼られたリンクが切れるため）。');
  }
  // 渡された項目だけを渡す（`undefined` を入れると「空にする」と区別できなくなる）
  const input: UpdateSpaceInput = {};
  for (const k of ['name', 'description', 'visibility', 'owner_user_id', 'sort_order'] as const) {
    if (Object.prototype.hasOwnProperty.call(b, k)) input[k] = b[k];
  }
  res.json({ success: true, data: await updateSpace(req.user!, p1(req.params.id), input) });
}));

router.delete('/manage/spaces/:id', ...canManage, wrap(async (req, res) => {
  res.json({ success: true, data: await deleteSpace(req.user!, p1(req.params.id)) });
}));

router.get('/manage/spaces/:id/members', ...canManage, wrap(async (req, res) => {
  res.json({ success: true, data: await listSpaceMembers(req.user!, p1(req.params.id)) });
}));

router.put('/manage/spaces/:id/members/:userId', ...canManage, wrap(async (req, res) => {
  const rows = await addSpaceMember(req.user!, p1(req.params.id), p1(req.params.userId));
  res.json({ success: true, data: rows });
}));

router.delete('/manage/spaces/:id/members/:userId', ...canManage, wrap(async (req, res) => {
  const rows = await removeSpaceMember(req.user!, p1(req.params.id), p1(req.params.userId));
  res.json({ success: true, data: rows });
}));

export default router;
