import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../config';
import { mcpOAuthProvider } from './oauth/provider';

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

/** OAuth ディスカバリを促すため、401 に resource metadata を指す WWW-Authenticate を付ける */
function oauthChallenge(res: Response): void {
  const origin = config.clientUrl.replace(/\/$/, '');
  res.set(
    'WWW-Authenticate',
    `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/v1/mcp"`,
  );
}

export async function mcpAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const presented = extractPresentedKey(req);

  // ① 静的 APIキー (Claude Code CLI / ?key= コネクタ)。一致すれば共用 actor。
  if (config.mcpApiKey && presented && safeEqual(presented, config.mcpApiKey)) {
    (req as any).mcpActor = { actorId: config.mcpActorId, isOAuth: false };
    next();
    return;
  }

  // ② OAuth アクセストークン (claude.ai コネクタ・ONAiR ログイン連携)。JWT 検証で実ユーザーを解決。
  const bearer = req.headers.authorization?.toLowerCase().startsWith('bearer ')
    ? req.headers.authorization!.slice(7).trim()
    : null;
  if (bearer) {
    try {
      const info = await mcpOAuthProvider.verifyAccessToken(bearer);
      const userId = (info.extra?.userId as string) || info.clientId;
      (req as any).mcpActor = { actorId: userId, isOAuth: true };
      next();
      return;
    } catch {
      // OAuth トークンとして無効 → 下の 401 へ
    }
  }

  // ③ どちらでもない。claude.ai には OAuth ディスカバリを促す (WWW-Authenticate)。
  //    静的キー運用のみのときも、claude.ai コネクタからのアクセスは OAuth に誘導する。
  //    MCP_API_KEY も OAuth も無効の環境では 503 相当だが、OAuth は常に有効なので 401 を返す。
  oauthChallenge(res);
  res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Unauthorized: sign in via OAuth or present a valid API key' },
    id: null,
  });
}
