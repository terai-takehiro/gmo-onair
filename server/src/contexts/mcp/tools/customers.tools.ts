import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { config } from '../../../config';
import { ok, runTool, clampLimit, pagination, audit, REQUESTED_BY } from '../helpers';

// 顧客 (customers) の MCP ツール。
// ルート (customers.routes.ts) は inline SQL のため、同形のクエリをここに持つ。
// create は重複ガード付き (同名/類似があれば作成せず候補を返す)。

const CUSTOMER_COLS = 'id, name, short_name, contact_name, email, phone, address, notes, created_at';

export function registerCustomerTools(server: McpServer): void {
  server.registerTool(
    'list_customers',
    {
      title: '顧客一覧',
      description: '顧客を検索・一覧する。案件登録前の customer_id 解決に使う (name / short_name の部分一致)。',
      inputSchema: {
        search: z.string().max(100).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async (args) => runTool(async () => {
      let where = 'WHERE deleted_at IS NULL';
      const params: unknown[] = [];
      if (args.search) {
        where += ' AND (name ILIKE ? OR short_name ILIKE ?)';
        params.push(`%${args.search}%`, `%${args.search}%`);
      }
      const limit = clampLimit(args.limit);
      const page = args.page ?? 1;
      const totalRow = await queryOne(`SELECT COUNT(*) as c FROM customers ${where}`, params) as any;
      const rows = await queryAll(
        `SELECT ${CUSTOMER_COLS} FROM customers ${where} ORDER BY name LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );
      return ok({ data: rows, pagination: pagination(page, limit, Number(totalRow?.c ?? 0)) });
    }),
  );

  server.registerTool(
    'get_customer',
    {
      title: '顧客詳細',
      description: '顧客の詳細と、その顧客の直近の案件 (最大10件) を取得する。',
      inputSchema: {
        id: z.string().min(1),
        include_recent_projects: z.boolean().default(true),
      },
    },
    async (args) => runTool(async () => {
      const customer = await queryOne(
        `SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ? AND deleted_at IS NULL`, [args.id],
      ) as any;
      if (!customer) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');
      if (args.include_recent_projects !== false) {
        customer.recent_projects = await queryAll(
          `SELECT id, code, gls_number, name, stage, expected_amount, event_start
           FROM projects WHERE customer_id = ? AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 10`,
          [args.id],
        );
      }
      return ok(customer);
    }),
  );

  server.registerTool(
    'create_customer',
    {
      title: '顧客登録',
      description:
        '顧客を新規登録する。同名・類似名の既存顧客がある場合は作成せず候補一覧を返す (重複ガード) — ' +
        '既存顧客に該当するならその id を使い、別会社であることを確認できた場合のみ allow_duplicate: true で再実行する。',
      inputSchema: {
        name: z.string().min(1).describe('顧客名 (正式名称)'),
        allow_duplicate: z.boolean().default(false).describe('類似候補を確認済みのときのみ true'),
        short_name: z.string().optional().describe('略称'),
        contact_name: z.string().optional().describe('担当者名'),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        notes: z.string().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const hits = await queryAll(
        `SELECT id, name, short_name, contact_name, email FROM customers
         WHERE deleted_at IS NULL AND (name = ? OR name ILIKE ? OR short_name ILIKE ?)
         ORDER BY (name = ?) DESC, name LIMIT 10`,
        [args.name, `%${args.name}%`, `%${args.name}%`, args.name],
      );
      if (hits.length > 0 && args.allow_duplicate !== true) {
        return ok({
          created: false,
          possible_duplicates: hits,
          next_step: '既存顧客に該当するならその id を使用。別会社であることを確認したら allow_duplicate: true で再実行',
        });
      }

      const id = uuidv4();
      await execute(
        `INSERT INTO customers (id, name, short_name, contact_name, email, phone, address, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, args.name, args.short_name || null, args.contact_name || null, args.email || null,
         args.phone || null, args.address || null, args.notes || null, config.mcpActorId],
      );
      const row = await queryOne(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ?`, [id]);
      audit('create_customer', args, { created_id: id, name: args.name }, args.requested_by);
      return ok({ created: true, customer: row });
    }),
  );

  server.registerTool(
    'update_customer',
    {
      title: '顧客更新',
      description: '顧客情報を部分更新する。渡したフィールドだけが変更される (サーバー側で既存値とマージ)。',
      inputSchema: {
        id: z.string().min(1),
        name: z.string().min(1).optional(),
        short_name: z.string().nullable().optional(),
        contact_name: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const existing = await queryOne(
        `SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ? AND deleted_at IS NULL`, [args.id],
      ) as any;
      if (!existing) throw new AppError(404, 'NOT_FOUND', '顧客が見つかりません');

      // read-merge-write (PUT は全上書きのため、渡されたフィールドだけ差し替える)
      const fields = ['name', 'short_name', 'contact_name', 'email', 'phone', 'address', 'notes'] as const;
      const merged: Record<string, unknown> = {};
      for (const f of fields) {
        const argVal = (args as Record<string, unknown>)[f];
        merged[f] = argVal !== undefined ? argVal : existing[f];
      }
      await execute(
        `UPDATE customers SET name=?, short_name=?, contact_name=?, email=?, phone=?, address=?, notes=?,
         updated_at=NOW(), updated_by=? WHERE id=?`,
        [merged.name, merged.short_name, merged.contact_name, merged.email, merged.phone,
         merged.address, merged.notes, config.mcpActorId, args.id],
      );
      const row = await queryOne(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ?`, [args.id]);
      const changedFields = Object.keys(args).filter((k) => !['id', 'requested_by'].includes(k));
      audit('update_customer', args, { updated_id: args.id, changed_fields: changedFields }, args.requested_by);
      return ok({ updated: true, changed_fields: changedFields, customer: row });
    }),
  );
}
