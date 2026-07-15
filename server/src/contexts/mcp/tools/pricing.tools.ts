import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { ok, runTool, audit, REQUESTED_BY } from '../helpers';

// 料金表 (pricing_categories / pricing_items) と 見積シミュレーション (simulations) の MCP ツール。
// - list_pricing: 料金表マスタの参照 (見積を組む前に pricing_item_id と calc_type を調べる)
// - get_project_simulation: 案件の現在の見積
// - set_project_simulation: 料金表から見積を組んで案件に設定 (expected_amount 自動更新)
//
// subtotal はサーバー側で calc_type から算出する (client の SimulationDialog.calcSubtotal と一致)。
// 書き込みは UI ルート (PUT /projects/:id/simulation) と同じ SQL を自己完結で複製 (ルート未改変)。

/** calc_type と (数量/日数/単価) から小計を算出。client SimulationDialog.calcSubtotal と同一ロジック。 */
function computeSubtotal(calcType: string, quantity: number, days: number, unitPrice: number): number {
  switch (calcType) {
    case 'days':
    case 'hours':        return days * unitPrice;       // hours は days 欄に時間数を入れる仕様
    case 'fixed':
    case 'toggle':       return unitPrice;
    case 'days_qty':
    case 'days_people':  return quantity * days * unitPrice;
    case 'qty':          return quantity * unitPrice;
    default:             return 0;
  }
}

/** customer_type に応じて 定価(unit_price) / グループ内価格(group_price) を選ぶ。client pickInitialPrice と同一。 */
function pickUnitPrice(customerType: string, item: { unit_price: number | null; group_price: number | null }): number {
  if (customerType === 'internal') return item.group_price ?? item.unit_price ?? 0;
  return item.unit_price ?? item.group_price ?? 0;
}

const SIM_SELECT = `
  SELECT s.id, s.pricing_item_id, s.quantity, s.days, s.unit_price, s.subtotal, s.status,
         pi.name as pricing_item_name, pi.sub_label, pi.calc_type,
         pc.name as category_name, pc.sort_order as category_sort_order
  FROM simulations s
  LEFT JOIN pricing_items pi ON pi.id = s.pricing_item_id
  LEFT JOIN pricing_categories pc ON pc.id = pi.category_id
  WHERE s.project_id = ?
  ORDER BY pc.sort_order, pi.sort_order`;

export function registerPricingTools(server: McpServer): void {
  server.registerTool(
    'list_pricing',
    {
      title: '料金表 (マスタ)',
      description:
        '料金表マスタをカテゴリ別に一覧する。見積を組む前に pricing_item_id と calc_type を調べる用途。' +
        'calc_type の意味: days=日数×単価 / hours=時間数×単価 (days 欄に時間数) / fixed・toggle=固定 (単価そのもの) / ' +
        'days_qty=日数×台数×単価 / days_people=日数×人数×単価 / qty=数量×単価。' +
        'unit_price=定価(社外), group_price=グループ内価格(社内・null は未設定)。案件の customer_type により自動選択される。',
      inputSchema: {
        search: z.string().max(100).optional().describe('項目名の部分一致で絞り込み'),
      },
    },
    async (args) => runTool(async () => {
      const categories = await queryAll(
        `SELECT id, name, sort_order FROM pricing_categories WHERE deleted_at IS NULL ORDER BY sort_order, created_at`,
      ) as any[];
      let itemWhere = 'WHERE deleted_at IS NULL';
      const params: unknown[] = [];
      if (args.search) { itemWhere += ' AND name ILIKE ?'; params.push(`%${args.search}%`); }
      const items = await queryAll(
        `SELECT id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order
         FROM pricing_items ${itemWhere} ORDER BY sort_order, created_at`,
        params,
      ) as any[];
      const result = categories
        .map((c) => ({ ...c, items: items.filter((it) => it.category_id === c.id) }))
        .filter((c) => !args.search || c.items.length > 0); // 検索時は該当項目のあるカテゴリのみ
      return ok(result);
    }),
  );

  server.registerTool(
    'get_project_simulation',
    {
      title: '案件の見積',
      description: '案件に設定済みの見積シミュレーション明細 (料金項目名・数量・日数・単価・小計) と合計を取得する。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
      },
    },
    async (args) => runTool(async () => {
      const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [args.project_id]);
      if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
      const items = await queryAll(SIM_SELECT, [args.project_id]) as any[];
      const total = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
      const isDraft = items.length > 0 && items.some((it) => it.status === 'draft');
      return ok({ items, total, status: isDraft ? 'draft' : 'final', is_draft: isDraft });
    }),
  );

  server.registerTool(
    'set_project_simulation',
    {
      title: '案件の見積を設定',
      description:
        '料金表の項目から案件の見積を組んで設定する。**既存の見積は全置換される**。' +
        '**既定は status=draft (AI 下書き・未確定)**: 想定金額 (expected_amount) には反映されず、担当者がアプリの案件画面で「確定する」を押すと最終化される。' +
        'AI が自動で確定させたい明確な指示があるときだけ status=final を指定する (その場合は即 expected_amount に反映)。' +
        '先に list_pricing で pricing_item_id と calc_type を確認すること。数量(quantity)/日数(days) の意味は calc_type による ' +
        '(例 days_people は 日数×人数、days は 日数のみ)。単価は案件の customer_type から自動選択されるが unit_price_override で上書き可。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        items: z.array(z.object({
          pricing_item_id: z.string().min(1),
          quantity: z.number().int().min(0).default(1).describe('台数/人数/数量 (calc_type により使用)'),
          days: z.number().int().min(0).default(1).describe('日数 or 時間数 (calc_type により使用)'),
          unit_price_override: z.number().int().min(0).optional().describe('単価を明示指定 (未指定なら料金表から自動選択)'),
        })).min(1).describe('見積明細の配列'),
        status: z.enum(['draft', 'final']).default('draft')
          .describe('draft=下書き(既定・expected_amount 未反映) / final=確定(即 expected_amount 反映)。通常は draft のままにし人間が確定する'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const project = await queryOne(
        'SELECT id, customer_type FROM projects WHERE id = ? AND deleted_at IS NULL', [args.project_id],
      ) as any;
      if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');
      const customerType = project.customer_type === 'internal' ? 'internal' : 'external';
      const status = args.status === 'final' ? 'final' : 'draft';

      // 各明細の単価・小計をサーバー側で確定
      const rows: Array<{ pricing_item_id: string; quantity: number; days: number; unit_price: number; subtotal: number; name: string }> = [];
      for (const it of args.items) {
        const item = await queryOne(
          'SELECT id, name, calc_type, unit_price, group_price FROM pricing_items WHERE id = ? AND deleted_at IS NULL',
          [it.pricing_item_id],
        ) as any;
        if (!item) throw new AppError(400, 'VALIDATION_ERROR', `料金項目が見つかりません: ${it.pricing_item_id} (list_pricing で確認してください)`);
        const quantity = it.quantity ?? 1;
        const days = it.days ?? 1;
        const unitPrice = it.unit_price_override ?? pickUnitPrice(customerType, item);
        const subtotal = computeSubtotal(item.calc_type, quantity, days, unitPrice);
        rows.push({ pricing_item_id: item.id, quantity, days, unit_price: unitPrice, subtotal, name: item.name });
      }

      // 全置換 (status タグ付き)。expected_amount は final のときだけ反映 (draft は確定済み金額に触れない)
      await execute('DELETE FROM simulations WHERE project_id = ?', [args.project_id]);
      for (const r of rows) {
        await execute(
          `INSERT INTO simulations (id, project_id, pricing_item_id, quantity, days, unit_price, subtotal, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), args.project_id, r.pricing_item_id, r.quantity, r.days, r.unit_price, r.subtotal, status],
        );
      }
      const total = rows.reduce((s, r) => s + r.subtotal, 0);
      let expectedAmountUpdated = false;
      if (status === 'final' && total > 0) {
        await execute(
          `UPDATE projects SET expected_amount = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
          [total, args.project_id],
        );
        expectedAmountUpdated = true;
      }

      audit('set_project_simulation', args, { project_id: args.project_id, item_count: rows.length, total, status }, args.requested_by);
      return ok({
        updated: true,
        status,
        customer_type: customerType,
        items: rows,
        total,
        expected_amount_updated: expectedAmountUpdated,
        ...(status === 'draft'
          ? { note: 'status=draft の下書きとして保存しました。担当者がアプリの案件画面で「確定する」を押すまで想定金額 (expected_amount) には反映されません' }
          : (total === 0 ? { note: '合計が 0 のため expected_amount は更新していません' } : {})),
      });
    }),
  );
}
