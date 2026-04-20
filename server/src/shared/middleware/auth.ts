import { Request, Response, NextFunction } from 'express';
import { queryOne, queryAll } from '../db/connection';
import { verifyToken } from '../auth/jwt';
import { config } from '../../config';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: Record<string, string>; // module -> access_level
}

declare global {
  namespace Express {
    // Augment Express.User (used by passport) to include AuthUser fields
    interface User extends AuthUser {}
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * ユーザー情報をDBから取得してpermissionsを付与する共通関数
 */
async function loadUserWithPermissions(userId: string): Promise<AuthUser | undefined> {
  const user = await queryOne(
    'SELECT id, name, email, role FROM users WHERE id = ? AND deleted_at IS NULL',
    [userId]
  ) as AuthUser | undefined;

  if (!user) return undefined;

  if (user.role === 'system_admin') {
    user.permissions = {};
  } else {
    const perms = await queryAll('SELECT module, access_level FROM user_permissions WHERE user_id = ?', [userId]);
    user.permissions = {};
    for (const p of perms) {
      user.permissions[p.module as string] = p.access_level as string;
    }
  }
  return user;
}

/**
 * mockAuth: x-user-id ヘッダーで認証（開発用）
 */
export async function mockAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) { next(); return; }
  try {
    req.user = await loadUserWithPermissions(userId);
  } catch (_) {
    // DB not ready yet
  }
  next();
}

/**
 * jwtAuth: Authorization Bearer token または gmo_onair_token cookie で認証
 */
export async function jwtAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Extract token from: 1) Authorization header, 2) cookie
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies?.gmo_onair_token) {
    token = req.cookies.gmo_onair_token;
  }

  if (!token) { next(); return; }

  const payload = verifyToken(token);
  if (!payload) { next(); return; }

  try {
    req.user = await loadUserWithPermissions(payload.userId);
  } catch (_) {
    // DB not ready
  }
  next();
}

/**
 * 認証ミドルウェア自動選択: GOOGLE_CLIENT_ID が設定されていれば JWT、なければ mockAuth
 */
export function createAuthMiddleware() {
  if (config.authMode === 'password') {
    return jwtAuth;
  }
  return mockAuth;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    console.log('[auth] requireAuth FAIL — path:', req.path, 'x-user-id:', req.headers['x-user-id'], 'auth:', req.headers.authorization?.slice(0, 20));
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
 */
export function requirePermission(module: string, minLevel: 'reader' | 'exporter' | 'editor' | 'manager' | 'owner' = 'reader') {
  // 3段階に集約: 閲覧(reader+exporter) / 編集(editor) / 管理(manager+owner)
  const levelOrder = { reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3 };

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '認証が必要です' } });
      return;
    }

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
