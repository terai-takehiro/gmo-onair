import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuth } from './auth';
import { enforceToolPermissions } from './gate';
import { buildMcpServer } from './server';
import { actorContext, type McpActor } from './helpers';
import { config } from '../../config';

// MCP エンドポイントのレート制限。認証済み (成功) リクエストは skip し、認証失敗
// (APIキー総当たり等) のみをカウントして総当たりを抑制する。正常なツール連続呼び出しは妨げない。
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded' }, id: null },
});

// MCP (Model Context Protocol) エンドポイント — /api/v1/mcp
// Claude Code 等の MCP クライアントが Streamable HTTP で接続する。
//   claude mcp add --transport http onair https://<host>/api/v1/mcp \
//     --header "Authorization: Bearer <MCP_API_KEY>"
//
// stateless モード (sessionIdGenerator: undefined) で毎リクエスト server+transport を生成。
// enableJsonResponse: true で応答は素の application/json (SSE 不使用) — nginx バッファリングの影響を受けない。

export function createMcpRoutes(): Router {
  const router = Router();

  router.use(mcpLimiter);
  router.use(mcpAuth);

  router.post('/', async (req, res) => {
    // 書き込み actor をリクエストスコープに載せる (OAuth 経由なら実 ONAiR ユーザー、
    // 静的キー経由なら共用 mcpActorId)。ツールは currentActorId() で参照する。
    const actor: McpActor = (req as any).mcpActor ?? { actorId: config.mcpActorId, isOAuth: false };

    // 権限ゲート: OAuth (per-user) actor の書き込みツールは対応モジュールの権限を要求する。
    // 静的 APIキー actor はフルアクセス運用鍵として素通り。
    try {
      await enforceToolPermissions(req.body, actor);
    } catch (err) {
      const id = req.body && !Array.isArray(req.body) ? ((req.body as any).id ?? null) : null;
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: err instanceof Error ? err.message : 'Forbidden' },
        id,
      });
      return;
    }

    await actorContext.run(actor, async () => {
      const server = buildMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('[mcp] request error:', err instanceof Error ? err.message : err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });
  });

  // stateless モードでは GET (SSE ストリーム) / DELETE (セッション終了) は提供しない
  const methodNotAllowed = (_req: unknown, res: any) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (stateless MCP server: use POST)' },
      id: null,
    });
  };
  router.get('/', methodNotAllowed);
  router.delete('/', methodNotAllowed);

  return router;
}
