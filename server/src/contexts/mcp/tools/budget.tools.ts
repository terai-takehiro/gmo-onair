import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { keepReportService } from '../../sales/services/keep-report.service';
import { ok, runTool, audit, REQUESTED_BY } from '../helpers';

// 隔週キープ資料 Phase 2: 月次予算 (monthly_budgets) + 実績補正 (monthly_actual_overrides)。
// 損益ページの「目標」列と、固定原価 (FIXED-COGS 償却) が ONAiR 未計上の月の経理確定値補完を担う。
// get_monthly_pl が損益ページの単一入口 — 目標 / 補正込み実績 / 対目標差・判定 (○/✕) を一括で返す。
// ロジックは keepReportService に集約 — UI (報告資料ページ) と同一コードパス。

const YM_RE = /^\d{4}-\d{2}$/;

export function registerBudgetTools(server: McpServer): void {
  server.registerTool(
    'get_monthly_budget',
    {
      title: '月次予算の取得',
      description: '月次予算 (売上 / 固定原価 / 変動原価 / 販管費 / 営業利益の目標値) を取得する。未登録なら found=false。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
      },
    },
    async (args) => runTool(async () => {
      const budget = await keepReportService.getBudget(args.year_month);
      return ok(budget ? { found: true, budget } : { found: false, year_month: args.year_month });
    }),
  );

  server.registerTool(
    'upsert_monthly_budget',
    {
      title: '月次予算の登録/更新',
      description:
        '月次予算を登録/更新する。**渡したフィールドだけ更新** (未指定は既存値を保持)。金額は円・税抜。' +
        'operating_profit 未指定のときは、マージ後の 売上 − 固定原価 − 変動原価 − 販管費 で自動計算する (構成要素が揃っている場合のみ)。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
        revenue: z.number().int().optional().describe('売上目標 (円)'),
        cogs_fixed: z.number().int().optional().describe('固定原価 (償却) 目標'),
        cogs_variable: z.number().int().optional().describe('変動原価目標'),
        sga: z.number().int().optional().describe('販管費目標'),
        operating_profit: z.number().int().optional().describe('営業利益目標 (未指定は自動計算)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const { action, budget } = await keepReportService.upsertBudget(args.year_month, {
        revenue: args.revenue, cogs_fixed: args.cogs_fixed, cogs_variable: args.cogs_variable,
        sga: args.sga, operating_profit: args.operating_profit,
      });
      audit('upsert_monthly_budget', { ...budget },
        { year_month: args.year_month, action }, args.requested_by);
      return ok({ [action]: true, action, budget });
    }),
  );

  server.registerTool(
    'upsert_monthly_actual_override',
    {
      title: '月次実績補正の登録/更新',
      description:
        'get_monthly_summary の自動集計値を経理確定値で上書きするための補正を登録する。**渡したフィールドだけ更新**。' +
        '用途: 固定原価 (FIXED-COGS 償却) が ONAiR に未計上の月の補完、販管費の経理確定値反映。' +
        '補正は get_monthly_pl の actual に反映され、has_override=true で注記できる。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
        cogs_fixed_actual: z.number().int().optional().describe('償却費の経理確定値 (円)'),
        sga_actual: z.number().int().optional().describe('販管費の経理確定値 (円)'),
        note: z.string().max(200).optional().describe('「償却再計上」等の注記'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const { action, override } = await keepReportService.upsertOverride(args.year_month, {
        cogs_fixed_actual: args.cogs_fixed_actual, sga_actual: args.sga_actual, note: args.note,
      });
      audit('upsert_monthly_actual_override', { ...override },
        { year_month: args.year_month, action }, args.requested_by);
      return ok({ [action]: true, action, override });
    }),
  );

  server.registerTool(
    'get_monthly_pl',
    {
      title: '月次損益 (目標 vs 実績)',
      description:
        '損益ページの単一入口。指定月の 予算 (budget) / 補正込み実績 (actual) / 対目標差・比・判定 (variance) を一括で返す。' +
        '実績は get_monthly_summary の自動集計に monthly_actual_overrides (経理確定値) を適用して再計算。' +
        '判定: 売上・利益系は 実績≧目標 → ○、費用系は 実績≦目標 → ○。目標未登録の月は判定 "-" (翌月見込みページ用)。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
      },
    },
    async (args) => runTool(async () => {
      const { override: _override, ...pl } = await keepReportService.getMonthlyPl(args.year_month);
      return ok(pl);
    }),
  );
}
