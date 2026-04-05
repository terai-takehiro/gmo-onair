import { Request, Response, NextFunction } from 'express';
import { queryOne, queryAll } from '../db/connection';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: Record<string, string>; // module -> access_level
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function mockAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) { next(); return; }
  try {
    const user = await queryOne('SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL', [userId]) as AuthUser | undefined;
    if (user) {
      // system_admin は全権限を持つ
      if (user.role === 'system_admin') {
        user.permissions = {};
      } else {
        const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [userId]);
        user.permissions = {};
        for (const p of perms) {
          user.permissions[p.module as string] = p.access_level as string;
        }
      }
      req.user = user;
    }
  } catch (_) {
    // DB not ready yet
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '認証が必要です' } });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'アクセス権限がありません' } });
      return;
    }
    next();
  };
}

/**
 * モジュール別パーミッションチェック
 * system_admin は常にアクセス可能
 * @param module - チェック対象のモジュール名
 * @param minLevel - 最低限必要なアクセスレベル ('viewer' | 'editor' | 'admin')
 */
export function requirePermission(module: string, minLevel: 'viewer' | 'editor' | 'admin' = 'viewer') {
  const levelOrder = { viewer: 1, editor: 2, admin: 3 };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '認証が必要です' } });
      return;
    }

    // system_admin は全権限
    if (req.user.role === 'system_admin') {
      next();
      return;
    }

    const userLevel = req.user.permissions?.[module];
    if (!userLevel || levelOrder[userLevel as keyof typeof levelOrder] < levelOrder[minLevel]) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'このモジュールへのアクセス権限がありません' } });
      return;
    }
    next();
  };
}
