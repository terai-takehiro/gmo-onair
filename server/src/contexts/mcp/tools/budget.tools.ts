import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { keepReportService } from '../../sales/services/keep-report.service';
import { ok, runTool, audit, REQUESTED_BY } from '../helpers';

// 隔週キープ資料 Phase 2: 月次予算 (monthly_budgets) + 実績補正 (monthly_actual_overrides)。
// 損益ページの「目標」列と、固定原価 (FIXED-COGS 償却) が ONAiR 未計上の月の経理確定値補完を担う。
// get_monthly_pl が損益ページの単一入口 — 目標 / 補正込み実績 / 対目標差・判定 (○/✕) を一括で返す。
// ロジックは keepReportService に集約 — UI (お金のルール・隔週キープの数字) と同一コードパス。
//
// 事業主体 (migration 282/283): 予算・補正は (年月 × 主体) の行。省略時は gss (GMOサムライスタジオ)。
// 損益は 'all' (主体の合計・既定) か主体1つ。

const YM_RE = /^\d{4}-\d{2}$/;

const ENTITY = z.enum(['gss', 'gscs', 'gig']);
const ENTITY_DESC = '事業主体 (gss=GMOサムライスタジオ / gscs=GMOサムライコンテンツスタジオ / gig=GMOインターネットグループ)。省略時は gss';

export function registerBudgetTools(server: McpServer): void {
  server.registerTool(
    'get_monthly_budget',
    {
      title: '月次予算の取得',
      description: '月次予算 (売上 / 固定原価 / 変動原価 / 販管費 / 営業利益の目標値) を主体別に取得する。未登録なら found=false。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
        entity: ENTITY.optional().describe(ENTITY_DESC),
      },
    },
    async (args) => runTool(async () => {
      const entity = args.entity ?? 'gss';
      const budget = await keepReportService.getBudget(args.year_month, entity);
      return ok(budget ? { found: true, budget } : { found: false, year_month: args.year_month, entity });
    }),
  );

  server.registerTool(
    'upsert_monthly_budget',
    {
      title: '月次予算の登録/更新',
      description:
        '月次予算を主体別に登録/更新する。**渡したフィールドだけ更新** (未指定は既存値を保持)。金額は円・税抜。' +
        'operating_profit 未指定のときは、マージ後の 売上 − 固定原価 − 変動原価 − 販管費 で自動計算する (構成要素が揃っている場合のみ)。' +
        '全体 (統合) の目標は主体の合計なので、全体の値をここに入れない。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
        entity: ENTITY.optional().describe(ENTITY_DESC),
        revenue: z.number().int().optional().describe('売上目標 (円)'),
        cogs_fixed: z.number().int().optional().describe('固定原価 (償却) 目標'),
        cogs_variable: z.number().int().optional().describe('変動原価目標'),
        sga: z.number().int().optional().describe('販管費目標'),
        operating_profit: z.number().int().optional().describe('営業利益目標 (未指定は自動計算)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const entity = args.entity ?? 'gss';
      const { action, budget } = await keepReportService.upsertBudget(args.year_month, {
        revenue: args.revenue, cogs_fixed: args.cogs_fixed, cogs_variable: args.cogs_variable,
        sga: args.sga, operating_profit: args.operating_profit,
      }, entity);
      audit('upsert_monthly_budget', { ...budget },
        { year_month: args.year_month, entity, action }, args.requested_by);
      return ok({ [action]: true, action, budget });
    }),
  );

  server.registerTool(
    'upsert_monthly_actual_override',
    {
      title: '月次実績補正の登録/更新',
      description:
        'get_monthly_summary の自動集計値を経理確定値で上書きするための補正を主体別に登録する。**渡したフィールドだけ更新**。' +
        '用途: 固定原価 (FIXED-COGS 償却) が ONAiR に未計上の月の補完、販管費の経理確定値反映。' +
        '補正は get_monthly_pl の actual に反映され、has_override=true で注記できる。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
        entity: ENTITY.optional().describe(ENTITY_DESC),
        cogs_fixed_actual: z.number().int().optional().describe('償却費の経理確定値 (円)'),
        sga_actual: z.number().int().optional().describe('販管費の経理確定値 (円)'),
        note: z.string().max(200).optional().describe('「償却再計上」等の注記'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const entity = args.entity ?? 'gss';
      const { action, override } = await keepReportService.upsertOverride(args.year_month, {
        cogs_fixed_actual: args.cogs_fixed_actual, sga_actual: args.sga_actual, note: args.note,
      }, entity);
      audit('upsert_monthly_actual_override', { ...override },
        { year_month: args.year_month, entity, action }, args.requested_by);
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
        '判定: 売上・利益系は 実績≧目標 → ○、費用系は 実績≦目標 → ○。目標未登録の月は判定 "-" (翌月見込みページ用)。' +
        '対目標比: 目標が赤字の行は 100 − (目標 − 実績) ÷ |目標| × 100 (9/4 の資料の式)。' +
        'entity で主体を絞れる (all=主体の合計・既定。全体の予算は主体の合計)。',
      inputSchema: {
        year_month: z.string().regex(YM_RE).describe('対象年月 YYYY-MM'),
        entity: z.enum(['all', 'gss', 'gscs', 'gig']).optional()
          .describe('事業主体 (all=全体=主体の合計 / gss / gscs / gig)。省略時は all'),
      },
    },
    async (args) => runTool(async () => {
      const { override: _override, overrides: _overrides, ...pl } = await keepReportService.getMonthlyPl(args.year_month, args.entity ?? 'all');
      return ok(pl);
    }),
  );
}
