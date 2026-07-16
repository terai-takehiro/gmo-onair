import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryOne, execute } from '../../../shared/db/connection';
import { getMonthlySummary } from '../../finance/services/monthly-summary.service';
import { ok, runTool, audit, REQUESTED_BY } from '../helpers';

// 隔週キープ資料 Phase 2: 月次予算 (monthly_budgets) + 実績補正 (monthly_actual_overrides)。
// 損益ページの「目標」列と、固定原価 (FIXED-COGS 償却) が ONAiR 未計上の月の経理確定値補完を担う。
// get_monthly_pl が損益ページの単一入口 — 目標 / 補正込み実績 / 対目標差・判定 (○/✕) を一括で返す。

const YM_RE = /^\d{4}-\d{2}$/;

/** BIGINT は pg から string で返るため数値化 (null は保持) */
function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

async function getBudgetRow(ym: string) {
  const r = await queryOne('SELECT * FROM monthly_budgets WHERE year_month = ?', [ym]) as Record<string, unknown> | null;
  if (!r) return null;
  return {
    year_month: r.year_month,
    revenue: num(r.revenue),
    cogs_fixed: num(r.cogs_fixed),
    cogs_variable: num(r.cogs_variable),
    sga: num(r.sga),
    operating_profit: num(r.operating_profit),
    updated_at: r.updated_at,
  };
}

async function getOverrideRow(ym: string) {
  const r = await queryOne('SELECT * FROM monthly_actual_overrides WHERE year_month = ?', [ym]) as Record<string, unknown> | null;
  if (!r) return null;
  return {
    year_month: r.year_month,
    cogs_fixed_actual: num(r.cogs_fixed_actual),
    sga_actual: num(r.sga_actual),
    note: r.note,
    updated_at: r.updated_at,
  };
}

/**
 * 判定ロジック (要件書 §2.5):
 *  - 売上・利益系: 実績≧目標 → ○ / それ以外 → ✕
 *  - 費用系 (原価・販管費): 実績≦目標 → ○ / それ以外 → ✕
 *  - 目標未登録は判定・対目標比を "-"
 */
function varianceOf(actual: number, budget: number | null, kind: 'higher_better' | 'lower_better') {
  if (budget == null) return { actual, budget: null, diff: null, ratio: null, judge: '-' };
  const diff = actual - budget;
  const ratio = budget !== 0 ? Math.round((actual / budget) * 1000) / 10 : null; // % (小数1桁)
  const judge = kind === 'higher_better' ? (actual >= budget ? '○' : '✕') : (actual <= budget ? '○' : '✕');
  return { actual, budget, diff, ratio, judge };
}

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
      const budget = await getBudgetRow(args.year_month);
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
      const existing = await getBudgetRow(args.year_month);
      const merged = {
        revenue: args.revenue ?? existing?.revenue ?? null,
        cogs_fixed: args.cogs_fixed ?? existing?.cogs_fixed ?? null,
        cogs_variable: args.cogs_variable ?? existing?.cogs_variable ?? null,
        sga: args.sga ?? existing?.sga ?? null,
        operating_profit: args.operating_profit ?? existing?.operating_profit ?? null,
      };
      // 営業利益: 明示指定が無く構成要素が揃っていれば自動計算
      if (args.operating_profit === undefined
          && merged.revenue != null && merged.cogs_fixed != null && merged.cogs_variable != null && merged.sga != null) {
        merged.operating_profit = merged.revenue - merged.cogs_fixed - merged.cogs_variable - merged.sga;
      }
      await execute(
        `INSERT INTO monthly_budgets (year_month, revenue, cogs_fixed, cogs_variable, sga, operating_profit)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (year_month) DO UPDATE SET
           revenue = EXCLUDED.revenue, cogs_fixed = EXCLUDED.cogs_fixed, cogs_variable = EXCLUDED.cogs_variable,
           sga = EXCLUDED.sga, operating_profit = EXCLUDED.operating_profit, updated_at = NOW()`,
        [args.year_month, merged.revenue, merged.cogs_fixed, merged.cogs_variable, merged.sga, merged.operating_profit],
      );
      const action = existing ? 'updated' : 'created';
      audit('upsert_monthly_budget', { year_month: args.year_month, ...merged },
        { year_month: args.year_month, action }, args.requested_by);
      return ok({ [action]: true, action, budget: await getBudgetRow(args.year_month) });
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
      const existing = await getOverrideRow(args.year_month);
      const merged = {
        cogs_fixed_actual: args.cogs_fixed_actual ?? existing?.cogs_fixed_actual ?? null,
        sga_actual: args.sga_actual ?? existing?.sga_actual ?? null,
        note: args.note ?? existing?.note ?? null,
      };
      await execute(
        `INSERT INTO monthly_actual_overrides (year_month, cogs_fixed_actual, sga_actual, note)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (year_month) DO UPDATE SET
           cogs_fixed_actual = EXCLUDED.cogs_fixed_actual, sga_actual = EXCLUDED.sga_actual,
           note = EXCLUDED.note, updated_at = NOW()`,
        [args.year_month, merged.cogs_fixed_actual, merged.sga_actual, merged.note],
      );
      const action = existing ? 'updated' : 'created';
      audit('upsert_monthly_actual_override', { year_month: args.year_month, ...merged },
        { year_month: args.year_month, action }, args.requested_by);
      return ok({ [action]: true, action, override: await getOverrideRow(args.year_month) });
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
      const [budget, override, summary] = await Promise.all([
        getBudgetRow(args.year_month),
        getOverrideRow(args.year_month),
        getMonthlySummary({ month: args.year_month }),
      ]);
      // 補正適用済み実績 (override があれば上書きして利益を再計算)
      const revenue = Number(summary.revenue_total);
      const cogsVariable = Number(summary.variable_cost_total);
      const cogsFixed = override?.cogs_fixed_actual ?? Number(summary.fixed_cost_total);
      const sga = override?.sga_actual ?? Number(summary.sga_total);
      const marginalProfit = revenue - cogsVariable;
      const grossProfit = marginalProfit - cogsFixed;
      const operatingProfit = grossProfit - sga;
      const actual = {
        revenue,
        cogs_fixed: cogsFixed,
        cogs_variable: cogsVariable,
        sga,
        marginal_profit: marginalProfit,
        gross_profit: grossProfit,
        operating_profit: operatingProfit,
      };
      const variance = {
        revenue: varianceOf(revenue, budget?.revenue ?? null, 'higher_better'),
        cogs_fixed: varianceOf(cogsFixed, budget?.cogs_fixed ?? null, 'lower_better'),
        cogs_variable: varianceOf(cogsVariable, budget?.cogs_variable ?? null, 'lower_better'),
        sga: varianceOf(sga, budget?.sga ?? null, 'lower_better'),
        operating_profit: varianceOf(operatingProfit, budget?.operating_profit ?? null, 'higher_better'),
      };
      return ok({
        year_month: args.year_month,
        budget,
        actual,
        variance,
        has_override: !!override,
        override_note: override?.note ?? null,
      });
    }),
  );
}
