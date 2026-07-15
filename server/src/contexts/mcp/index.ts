import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuth } from './auth';
import { buildMcpServer } from './server';
import { actorContext, type McpActor } from './helpers';
import { config } from '../../config';

// MCP (Model Context Protocol) エンドポイント — /api/v1/mcp
// Claude Code 等の MCP クライアントが Streamable HTTP で接続する。
//   claude mcp add --transport http onair https://<host>/api/v1/mcp \
//     --header "Authorization: Bearer <MCP_API_KEY>"
//
// stateless モード (sessionIdGenerator: undefined) で毎リクエスト server+transport を生成。
// enableJsonResponse: true で応答は素の application/json (SSE 不使用) — nginx バッファリングの影響を受けない。

export function createMcpRoutes(): Router {
  const router = Router();

  router.use(mcpAuth);

  router.post('/', async (req, res) => {
    // 書き込み actor をリクエストスコープに載せる (OAuth 経由なら実 ONAiR ユーザー、
    // 静的キー経由なら共用 mcpActorId)。ツールは currentActorId() で参照する。
    const actor: McpActor = (req as any).mcpActor ?? { actorId: config.mcpActorId, isOAuth: false };
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
