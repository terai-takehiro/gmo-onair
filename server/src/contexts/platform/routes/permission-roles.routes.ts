/**
 * 役割 (権限の型) の API — v4 設定 ③ 権限とメンバー
 *
 * `/users` の下に置くと `/users/:id` と当たる（`roles` が id として拾われる）ので
 * **別のパスに分けています**。`users.routes.ts` は既に `/me/permissions` を
 * `/:id/permissions` より先に書く回避をしており、同じ罠を増やさないため。
 *
 * 読み書きどちらも `system_admin` だけ（権限モデル単純化: 旧 `admin` 区画は
 * 廃止し、権限とメンバーの管理は system_admin に一本化した。
 * docs/reviews/permission-model-simplification-plan.md）。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { queryOne, execute } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  listRoles, getRole, createRole, setRoleModules, applyRoleToUser,
  membersOfRole, roleDrift, ROLE_MODULES,
} from '../services/permission-role.service';

/** Express 5 の `params` は `string | string[]`。`:id` は必ず1つなので文字列に寄せる */
const p1 = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v ?? '');

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

const router = Router();
router.use(requireAuth);

/** 型の一覧（中身と人数つき）。型が触る区画の一覧も返す — 画面が列を組み立てる */
router.get('/', requireRole('system_admin'), wrap(async (_req, res) => {
  res.json({
    success: true,
    data: {
      roles: await listRoles(),
      modules: ROLE_MODULES,
    },
  });
}));

router.post('/', requireRole('system_admin'), wrap(async (req, res) => {
  const { name, description, modules } = req.body ?? {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', '役割の名前を入れてください');
  }
  const role = await createRole({ name, description, modules });
  res.status(201).json({ success: true, data: role });
}));

/**
 * 型を直す。`reapply` が真のときだけ、押してある人にも反映します。
 *
 * **既定は反映しません。** 型を直しただけで全員の権限が黙って変わると、
 * 変えた本人にも「誰の何が変わったか」が分かりません。画面で人数を見せて
 * 選んでもらいます。
 */
router.put('/:id', requireRole('system_admin'), wrap(async (req, res) => {
  const role = await getRole(p1(req.params.id));
  if (!role) throw new AppError(404, 'NOT_FOUND', 'その役割はありません');

  const { name, description, modules, reapply } = req.body ?? {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', '役割の名前を入れてください');
    }
    await execute(
      'UPDATE permission_roles SET name = ?, description = ?, updated_at = NOW() WHERE id = ?',
      [name.trim(), typeof description === 'string' ? description.trim() || null : role.description, req.params.id],
    );
  }
  if (modules && typeof modules === 'object') await setRoleModules(p1(req.params.id), modules);

  let applied: { id: string; name: string; changed: string[] }[] = [];
  if (reapply) {
    for (const m of await membersOfRole(p1(req.params.id))) {
      applied.push({ ...m, changed: await applyRoleToUser(m.id, p1(req.params.id)) });
    }
  }

  res.json({ success: true, data: { role: await getRole(p1(req.params.id)), applied } });
}));

/**
 * 型を消す。初期の5つは消せません（消すと、押してある人の権限が
 * どの型から来たのか追えなくなる）。押してある人がいるときも止めます。
 */
router.delete('/:id', requireRole('system_admin'), wrap(async (req, res) => {
  const role = await getRole(p1(req.params.id));
  if (!role) throw new AppError(404, 'NOT_FOUND', 'その役割はありません');
  if (role.is_builtin) throw new AppError(400, 'VALIDATION_ERROR', '最初から入っている役割は消せません（名前と中身は直せます）');
  if (role.member_count > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `この役割の人が ${role.member_count} 名います。先に別の役割へ移してください`);
  }
  await execute('UPDATE permission_roles SET deleted_at = NOW() WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: '役割を消しました' });
}));

/** その型を押してある人 */
router.get('/:id/members', requireRole('system_admin'), wrap(async (req, res) => {
  res.json({ success: true, data: await membersOfRole(p1(req.params.id)) });
}));

/**
 * 人に型を押す。**権限が実際に書き換わります。**
 * `role_id` が null なら型を外すだけ（権限はそのまま残す — 外した瞬間に
 * 全部消えると、外すつもりが権限剥奪になる）。
 */
router.put('/assign/:userId', requireRole('system_admin'), wrap(async (req, res) => {
  const user = await queryOne('SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL', [req.params.userId]);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'その利用者はいません');

  const roleId = req.body?.role_id ?? null;
  if (!roleId) {
    await execute('UPDATE users SET permission_role_id = NULL, updated_at = NOW() WHERE id = ?', [req.params.userId]);
    res.json({ success: true, data: { changed: [], role_id: null } });
    return;
  }
  if (!(await getRole(roleId))) throw new AppError(404, 'NOT_FOUND', 'その役割はありません');

  const changed = await applyRoleToUser(p1(req.params.userId), roleId);
  res.json({ success: true, data: { changed, role_id: roleId } });
}));

/** 押してある型と実際の権限のずれ（画面に「例外あり」を出すため） */
router.get('/drift/:userId', requireRole('system_admin'), wrap(async (req, res) => {
  const user = await queryOne(
    'SELECT permission_role_id FROM users WHERE id = ? AND deleted_at IS NULL',
    [req.params.userId],
  );
  const roleId = (user?.permission_role_id as string | null) ?? null;
  if (!roleId) { res.json({ success: true, data: { role_id: null, drift: [] } }); return; }
  res.json({ success: true, data: { role_id: roleId, drift: await roleDrift(p1(req.params.userId), roleId) } });
}));

export default router;
