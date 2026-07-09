import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools/projects.tools';
import { registerStudioTools } from './tools/studio.tools';
import { registerFinanceTools } from './tools/finance.tools';

// GMO ONAiR MCP サーバー本体。
// stateless HTTP モードのためリクエストごとに生成される (ツール登録のみで I/O は無いので軽量)。

export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'gmo-onair',
    version: process.env.npm_package_version || 'unknown',
  });

  registerProjectTools(server);   // 案件管理 (read)
  registerStudioTools(server);    // スタジオ予約カレンダー (read + 予約作成)
  registerFinanceTools(server);   // 財務管理 (read)

  return server;
}
