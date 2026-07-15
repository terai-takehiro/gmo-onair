import type { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { queryOne, execute } from '../../../shared/db/connection';
import { mcpClientsStore } from './store';
import { authorizeContext } from './context';
import {
  MCP_TOKEN_SECRET, ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC, McpAccessTokenClaims,
} from './token-secret';

const DEFAULT_SCOPE = 'mcp';

function issueAccessToken(userId: string, clientId: string, scope: string): { token: string; expiresIn: number } {
  const claims: McpAccessTokenClaims = { sub: userId, cid: clientId, scope, typ: 'mcp_access' };
  const token = jwt.sign(claims, MCP_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SEC });
  return { token, expiresIn: ACCESS_TOKEN_TTL_SEC };
}

async function issueRefreshToken(userId: string, clientId: string, scope: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString();
  await execute(
    `INSERT INTO mcp_oauth_refresh_tokens (token, client_id, user_id, scope, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [token, clientId, userId, scope, expiresAt],
  );
  return token;
}

export const mcpOAuthProvider: OAuthServerProvider = {
  get clientsStore() {
    return mcpClientsStore;
  },

  // 認可開始。ONAiR ユーザーは /authorize の pre-middleware が AsyncLocalStorage に載せている。
  // ここで認可コードを発行し、クライアントの redirect_uri に code(+state) を付けて 302 する。
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const ctx = authorizeContext.getStore();
    if (!ctx?.userId) {
      // pre-middleware が必ずログインを担保するため通常到達しない (保険)
      const url = new URL(params.redirectUri);
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'not authenticated');
      if (params.state) url.searchParams.set('state', params.state);
      res.redirect(302, url.toString());
      return;
    }

    const code = crypto.randomBytes(32).toString('hex');
    const scope = (params.scopes && params.scopes.length ? params.scopes.join(' ') : DEFAULT_SCOPE);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分
    await execute(
      `INSERT INTO mcp_oauth_codes (code, client_id, redirect_uri, code_challenge, user_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, client.client_id, params.redirectUri, params.codeChallenge, ctx.userId, scope,
       params.resource ? params.resource.toString() : null, expiresAt],
    );

    const url = new URL(params.redirectUri);
    url.searchParams.set('code', code);
    if (params.state) url.searchParams.set('state', params.state);
    res.redirect(302, url.toString());
  },

  // SDK の token ハンドラが PKCE 検証に使う (保存済み challenge を返すだけ)
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const row = await queryOne(
      `SELECT code_challenge FROM mcp_oauth_codes WHERE code = ? AND client_id = ?`,
      [authorizationCode, client.client_id],
    ) as any;
    if (!row) throw new Error('invalid authorization code');
    return row.code_challenge;
  },

  // 認可コード → アクセストークン (JWT) + リフレッシュトークン。PKCE は SDK が検証済み。
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = await queryOne(
      `SELECT * FROM mcp_oauth_codes WHERE code = ? AND client_id = ?`,
      [authorizationCode, client.client_id],
    ) as any;
    if (!row) throw new Error('invalid_grant: code not found');
    // 単回使用: 取得したら即削除
    await execute('DELETE FROM mcp_oauth_codes WHERE code = ?', [authorizationCode]);
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('invalid_grant: code expired');
    if (redirectUri && redirectUri !== row.redirect_uri) throw new Error('invalid_grant: redirect_uri mismatch');

    const scope = row.scope || DEFAULT_SCOPE;
    const { token, expiresIn } = issueAccessToken(row.user_id, client.client_id, scope);
    const refresh = await issueRefreshToken(row.user_id, client.client_id, scope);
    return { access_token: token, token_type: 'Bearer', expires_in: expiresIn, refresh_token: refresh, scope };
  },

  // リフレッシュトークン → 新しいアクセストークン
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const row = await queryOne(
      `SELECT * FROM mcp_oauth_refresh_tokens WHERE token = ? AND client_id = ?`,
      [refreshToken, client.client_id],
    ) as any;
    if (!row || row.revoked_at) throw new Error('invalid_grant: refresh token invalid');
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('invalid_grant: refresh token expired');
    const scope = (scopes && scopes.length ? scopes.join(' ') : (row.scope || DEFAULT_SCOPE));
    const { token, expiresIn } = issueAccessToken(row.user_id, client.client_id, scope);
    return { access_token: token, token_type: 'Bearer', expires_in: expiresIn, refresh_token: refreshToken, scope };
  },

  // アクセストークン (JWT) 検証 → AuthInfo。extra.userId に実 ONAiR ユーザーを載せる。
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    let claims: McpAccessTokenClaims;
    try {
      claims = jwt.verify(token, MCP_TOKEN_SECRET) as McpAccessTokenClaims;
    } catch {
      throw new Error('invalid_token');
    }
    if (claims.typ !== 'mcp_access') throw new Error('invalid_token');
    const decoded = jwt.decode(token) as { exp?: number } | null;
    return {
      token,
      clientId: claims.cid,
      scopes: (claims.scope || DEFAULT_SCOPE).split(' ').filter(Boolean),
      expiresAt: decoded?.exp,
      extra: { userId: claims.sub },
    };
  },

  async revokeToken(client: OAuthClientInformationFull, request: { token: string }): Promise<void> {
    // リフレッシュトークンのみ失効可能 (アクセストークンは JWT でステートレス)
    await execute(
      `UPDATE mcp_oauth_refresh_tokens SET revoked_at = NOW() WHERE token = ? AND client_id = ?`,
      [request.token, client.client_id],
    );
  },
};
