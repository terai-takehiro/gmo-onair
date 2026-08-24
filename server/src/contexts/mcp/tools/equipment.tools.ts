import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { itemService } from '../../equipment/services/item.service';
import { lendingService } from '../../equipment/services/lending.service';
import { inventoryService } from '../../equipment/services/inventory.service';
import { queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { ok, runTool, clampLimit, audit, REQUESTED_BY, currentActorId } from '../helpers';

// 機材管理 (equipment) の MCP ツール — itemService / lendingService / inventoryService を再利用。
// UI と同じ絞り込み・書き込みロジックを通るため、画面と同じ結果・同じ副作用になる。
//
// 書き込みは貸出・返却の2本だけ (v4 大: MCP 対応)。機材台帳そのもの (create/update/delete) は
// 対象外 — EQ コード発番・親子設置場所継承など台帳側の作り込みが深く、まず現場で頻度の高い
// 「この機材どこ？」「貸し出して」「返ってきた」を通す MVP スコープにしている。
// 台帳の登録・編集は引き続き画面から行う。
//
// ⚠️ 貸出/返却の権限は HTTP 側 (`equipment.routes.ts`) の `router.use(requirePermission('equipment'))`
// = reader 相当のままだが (個別ルートに上書き無し)、MCP 側は他カテゴリの書き込みツールと揃えて
// 意図的に editor 以上を要求する (`gate.ts` の型が reader を受けないこともあり、OAuth という
// 新しい入口を HTTP より緩くしないため)。HTTP 側の reader 許可を緩いとみなして絞るかどうかは
// 別判断 — ここでは MCP 側だけを厳しくする。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EQUIPMENT_STATUSES = ['active', 'in_repair', 'retired', 'disposed', 'lost', 'inactive'] as const;
const EQUIPMENT_SECTIONS = ['equipment', 'rental'] as const;
const EQUIPMENT_TYPE_CODES = ['V', 'C', 'A', 'IC', 'NW', 'L', 'XR', 'E'] as const;
const LENDING_STATUSES = ['lent', 'planned', 'returned', 'overdue', 'lost'] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** eq_code (機材ID・例 Y-C-00001) か equipment_id (UUID) から機材の内部 id を解決する */
async function resolveEquipmentId(args: { eq_code?: string; equipment_id?: string }): Promise<string> {
  if (args.equipment_id) return args.equipment_id;
  if (args.eq_code) {
    const row = (await queryOne(
      'SELECT id FROM equipment_items WHERE eq_code = $1 AND deleted_at IS NULL',
      [args.eq_code],
    )) as { id: string } | null;
    if (!row) throw new AppError(404, 'NOT_FOUND', `機材ID '${args.eq_code}' が見つかりません`);
    return row.id;
  }
  throw new AppError(400, 'BAD_REQUEST', 'eq_code か equipment_id のどちらかを指定してください');
}

export function registerEquipmentTools(server: McpServer): void {
  // ── read ────────────────────────────────────────────────
  server.registerTool(
    'list_equipment',
    {
      title: '機材台帳の検索・一覧',
      description:
        '機材台帳を検索する。search は機材ID (eq_code)・型名・製造番号・機材名の部分一致 ' +
        '(ハイフン・全角半角の違いは吸収する)。既定では子機材 (付属品) を含まない一覧。' +
        '貸出可の機材は current_lending に現在の貸出状況 (借用者・案件・返却予定日) が付く。',
      inputSchema: {
        search: z.string().max(100).optional(),
        status: z.enum(EQUIPMENT_STATUSES).optional(),
        equipment_section: z.enum(EQUIPMENT_SECTIONS).optional().describe('equipment=常設 / rental=貸出機材'),
        equipment_type_code: z.enum(EQUIPMENT_TYPE_CODES).optional()
          .describe('V=映像 C=ケーブル A=音声 IC=インカム NW=ネットワーク L=照明 XR=XR E=その他'),
        include_children: z.boolean().optional().describe('付属品 (子機材) も含める。既定 false'),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => runTool(async () => {
      const limit = clampLimit(args.limit);
      const page = Math.max(1, args.page ?? 1);
      const { rows, total } = await itemService.list({
        search: args.search,
        status: args.status,
        equipment_section: args.equipment_section,
        equipment_type_code: args.equipment_type_code,
        include_children: args.include_children ? '1' : undefined,
        limit,
        offset: (page - 1) * limit,
      });
      return ok({ items: rows, page, limit, total, totalPages: Math.ceil(total / limit) });
    }),
  );

  server.registerTool(
    'get_equipment',
    {
      title: '機材の詳細',
      description:
        '機材 1 点の詳細 (設置場所・保証期限・貸出履歴20件・メンテナンス履歴20件・付属品・親機材) を返す。' +
        'eq_code (機材ID・例 Y-C-00001) か equipment_id (内部id) で指定する。',
      inputSchema: {
        eq_code: z.string().optional().describe('機材ID (例 Y-C-00001)'),
        equipment_id: z.string().optional().describe('機材の内部 id (eq_code の代わりに指定可)'),
      },
    },
    async (args) => runTool(async () => {
      const id = await resolveEquipmentId(args);
      return ok(await itemService.getById(id));
    }),
  );

  server.registerTool(
    'list_equipment_lendings',
    {
      title: '機材の貸出・返却履歴',
      description:
        '機材の貸出記録を一覧する (新しい貸出順)。status=lent で貸出中、planned で出庫予定、' +
        'returned で返却済みのみに絞れる。eq_code / equipment_id で特定機材の履歴だけにできる。',
      inputSchema: {
        status: z.enum(LENDING_STATUSES).optional(),
        eq_code: z.string().optional(),
        equipment_id: z.string().optional(),
        project_id: z.string().optional().describe('案件 id で絞り込み'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => runTool(async () => {
      const equipment_id = args.eq_code || args.equipment_id
        ? await resolveEquipmentId(args)
        : undefined;
      const rows = await lendingService.list({
        status: args.status,
        equipment_id,
        project_id: args.project_id,
      });
      const limit = clampLimit(args.limit);
      return ok({ total: rows.length, lendings: rows.slice(0, limit) });
    }),
  );

  server.registerTool(
    'list_inventory_checks',
    {
      title: '棚卸しの一覧',
      description: '棚卸し (実施回) の一覧を実施日の新しい順に返す。status (draft/in_progress/completed) を含む。',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => runTool(async () => {
      const rows = await inventoryService.list();
      const limit = clampLimit(args.limit);
      return ok({ total: rows.length, checks: rows.slice(0, limit) });
    }),
  );

  server.registerTool(
    'get_inventory_check',
    {
      title: '棚卸し1回分の状況',
      description:
        '棚卸し1回分の詳細 (対象機材ごとの found=確認済み/×=見つからない/未確認・実際の設置場所・状態) を返す。' +
        'check_id (list_inventory_checks の id) を指定する。',
      inputSchema: {
        check_id: z.string(),
      },
    },
    async (args) => runTool(async () => ok(await inventoryService.getById(args.check_id))),
  );

  // ── write ───────────────────────────────────────────────
  server.registerTool(
    'lend_equipment',
    {
      title: '機材の貸出',
      description:
        '機材を貸し出す (現場での持ち出し登録)。eq_code か equipment_id と borrower_name (借用者) は必須。' +
        '既に貸出中の機材はエラーになる (先に return_equipment が必要)。' +
        'planned_out_date を渡すと「出庫予定」の行になり、まだ持ち出していない扱いになる ' +
        '(その場で持ち出したときは渡さない)。機材管理 (equipment) の editor 以上が必要。',
      inputSchema: {
        eq_code: z.string().optional().describe('機材ID (例 Y-C-00001)'),
        equipment_id: z.string().optional(),
        borrower_name: z.string().min(1).describe('借用者 (氏名または会社名)'),
        project_id: z.string().optional().describe('紐づける案件 id (任意)'),
        purpose: z.string().optional().describe('利用目的'),
        lent_at: z.string().regex(DATE_RE).optional().describe('貸出日 YYYY-MM-DD (既定は今日)'),
        due_date: z.string().regex(DATE_RE).optional().describe('返却予定日'),
        condition_out: z.string().optional().describe('持ち出し時の状態メモ'),
        notes: z.string().optional(),
        planned_out_date: z.string().regex(DATE_RE).optional()
          .describe('出庫予定日。渡すと「予定」の行になりまだ持ち出していない扱い'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const equipment_id = await resolveEquipmentId(args);
      const result = await lendingService.create(
        {
          equipment_id,
          project_id: args.project_id ?? null,
          borrower_name: args.borrower_name,
          purpose: args.purpose ?? null,
          lent_at: args.lent_at ?? today(),
          due_date: args.due_date ?? null,
          condition_out: args.condition_out ?? null,
          notes: args.notes ?? null,
          planned_out_date: args.planned_out_date ?? null,
        },
        currentActorId(),
      );
      audit('lend_equipment',
        { eq_code: args.eq_code, equipment_id, borrower_name: args.borrower_name, due_date: args.due_date },
        { lending_id: result.id, equipment_id, planned: !!args.planned_out_date }, args.requested_by);
      return ok({ lent: true, lending_id: result.id, equipment_id, planned: !!args.planned_out_date });
    }),
  );

  server.registerTool(
    'return_equipment',
    {
      title: '機材の返却',
      description:
        '貸出中の機材を返却する。eq_code か equipment_id で指定する (貸出記録 id ではない)。' +
        '貸出中でない機材はエラーになる。機材管理 (equipment) の editor 以上が必要。',
      inputSchema: {
        eq_code: z.string().optional().describe('機材ID (例 Y-C-00001)'),
        equipment_id: z.string().optional(),
        condition_in: z.string().optional().describe('返却時の状態メモ'),
        notes: z.string().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const equipment_id = await resolveEquipmentId(args);
      const active = (await queryOne(
        `SELECT id FROM equipment_lendings WHERE equipment_id = $1 AND status = 'lent'`,
        [equipment_id],
      )) as { id: string } | null;
      if (!active) throw new AppError(400, 'NOT_LENT', 'この機材は貸出中ではありません');
      await lendingService.returnLending(
        active.id,
        { condition_in: args.condition_in ?? null, notes: args.notes ?? null },
        currentActorId(),
      );
      audit('return_equipment',
        { eq_code: args.eq_code, equipment_id, condition_in: args.condition_in },
        { lending_id: active.id, equipment_id }, args.requested_by);
      return ok({ returned: true, lending_id: active.id, equipment_id });
    }),
  );
}
