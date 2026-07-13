import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { salesAnalyticsService } from '../../sales/services/sales-analytics.service';
import { ok, runTool } from '../helpers';

// 営業分析 (sales-analytics) の MCP ツール — salesAnalyticsService を再利用 (読み取り専用)。
// 週次/月次の営業レポートや定期ダイジェストの生成に使う。金額は円 (税抜)。

export function registerAnalyticsTools(server: McpServer): void {
  server.registerTool(
    'get_sales_funnel',
    {
      title: '営業ファネル分析',
      description:
        'ステージ別の件数・想定金額、受注率/失注率、ステージ間転換率、平均滞留日数、月次推移を返す。' +
        '週次/月次レポート用途。stage コードの意味は list_projects の説明を参照。',
      inputSchema: {
        year: z.number().int().min(2020).max(2100).optional().describe('対象年 (未指定=全期間)'),
        month: z.number().int().min(1).max(12).optional().describe('対象月 (year とセット)'),
      },
    },
    async (args) => runTool(async () => ok(await salesAnalyticsService.getFunnelAnalysis(args.year, args.month))),
  );

  server.registerTool(
    'get_lost_reason_analysis',
    {
      title: '失注理由分析',
      description: '失注理由別の件数・金額、月次推移、直近の失注案件 (教訓・学び付き) を返す。',
      inputSchema: {
        year: z.number().int().min(2020).max(2100).optional(),
      },
    },
    async (args) => runTool(async () => ok(await salesAnalyticsService.getLostReasonAnalysis(args.year))),
  );

  server.registerTool(
    'get_sales_performance',
    {
      title: '営業実績 (目標対比)',
      description: '担当者別の 目標 vs 実績 (受注金額/件数・達成率・受注率・平均案件単価) を返す。月次の営業評価用途。',
      inputSchema: {
        year: z.number().int().min(2020).max(2100).describe('対象年 (必須)'),
        month: z.number().int().min(1).max(12).optional().describe('対象月 (未指定=年間)'),
      },
    },
    async (args) => runTool(async () => ok(await salesAnalyticsService.getPerformanceReview(args.year, args.month))),
  );
}
