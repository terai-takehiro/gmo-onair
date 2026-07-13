import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryAll } from '../../../shared/db/connection';
import { ok, runTool } from '../helpers';

// ユーザー (担当者) 解決用の MCP ツール。
// create_project.assigned_to / create_activity_log.user_id / create_task.assigned_to の
// 「担当者名 → users.id」解決に使う。秘匿列 (パスワードハッシュ等) は返さない。

export function registerUserTools(server: McpServer): void {
  server.registerTool(
    'list_users',
    {
      title: 'ユーザー一覧',
      description:
        'ONAiR のユーザー (社内メンバー) を一覧する。担当者名やメールアドレスから users.id を解決する用途 ' +
        '(create_project の assigned_to / create_activity_log の user_id / create_task の assigned_to に使う)。',
      inputSchema: {
        search: z.string().max(100).optional().describe('名前 / メールアドレスの部分一致'),
      },
    },
    async (args) => runTool(async () => {
      let where = 'WHERE deleted_at IS NULL';
      const params: unknown[] = [];
      if (args.search) {
        where += ' AND (name ILIKE ? OR email ILIKE ?)';
        params.push(`%${args.search}%`, `%${args.search}%`);
      }
      const rows = await queryAll(
        `SELECT id, name, email, role, status FROM users ${where} ORDER BY name LIMIT 100`,
        params,
      );
      return ok(rows);
    }),
  );
}
