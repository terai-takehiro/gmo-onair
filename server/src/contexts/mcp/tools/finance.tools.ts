import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryAll, queryOne } from '../../../shared/db/connection';
import { getMonthlySummary } from '../../finance/services/monthly-summary.service';
import {
  buildRevenueWhere, buildRevenueOrder,
  buildPurchaseWhere, buildPurchaseOrder,
  buildSgaWhere, buildSgaOrder,
} from '../../finance/list-query';
import { ok, runTool, clampLimit, pagination } from '../helpers';

// 財務管理 (finance) の MCP ツール — 読み取り専用。
// 絞り込み/並び替えは既存の list-query.ts ビルダーを再利用し、UI の一覧と同一条件を保証する。

/** list-query の builder は Express の req.query 形を受けるため、文字列 Record に詰め替えて渡す */
function toQuery(obj: Record<string, string | undefined>): any {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v !== '') q[k] = v;
  }
  return q;
}

const RECOGNITION_FILTERS = {
  recognition_month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('計上月 (YYYY-MM)'),
  recognition_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('計上日レンジ開始 (YYYY-MM-DD)'),
  recognition_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('計上日レンジ終了 (YYYY-MM-DD)'),
};

const PAGING = {
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
};

export function registerFinanceTools(server: McpServer): void {
  server.registerTool(
    'get_monthly_summary',
    {
      title: '月次損益サマリー',
      description:
        '財務ダッシュボードと同じ月次/期間の損益サマリーを取得する。month (単月) か from/to (期間) のどちらかが必須。' +
        '返却: 売上 / 仕入合計 / 固定原価 / 変動原価 / 限界利益(売上−変動原価) / 売上総利益(限界利益−固定原価) / 販管費 / 営業利益(売上総利益−販管費)。' +
        'project_id 指定時は案件別集計 (按分配分込み、販管費は案件に紐づかないため 0)。',
      inputSchema: {
        month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('対象月 (YYYY-MM)'),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('期間開始 (YYYY-MM-DD)。to とセットで指定 (month より優先)'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        project_id: z.string().optional().describe('案件 ID で絞り込み (任意)'),
      },
    },
    async (args) => runTool(async () => {
      const data = await getMonthlySummary({
        month: args.month,
        from: args.from,
        to: args.to,
        projectId: args.project_id,
      });
      return ok(data);
    }),
  );

  server.registerTool(
    'list_revenues',
    {
      title: '売上一覧',
      description:
        '売上を一覧する。status: confirmed=確定売上 / estimate=概算見積 (project_id 未指定かつ status 未指定のときは confirmed のみ)。' +
        'tax_category: tax10=10%課税 / tax8=8%課税 / exempt=非課税。金額 (amount) は税抜。',
      inputSchema: {
        search: z.string().max(100).optional().describe('請求キー / 備考の部分一致検索'),
        project_id: z.string().optional().describe('案件 ID (按分配分された売上も含む)'),
        status: z.enum(['confirmed', 'estimate']).optional(),
        ...RECOGNITION_FILTERS,
        sort: z.string().optional().describe('並び替え (例 amount_desc / recognition_desc / gls_asc。未指定=GLS昇順→金額降順)'),
        ...PAGING,
      },
    },
    async (args) => runTool(async () => {
      const q = toQuery({
        search: args.search,
        project_id: args.project_id,
        status: args.status,
        recognition_month: args.recognition_month,
        recognition_from: args.recognition_from,
        recognition_to: args.recognition_to,
        sort: args.sort,
      });
      const { where, params } = buildRevenueWhere(q);
      const orderBy = buildRevenueOrder(q);
      const joins = `FROM revenues r
         LEFT JOIN projects p ON p.id = r.project_id
         LEFT JOIN customers c ON c.id = r.customer_id`;
      const limit = clampLimit(args.limit);
      const page = args.page ?? 1;
      const totalRow = await queryOne(`SELECT COUNT(*) as c ${joins} ${where}`, params) as any;
      const rows = await queryAll(
        `SELECT r.id, r.billing_key, r.subtitle, r.amount, r.tax_category, r.status,
                r.recognition_date, r.billing_date, r.payment_due_date, r.notes,
                p.gls_number, p.name AS project_name, c.name AS customer_name
         ${joins} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      return ok({ data: rows, pagination: pagination(page, limit, Number(totalRow?.c ?? 0)) });
    }),
  );

  server.registerTool(
    'list_purchases',
    {
      title: '仕入一覧',
      description:
        '仕入 (変動原価/固定原価) を一覧する。fixed_cost: "1"=固定原価Pj (FIXED-COGS) のみ / "0"=固定原価を除く。' +
        'is_provisional=true は仮 (見込み) 仕入。金額 (amount) は税抜。',
      inputSchema: {
        search: z.string().max(100).optional().describe('説明 / 仕入先名 / GLS番号の部分一致検索'),
        project_id: z.string().optional().describe('案件 ID (按分配分された仕入も含む)'),
        group_id: z.string().optional().describe('費用按分グループ ID'),
        fixed_cost: z.enum(['1', '0']).optional(),
        ...RECOGNITION_FILTERS,
        sort: z.string().optional().describe('並び替え (例 amount_desc / recognition_desc / vendor_asc。未指定=GLS昇順→金額降順)'),
        ...PAGING,
      },
    },
    async (args) => runTool(async () => {
      const q = toQuery({
        search: args.search,
        project_id: args.project_id,
        group_id: args.group_id,
        fixed_cost: args.fixed_cost,
        recognition_month: args.recognition_month,
        recognition_from: args.recognition_from,
        recognition_to: args.recognition_to,
        sort: args.sort,
      });
      const { where, params } = buildPurchaseWhere(q);
      const orderBy = buildPurchaseOrder(q);
      const joins = `FROM purchases pu
         LEFT JOIN projects p ON p.id = pu.project_id
         LEFT JOIN vendors v ON v.id = pu.vendor_id`;
      const limit = clampLimit(args.limit);
      const page = args.page ?? 1;
      const totalRow = await queryOne(`SELECT COUNT(*) as c ${joins} ${where}`, params) as any;
      const rows = await queryAll(
        `SELECT pu.id, pu.description, pu.amount, pu.tax_category, pu.recognition_date,
                pu.payment_due_date, pu.settlement_number, pu.invoice_qualified, pu.is_provisional,
                v.name AS vendor_name, p.gls_number, p.name AS project_name
         ${joins} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      return ok({ data: rows, pagination: pagination(page, limit, Number(totalRow?.c ?? 0)) });
    }),
  );

  server.registerTool(
    'list_sga',
    {
      title: '販管費一覧',
      description:
        '販管費 (SGA) を一覧する。source: staff=人件費 (社員入力) / accounting=経理 (決算取込等)。案件には紐づかない全社費用。金額 (amount) は税抜。',
      inputSchema: {
        search: z.string().max(100).optional().describe('支払先名 / 説明の部分一致検索'),
        source: z.enum(['staff', 'accounting']).optional(),
        ...RECOGNITION_FILTERS,
        sort: z.string().optional().describe('並び替え (例 amount_desc / recognition_desc / vendor_asc。未指定=金額降順)'),
        ...PAGING,
      },
    },
    async (args) => runTool(async () => {
      const q = toQuery({
        search: args.search,
        source: args.source,
        recognition_month: args.recognition_month,
        recognition_from: args.recognition_from,
        recognition_to: args.recognition_to,
        sort: args.sort,
      });
      const { where, params } = buildSgaWhere(q);
      const orderBy = buildSgaOrder(q);
      const limit = clampLimit(args.limit);
      const page = args.page ?? 1;
      const totalRow = await queryOne(`SELECT COUNT(*) as c FROM sga_expenses s ${where}`, params) as any;
      const rows = await queryAll(
        `SELECT s.id, s.billing_key, s.vendor_name, s.description, s.amount, s.expense_type,
                s.tax_category, s.recognition_date, s.payment_due_date, s.settlement_method, s.source
         FROM sga_expenses s ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      return ok({ data: rows, pagination: pagination(page, limit, Number(totalRow?.c ?? 0)) });
    }),
  );
}
