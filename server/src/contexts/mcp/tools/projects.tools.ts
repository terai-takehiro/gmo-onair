import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { projectService } from '../../sales/services/project.service';
import { ok, runTool, clampLimit, pagination } from '../helpers';

// 案件管理 (sales) の MCP ツール — 既存の projectService を再利用 (読み取り専用)

const STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed', 'e_lost'] as const;

/** 一覧の返却行を要約列に絞る (p.* は列が多くコンテキストを圧迫するため) */
function trimProjectRow(row: any) {
  return {
    id: row.id,
    code: row.code,
    gls_number: row.gls_number,
    gls_category: row.gls_category,
    name: row.name,
    customer_name: row.customer_name,
    stage: row.stage,
    project_type: row.project_type,
    expected_amount: row.expected_amount,
    event_start: row.event_start,
    event_end: row.event_end,
    assigned_to_name: row.assigned_to_name,
    tags: row.tags,
    total_revenue: row.total_revenue,
    total_purchase: row.total_purchase,
    created_at: row.created_at,
  };
}

export function registerProjectTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      title: '案件一覧',
      description:
        '案件 (プロジェクト) を検索・一覧する。stage: neta=ネタ, d_hold=仮押さえ, c_proposal=見積提案, b_verbal=口頭決定, a_won=受注済, s_completed=案件終了, e_lost=失注。' +
        'tab: yomi=GLS未発番のヨミ案件, active=GLS発番済で進行中, completed=完了, lost=失注。' +
        'search 指定時は開催期間フィルタ (event_month/event_from/event_to) は無視され全期間から検索される。',
      inputSchema: {
        search: z.string().max(100).optional().describe('案件名 / 案件コード / GLS番号 / 顧客名の部分一致検索'),
        stage: z.enum(STAGES).optional(),
        tab: z.enum(['all', 'yomi', 'active', 'completed', 'lost']).optional(),
        gls_category: z.enum(['A', 'B']).optional().describe('A=スタジオ案件 / B=ビジネス案件 (GLS発番済のみ)'),
        tag: z.string().optional(),
        event_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('開催月 (YYYY-MM)。イベント期間がこの月に重なる案件'),
        event_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('開催期間レンジ開始 (YYYY-MM-DD)。event_to とセットで指定'),
        event_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        sort_by: z.string().optional().describe('並び替えキー (未指定 = おすすめ順: 進行中優先 + イベント日近い順)'),
        sort_dir: z.enum(['asc', 'desc']).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async (args) => runTool(async () => {
      const limit = clampLimit(args.limit);
      const page = args.page ?? 1;
      const { rows, total } = await projectService.list(
        {
          search: args.search,
          stage: args.stage,
          tab: args.tab,
          tag: args.tag,
          glsCategory: args.gls_category,
          eventMonth: args.event_month,
          eventFrom: args.event_from,
          eventTo: args.event_to,
          sortBy: args.sort_by,
          sortDir: args.sort_dir,
        },
        page, limit, (page - 1) * limit,
      );
      return ok({ data: (rows as any[]).map(trimProjectRow), pagination: pagination(page, limit, Number(total)) });
    }),
  );

  server.registerTool(
    'get_project',
    {
      title: '案件詳細',
      description: '案件の詳細情報 (全フィールド + 仮スケジュール日程) と収支サマリー (売上 / 仕入 / 粗利 / 粗利率) を取得する。',
      inputSchema: {
        id: z.string().min(1).describe('案件 ID (list_projects で取得)'),
      },
    },
    async (args) => runTool(async () => {
      const [project, summary] = await Promise.all([
        projectService.getById(args.id),
        projectService.getSummary(args.id),
      ]);
      return ok({ ...(project as Record<string, unknown>), summary });
    }),
  );
}
