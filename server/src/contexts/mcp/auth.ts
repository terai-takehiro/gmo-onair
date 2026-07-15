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
  // クエリパラメータ ?key= (claude.ai カスタムコネクタの追加ダイアログはヘッダーを
  // 設定できない UI があるため、URL にキーを埋め込む方式もサポートする。
  // URL 自体が秘密情報になる点は docs/mcp-server.md に明記)
  const queryKey = req.query?.key;
  if (typeof queryKey === 'string' && queryKey.trim()) return queryKey.trim();
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
    // ※ `WWW-Authenticate: Bearer` はあえて付けない。
    //   このヘッダーを 401 に付けると MCP 認証仕様 (RFC 9728) に従って claude.ai の
    //   カスタムコネクタが OAuth 2.1 のクライアント登録 (DCR) を試みてしまい、
    //   OAuth サーバーが無いため「サインインサービスに登録できませんでした /
    //   OAuth Client ID を追加してください」エラーになる。
    //   本サーバーは静的 APIキー (?key= / Bearer / X-API-Key) のみを使うため、
    //   OAuth を誘発しないようチャレンジヘッダーを送出しない。
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Unauthorized: invalid or missing API key' },
      id: null,
    });
    return;
  }

  next();
}
