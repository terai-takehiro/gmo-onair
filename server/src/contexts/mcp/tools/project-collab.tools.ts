import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';
import {
  appendNotes, appendChecklist, getCollabForAgent,
} from '../../sales/services/project-collab-append.service';

// 案件の「みんなで書くメモ」とチェックリストに **AI が追記する** 経路 (要件 B5)。
//
// ── ここは追記専用 ─────────────────────────────────────
//
// 既存の文字を1文字も消さない。人が打っている最中でも安全に足せる代わりに、
// **書き換え・削除はできない**。人の書いた文を AI が書き換えられるようにすると、
// 「勝手に消された」が起きたときに人は二度とこの欄を信用しない。
// 直したい・消したいときは人にそう伝える (その旨をメモに追記する) こと。
//
// ── 下書きとして出す ───────────────────────────────────
//
// 足したものは提案であって決定ではない。人が残す・直す・消すのが前提で、
// 足した行には AI の印が付く。**勝手に確定させない** (要件 B5)。

export function registerProjectCollabTools(server: McpServer): void {
  server.registerTool(
    'get_project_collab',
    {
      title: '案件のメモとチェックリスト',
      description:
        '案件の「みんなで書くメモ」とチェックリストを読む。**追記する前に必ず一度読むこと** — ' +
        '同じことが既に書かれていれば足さない (重複はこの欄を読まれなくする最大の原因)。' +
        'advice には「前回まで自分が足した行が人にどう扱われたか (残った / 消された / 直された)」の傾向が入る。' +
        '**advice と kept_rate を踏まえて次の追記を組み立てること** (消される率が高いなら足す量を減らす)。' +
        'live=true はいま誰かが画面で編集中であることを示す (それでも追記は安全に通る)。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
      },
    },
    async (args) => runTool(async () => ok(await getCollabForAgent(args.project_id))),
  );

  server.registerTool(
    'append_project_note',
    {
      title: '案件のメモに追記',
      description:
        '案件の「みんなで書くメモ」の**末尾に追記する**。既存の文字は消さない (書き換え・削除はできない)。' +
        '「AIが追記（日時）」の見出しが自動で付くので、人が書いた分と混ざらない。' +
        '**編集中でも通る** (全置換の PUT は編集中は拒否されるが、これは追記なので安全)。' +
        '用途: 進行チェックの結果 / ふりかえりの気づき / 議事録の要点。' +
        '**決めたことのように書かない** — 日程・金額・可否を断定せず「確認が必要」と書く。' +
        '長文を貼らず、人が30秒で読める量にまとめる。先に get_project_collab で重複を確認すること。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        text: z.string().min(1).max(4000).describe('追記する本文 (見出しは自動で付く)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const result = await appendNotes(args.project_id, args.text, {
        userId: currentActorId(),
        requestedBy: args.requested_by ?? null,
      });
      await audit('append_project_note', args, {
        project_id: args.project_id, ai_output_id: result.ai_output_id,
      }, args.requested_by);
      return ok(result);
    }),
  );

  server.registerTool(
    'add_project_checklist',
    {
      title: '案件のチェックリストに追加',
      description:
        '案件のチェックリストに行を**足す**。既存の行は触らない (書き換え・削除・並び替えはできない)。' +
        '足した行には AI の印が付き、人が残す / 直す / 消すのが前提の**提案**として扱われる。' +
        '**期限は「何月何日何時何分まで」で入れる** (due_at は "YYYY-MM-DD HH:mm")。' +
        '原文に期限が無いなら**推測で埋めず空にする** (曖昧な期限を勝手に決めない)。' +
        '**案件の進行に必要なことだけを足す**。数を出すと消される率が上がり、この欄が読まれなくなる。' +
        'これはタスク管理ではない — 人に割り当てる依頼は create_task / create_delegation を使う。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        items: z.array(z.object({
          text: z.string().min(1).max(300).describe('やることを1行で'),
          due_at: z.string().max(20).nullable().optional()
            .describe('期限 "YYYY-MM-DD HH:mm"。原文に無ければ省略する (推測で埋めない)'),
        })).min(1).max(20).describe('足す行 (多くても20件。実際は3〜5件に絞ること)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const result = await appendChecklist(args.project_id, args.items, {
        userId: currentActorId(),
        requestedBy: args.requested_by ?? null,
      });
      await audit('add_project_checklist', args, {
        project_id: args.project_id, added: result.added.length, ai_output_id: result.ai_output_id,
      }, args.requested_by);
      return ok(result);
    }),
  );
}
