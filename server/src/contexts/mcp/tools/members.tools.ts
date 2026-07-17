import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { projectMembersService } from '../../sales/services/project-members.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';

// プロジェクト担当メンバー (複数担当・外部の方対応) の MCP ツール — projectMembersService を再利用。

export function registerMemberTools(server: McpServer): void {
  server.registerTool(
    'list_project_members',
    {
      title: 'プロジェクト担当メンバー一覧',
      description: '案件の担当メンバー (複数担当・外部の方含む) を一覧する。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
      },
    },
    async (args) => runTool(async () => {
      const members = await projectMembersService.list(args.project_id);
      return ok(members);
    }),
  );

  server.registerTool(
    'add_project_member',
    {
      title: 'プロジェクト担当メンバー追加',
      description:
        '案件に担当メンバーを追加する。登録ユーザーなら user_id (list_users で解決) を渡す。' +
        '外部の方 (users に居ない) なら member_name に氏名を渡し is_external=true。' +
        '同じ登録ユーザーが既に担当なら重複せず既存を返す (冪等)。role は役割 (PM/制作/営業/外部 等・任意)。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        user_id: z.string().optional().describe('登録ユーザーの users.id (外部の方は省略)'),
        member_name: z.string().optional().describe('外部の方の氏名 (user_id 省略時は必須)'),
        role: z.string().optional().describe('役割 (PM / 制作 / 営業 / 技術 / 外部 等・任意)'),
        is_external: z.boolean().optional().describe('外部の方フラグ (user_id 省略時は自動 true)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      if (!args.user_id && !args.member_name) {
        return ok({ added: false, error: 'user_id か member_name のいずれかが必要です' });
      }
      const member = await projectMembersService.add(
        args.project_id,
        {
          user_id: args.user_id ?? null,
          member_name: args.member_name ?? null,
          role: args.role ?? null,
          is_external: args.is_external,
        },
        currentActorId(),
      );
      audit('add_project_member', args, { member_id: member.id, project_id: args.project_id, member_name: member.member_name }, args.requested_by);
      return ok({ added: true, member });
    }),
  );

  server.registerTool(
    'remove_project_member',
    {
      title: 'プロジェクト担当メンバー削除',
      description: '案件の担当メンバーを外す (soft delete)。id は list_project_members で取得。',
      inputSchema: {
        id: z.string().min(1).describe('担当メンバー ID'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      await projectMembersService.remove(args.id, currentActorId());
      audit('remove_project_member', args, { removed_id: args.id }, args.requested_by);
      return ok({ removed: true, id: args.id });
    }),
  );
}
