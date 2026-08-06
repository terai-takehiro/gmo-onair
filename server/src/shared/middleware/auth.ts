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
    console.log('[auth] requireAuth FAIL — path:', req.path);
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
 * req.user.permissions が空の場合は DB を直接クエリしてフォールバック
 */
export type PermissionLevel = 'reader' | 'exporter' | 'editor' | 'manager' | 'owner';

// 3段階に集約: 閲覧(reader+exporter) / 編集(editor) / 管理(manager+owner)
const LEVEL_ORDER: Record<string, number> = {
  reader: 1, exporter: 1, editor: 2, manager: 3, owner: 3,
};

/**
 * 権限レベルが要求を満たすか。
 *
 * HTTP の requirePermission と、HTTP を通らない経路 (Socket.IO の共同編集など) で
 * **同じ判定を使う**ために export している。判定を写すと片方だけ緩くなる
 * (v2.9.207 で MCP 側が HTTP の requirePermission をバイパスしていたのと同じ形)。
 */
export function meetsPermissionLevel(
  userRole: string | undefined,
  userLevel: string | undefined,
  minLevel: PermissionLevel,
): boolean {
  if (userRole === 'system_admin') return true;
  if (!userLevel) return false;
  return (LEVEL_ORDER[userLevel] ?? 0) >= LEVEL_ORDER[minLevel];
}

/**
 * **どれか1つの権限があれば通す。**
 *
 * 1つのデータを2つの入口から扱う画面のためのもの。たとえば請求は
 * 案件管理の「見積・請求」(`sales`) と財務の「請求・入金」(`budget`) の
 * 両方から見て・記録します。片方だけを要求すると、**経理だけの人が
 * 月次の締めをできない / 営業が入金待ちを見られない**のどちらかになります。
 *
 * 判定は `requirePermission` と**同じ `meetsPermissionLevel` を通します** —
 * 写すと片方だけ緩くなります。
 */
export function requireAnyPermission(modules: string[], minLevel: PermissionLevel = 'reader') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '認証が必要です' } });
      return;
    }
    const ok = modules.some((m) =>
      meetsPermissionLevel(req.user!.role, req.user!.permissions?.[m], minLevel));
    if (ok) { next(); return; }

    console.log(`[auth] 403 user=${req.user.id} role=${req.user.role} modules=${modules.join('|')}`);
    const isProduction = process.env.NODE_ENV === 'production';
    const error = isProduction
      ? { code: 'FORBIDDEN', message: 'このモジュールへのアクセス権限がありません' }
      : {
          code: 'FORBIDDEN',
          message: 'このモジュールへのアクセス権限がありません',
          debug: {
            requiredAnyOf: modules,
            requiredMinLevel: minLevel,
            userRole: req.user.role,
            allPermissions: req.user.permissions ?? {},
          },
        };
    res.status(403).json({ success: false, error });
  };
}

export function requirePermission(module: string, minLevel: PermissionLevel = 'reader') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '認証が必要です' } });
      return;
    }

    if (req.user.role === 'system_admin') {
      next();
      return;
    }

    let userLevel = req.user.permissions?.[module];

    // Failsafe: if permissions cache is empty, re-query DB directly
    if (!userLevel && req.user.permissions && Object.keys(req.user.permissions).length === 0) {
      try {
        const rows = await queryAll(
          'SELECT access_level FROM user_permissions WHERE user_id = ? AND module = ?',
          [req.user.id, module]
        );
        if (rows.length > 0) {
          userLevel = rows[0].access_level as string;
          console.log(`[auth] permissions cache miss for user=${req.user.id} module=${module}, DB fallback: ${userLevel}`);
        }
      } catch { /* ignore DB errors */ }
    }

    if (!meetsPermissionLevel(req.user.role, userLevel, minLevel)) {
      const isProduction = process.env.NODE_ENV === 'production';
      console.log(`[auth] 403 user=${req.user.id} role=${req.user.role} module=${module} userLevel=${userLevel}`);
      const error = isProduction
        ? { code: 'FORBIDDEN', message: 'このモジュールへのアクセス権限がありません' }
        : {
            code: 'FORBIDDEN',
            message: 'このモジュールへのアクセス権限がありません',
            debug: {
              requiredModule: module,
              requiredMinLevel: minLevel,
              userRole: req.user.role,
              userLevel: userLevel ?? null,
              allPermissions: req.user.permissions ?? {},
            },
          };
      res.status(403).json({ success: false, error });
      return;
    }
    next();
  };
}
