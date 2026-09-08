import { Router, type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { metadataHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/metadata.js';
import { config } from '../../../config';
import { verifyToken } from '../../../shared/auth/jwt';
import { mcpOAuthProvider } from './provider';
import { mcpClientsStore } from './store';
import { authorizeContext } from './context';

// MCP OAuth 2.1 認可サーバー。claude.ai 組織カスタムコネクタが要求する DCR + authorization_code + PKCE を提供。
// 認証は ONAiR ログイン連携: /authorize でブラウザの ONAiR cookie を検証し、未ログインなら /login へ誘導。

const ORIGIN = config.clientUrl.replace(/\/$/, '');           // 例 https://gmo-onair.jp
const OAUTH_BASE = `${ORIGIN}/api/v1/mcp/oauth`;
const RESOURCE_URL = `${ORIGIN}/api/v1/mcp`;

// ---- 認可サーバー メタデータ (RFC 8414) ----
const AS_METADATA = {
  issuer: ORIGIN,
  authorization_endpoint: `${OAUTH_BASE}/authorize`,
  token_endpoint: `${OAUTH_BASE}/token`,
  registration_endpoint: `${OAUTH_BASE}/register`,
  revocation_endpoint: `${OAUTH_BASE}/revoke`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['mcp'],
};

// ---- 保護リソース メタデータ (RFC 9728) ----
const PR_METADATA = {
  resource: RESOURCE_URL,
  authorization_servers: [ORIGIN],
  bearer_methods_supported: ['header'],
  scopes_supported: ['mcp'],
};

/** ルート直下の well-known メタデータ (nginx は全パスをアプリへ転送するため root で処理できる) */
export function registerMcpOAuthMetadata(app: Router): void {
  const asHandler = metadataHandler(AS_METADATA as never);
  const prHandler = metadataHandler(PR_METADATA as never);
  app.use('/.well-known/oauth-authorization-server', asHandler);
  // 保護リソースは resource パスの有無どちらでも引けるようにする
  app.use('/.well-known/oauth-protected-resource/api/v1/mcp', prHandler);
  app.use('/.well-known/oauth-protected-resource', prHandler);
}

/**
 * /authorize の前段: ブラウザの ONAiR ログイン (cookie gmo_onair_token) を検証。
 * 未ログインなら ONAiR ログインへ 302 (ログイン後にこの authorize URL へ全画面で戻る)。
 * ログイン済みなら AsyncLocalStorage に userId を載せて SDK authorize ハンドラを実行。
 */
function onairLoginGate(authHandler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookieToken = (req as any).cookies?.gmo_onair_token as string | undefined;
    const payload = cookieToken ? verifyToken(cookieToken) : null;
    if (!payload?.userId || req.user?.id !== payload.userId) {
      const returnUrl = req.originalUrl; // /api/v1/mcp/oauth/authorize?...(client_id 等)
      res.redirect(302, `/login?redirect=${encodeURIComponent(returnUrl)}`);
      return;
    }
    authorizeContext.run({ userId: payload.userId, userName: payload.name }, () => {
      authHandler(req, res, next);
    });
  };
}

/** /api/v1/mcp/oauth/* にマウントする AS エンドポイント群 */
export function createMcpOAuthRouter(): Router {
  const router = Router();
  const authHandler = authorizationHandler({ provider: mcpOAuthProvider });

  // レート制限: DCR (動的クライアント登録) の濫用 (DB 肥大) と token エンドポイントへの
  // 総当たりを抑制する。token は認証成功 (正常フロー) を skip し失敗のみカウント。
  const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const tokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.use('/authorize', onairLoginGate(authHandler));
  router.use('/token', tokenLimiter, tokenHandler({ provider: mcpOAuthProvider }));
  router.use('/register', registerLimiter, clientRegistrationHandler({ clientsStore: mcpClientsStore }));
  router.use('/revoke', revocationHandler({ provider: mcpOAuthProvider }));
  return router;
}
