import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../../config';
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
import { registerProductionTools } from './tools/production.tools';
import { registerEquipmentTools } from './tools/equipment.tools';
import { registerGpmTools } from './tools/gpm.tools';
import { registerIntercompanyTools } from './tools/intercompany.tools';

// GMO ONAiR MCP サーバー本体。
// stateless HTTP モードのためリクエストごとに生成される (ツール登録のみで I/O は無いので軽量)。
// 書き込みツールは helpers の audit() で mcp_audit_log に記録し、
// 重要操作 (GLS 発番 / 失注) は confirm 2段階 (preview → 了承 → 実行)。

/**
 * **本番と検証で違う名前を名乗る**（2026-09-06）
 *
 * 検証環境にも同じ MCP が立っている（`https://dev.gmo-onair.jp/api/v1/mcp`）。
 * ところが**両方とも `gmo-onair` と名乗っていた**ので、コネクタを2本つないだ
 * クライアントには**見分けの付かない同名の口が2つ**並ぶ。呼ぶ側は
 * どちらに書いているか分からず、**検証のつもりで本番に書けてしまう**
 * （実際に、この製品の MCP コネクタが本番を指していることに気づけたのは
 * `list_users` が実在の社員を返したからで、名前からは分からなかった）。
 *
 * 環境の分離は会社の決めごとの中でも最上位（CLAUDE.md「環境分離ポリシー」）なので、
 * **名乗りの時点で区別**する。`instructions` は MCP クライアントが
 * モデルに渡す説明文で、こちらにも書いておく（名前を見落としても気づける）。
 *
 * ⚠️ **本番側の名前は変えない。** 変えると既存のコネクタの表示名が変わり、
 * 利用者から見て別物に見える。足すのは検証側の `-dev` だけ。
 */
const DEV_INSTRUCTIONS = [
  '⚠️ これは **検証環境**（dev.gmo-onair.jp / DB は onair_dev）の GMO ONAiR です。',
  'ここに書いたデータは本番（gmo-onair.jp）には一切反映されません。自由に壊して構いません。',
  '本番のデータを見たい・直したいときは、本番のコネクタ（gmo-onair）を使ってください。',
].join('\n');

const PROD_INSTRUCTIONS = [
  'これは **本番環境**（gmo-onair.jp）の GMO ONAiR です。',
  '書き込みは実際の業務データに残ります。試し打ちは検証環境（gmo-onair-dev）で行ってください。',
].join('\n');

export function buildMcpServer(): McpServer {
  const isProd = config.isProduction;
  const server = new McpServer({
    name: isProd ? 'gmo-onair' : 'gmo-onair-dev',
    version: process.env.npm_package_version || 'unknown',
  }, {
    instructions: isProd ? PROD_INSTRUCTIONS : DEV_INSTRUCTIONS,
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
  registerProductionTools(server); // 制作資料 (進行台本・スケジュール表。OAuth actor 専用・提案まで)
  registerEquipmentTools(server);  // 機材管理 (台帳検索・詳細・貸出履歴・棚卸し状況 read + 貸出/返却)
  registerGpmTools(server);        // プロジェクト管理 (GPM: プロジェクト・工程・タスク・未確認事項・体制・標準工程)
  registerIntercompanyTools(server); // 社内取引 (GJV⇄GSS。read + 社内発注の作成)

  return server;
}
