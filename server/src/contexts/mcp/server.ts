import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from './tools/projects.tools';
import { registerStudioTools } from './tools/studio.tools';
import { registerFinanceTools } from './tools/finance.tools';
import { registerCustomerTools } from './tools/customers.tools';
import { registerActivityTools } from './tools/activities.tools';
import { registerTaskTools } from './tools/tasks.tools';
import { registerMemberTools } from './tools/members.tools';
import { registerAnalyticsTools } from './tools/analytics.tools';
import { registerUserTools } from './tools/users.tools';
import { registerOpsReportTools } from './tools/opsreports.tools';
import { registerInviewTools } from './tools/inview.tools';
import { registerInboxTools } from './tools/inbox.tools';
import { registerPricingTools } from './tools/pricing.tools';
import { registerEventReportTools } from './tools/eventreports.tools';
import { registerBudgetTools } from './tools/budget.tools';
import { registerMinutesTools } from './tools/minutes.tools';
import { registerSecurityCardTools } from './tools/security-cards.tools';
import { registerAiFeedbackTools } from './tools/aifeedback.tools';
import { registerMyTaskTools } from './tools/mytasks.tools';

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
  registerTaskTools(server);      // 案件タスク (read + create/update/move/reorder/delete/一括作成)
  registerMemberTools(server);    // プロジェクト担当メンバー (複数担当・外部の方 read + add/remove)
  registerAnalyticsTools(server); // 営業分析 (read)
  registerUserTools(server);      // ユーザー解決 (read)
  registerOpsReportTools(server); // 日常業務レポート (read + 週報/日報の投稿)
  registerInviewTools(server);    // 内覧会 来場予約 (read + Kairos3 メール取込登録)
  registerInboxTools(server);     // 見積/請求書 + その他問い合わせ (read + メール取込)
  registerPricingTools(server);   // 料金表 (read) + 見積シミュレーション (read + 設定)
  registerEventReportTools(server); // イベント実施報告 (隔週キープ資料 — トピック/来場者/写真)
  registerBudgetTools(server);      // 月次予算 + 実績補正 + 損益 (目標 vs 実績)
  registerMinutesTools(server);     // 議事録サマリ
  registerSecurityCardTools(server); // スタジオ セキュリティカード管理 (read + 貸出/返却)
  registerAiFeedbackTools(server); // AI出力の修正傾向ダイジェスト (フィードバックの還流・read)
  registerMyTaskTools(server);     // 個人タスク・依頼・投入 (口頭依頼を投入テキスト経由でストック化)

  return server;
}
