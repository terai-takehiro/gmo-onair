import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools/projects.tools';
import { registerStudioTools } from './tools/studio.tools';
import { registerFinanceTools } from './tools/finance.tools';
import { registerCustomerTools } from './tools/customers.tools';
import { registerActivityTools } from './tools/activities.tools';
import { registerTaskTools } from './tools/tasks.tools';
import { registerAnalyticsTools } from './tools/analytics.tools';
import { registerUserTools } from './tools/users.tools';
import { registerOpsReportTools } from './tools/opsreports.tools';
import { registerInviewTools } from './tools/inview.tools';

// GMO ONAiR MCP サーバー本体。
// stateless HTTP モードのためリクエストごとに生成される (ツール登録のみで I/O は無いので軽量)。
// 書き込みツールは helpers の audit() で mcp_audit_log に記録し、
// 重要操作 (GLS 発番 / 失注) は confirm 2段階 (preview → 了承 → 実行)。

export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: 'gmo-onair',
    version: process.env.npm_package_version || 'unknown',
  });

  registerProjectTools(server);   // 案件管理 (read + create/update/stage/GLS発番)
  registerStudioTools(server);    // スタジオ予約カレンダー (read + 予約作成)
  registerFinanceTools(server);   // 財務管理 (read)
  registerCustomerTools(server);  // 顧客 (read + create/update・重複ガード)
  registerActivityTools(server);  // 営業活動記録 (read + create/update)
  registerTaskTools(server);      // 案件タスク (read + create/update)
  registerAnalyticsTools(server); // 営業分析 (read)
  registerUserTools(server);      // ユーザー解決 (read)
  registerOpsReportTools(server); // 日常業務レポート (read + 週報/日報の投稿)
  registerInviewTools(server);    // 内覧会 来場予約 (read + Kairos3 メール取込登録)

  return server;
}
