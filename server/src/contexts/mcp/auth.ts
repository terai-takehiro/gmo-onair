import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../config';

// MCP エンドポイント (/api/v1/mcp) の APIキー認証。
// - env MCP_API_KEY 未設定 → 503 (機能無効。キーを設定するまで一切公開されない)
// - `Authorization: Bearer <key>` (推奨) または `X-API-Key: <key>` で照合
// - 比較は sha256 ハッシュ経由の timingSafeEqual (長さ差でも throw しない)
// - キー値そのものはログに出さないこと

function extractPresentedKey(req: Request): string | null {
  const authz = req.headers.authorization;
  if (authz && authz.toLowerCase().startsWith('bearer ')) {
    return authz.slice(7).trim();
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.trim()) return apiKey.trim();
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function mcpAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.mcpApiKey) {
    res.status(503).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'MCP server is not enabled (MCP_API_KEY not set)' },
      id: null,
    });
    return;
  }

  const presented = extractPresentedKey(req);
  if (!presented || !safeEqual(presented, config.mcpApiKey)) {
    res.status(401)
      .set('WWW-Authenticate', 'Bearer')
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unauthorized: invalid or missing API key' },
        id: null,
      });
    return;
  }

  next();
}
