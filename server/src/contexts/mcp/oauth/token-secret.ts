import crypto from 'crypto';
import { config } from '../../../config';

// MCP OAuth アクセストークン (JWT) の署名鍵。
// ONAiR ログイン用 JWT (config.jwtSecret) とは用途を分けるため、そこから派生した別鍵を使う
// (万一 MCP トークンが漏れても ONAiR セッション JWT の偽造には使えない)。
export const MCP_TOKEN_SECRET = crypto
  .createHash('sha256')
  .update(`mcp-oauth-access:${config.jwtSecret}`)
  .digest('hex');

export const ACCESS_TOKEN_TTL_SEC = 3600;              // 1 時間
export const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30 日

export interface McpAccessTokenClaims {
  sub: string;        // ONAiR users.id
  cid: string;        // client_id
  scope: string;
  typ: 'mcp_access';
}
