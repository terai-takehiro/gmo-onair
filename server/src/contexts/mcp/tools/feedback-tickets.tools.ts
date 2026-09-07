import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  feedbackTicketService, TARGET_APPS, PAGES_BY_APP, STATUSES,
} from '../../dailyops/services/feedback-ticket.service';
import { ok, runTool, audit, clampLimit, actorContext } from '../helpers';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne } from '../../../shared/db/connection';
import { recordAiOutput } from '../../../shared/services/ai-output.service';

/**
 * 日常業務アプリ (dailyops) — フィードバックチケット（GMO ONAiR 自体への要望・不具合報告）の
 * MCP ツール。チャットから起票・確認できるようにする（2026-09 依頼）。
 *
 * ⚠️ **起票（`create_feedback_ticket`）は静的APIキー（共用 actor）では使えない・
 * OAuth actor 専用**（`production.access.ts` の `requireProductionActor` と同じ考え方）。
 * 理由は2つ:
 *   1) `feedback_tickets.reporter_id` は `users` への FK。共用 actor の id（既定 `mcp-claude`）は
 *      実在の `users` 行ではないため、そのまま渡すと INSERT が確実に落ちる
 *      （`misc_inquiries.created_by` 等の「FK を張らない」対処とは違う設計 — こちらは
 *      「誰が報告したか」が画面にそのまま出る記録なので、共用名義での起票を避けたい）
 *   2) 起票者は「いま ONAiR にログインしている本人」であるべきで、他の書き込みツールの
 *      `requested_by`（監査ログ用の任意の名前文字列）のような「代理起票」を許す理由が無い
 *
 * 一覧（`list_feedback_tickets`）は読み取りのみなので静的キーでも通す（`gate.ts` の
 * `READ_TOOL_PERMISSIONS` で dailyops:reader を要求する形にそろえる）。
 *
 * ── AIを使い捨てにしない（5条件・`.claude/skills/ai-feedback-loop/`）─────────
 *
 * 1) 記録: ○ — `recordAiOutput(kind='feedback_ticket_draft')` に渡した引数全文を保存
 * 2) 修正差分: ✕ — チケットの題名・内容・対象アプリ/画面は起票後に直す手段が無い
 *    （`feedback-ticket.service.ts` の `updateStatus` は対応状況・対応コメントのみ）。
 *    代替: 対応者が「却下」にして対応コメントに理由を書く運用を当面の代用にする。
 *    本物の差分にするなら、内容編集APIを足して `findLatestAiOutput`+`recordCorrections`
 *    （7日窓）に繋ぐ — 今回のスコープでは見送り
 * 3) 成果: △ — `status`/`resolved_at` は既存データにあり「対応済みになったか」は導出できるが、
 *    `get_ai_feedback_digest` はまだこの kind に対応していない（未実装）
 * 4) 還流: △ — 3が繋がれば `get_ai_feedback_digest` に1行足すだけで出せる設計
 * 5) レビュー: ✕ — 頻度・担当は未定。提案: フィードバックチケットの対応者
 *    （`dailyops:editor`）が月1回、チャット起票の質（見当違いな分類・画面指定）を確認する
 */

async function requireReporter(): Promise<{ id: string; name: string }> {
  const actor = actorContext.getStore();
  if (!actor || !actor.isOAuth) {
    throw new AppError(
      403, 'FORBIDDEN',
      'フィードバックチケットの起票は ONAiR ログイン連携（OAuth）でのみ使えます。共有APIキーでは起票できません。',
    );
  }
  const user = await queryOne('SELECT id, name, deleted_at FROM users WHERE id = ?', [actor.actorId]) as
    { id: string; name: string; deleted_at: unknown } | undefined;
  if (!user || user.deleted_at) {
    throw new AppError(403, 'FORBIDDEN', 'このアカウントではフィードバックチケットを起票できません。');
  }
  return { id: user.id, name: user.name };
}

const TARGET_APP_LIST = TARGET_APPS.map((a) => `${a.key}=${a.label}`).join(' / ');
const PAGES_HINT = Object.entries(PAGES_BY_APP)
  .map(([app, pages]) => `${app}: ${pages.map((p) => p.key).join(',')}`).join(' ｜ ');

export function registerFeedbackTicketTools(server: McpServer): void {
  server.registerTool(
    'create_feedback_ticket',
    {
      title: 'フィードバックチケットの起票',
      description:
        'GMO ONAiR 自体（このプラットフォームのどれかのブロックアプリ）への要望・不具合を' +
        'チャットから起票する。起票者は今チャットしている ONAiR アカウント本人になる' +
        '（このツールは OAuth ログイン連携でのみ使え、共有APIキーでは使えない）。' +
        `target_app は次のいずれか: ${TARGET_APP_LIST}。` +
        `target_page は target_app ごとに決まったキーから選ぶ（${PAGES_HINT}。分からなければ "other"）。`,
      inputSchema: {
        title: z.string().min(1).max(200).describe('題名（1行）'),
        description: z.string().min(1).describe('詳しい内容。何が起きた/欲しいか・再現手順・影響など'),
        target_app: z.string().min(1).describe('対象アプリのキー（説明文の一覧から選ぶ）'),
        target_page: z.string().min(1).describe('対象の画面・機能キー（説明文の一覧から選ぶ。分からなければ "other"）'),
        category: z.enum(['bug', 'feature', 'other']).optional()
          .describe('種別 (bug=不具合 / feature=要望 / other=その他。既定 other)'),
        prompt_version: z.string().max(100).optional().describe('起票に使ったプロンプトの版 (任意)'),
      },
    },
    async (args) => runTool(async () => {
      const reporter = await requireReporter();
      const row = await feedbackTicketService.create({
        title: args.title,
        description: args.description,
        target_app: args.target_app,
        target_page: args.target_page,
        category: args.category,
        reporter_id: reporter.id,
        reporter_name: reporter.name,
      });
      audit(
        'create_feedback_ticket',
        { title: args.title, target_app: args.target_app, target_page: args.target_page, category: args.category },
        { id: row.id },
      );
      // AIを使い捨てにしない条件1（記録）。渡した引数全文を保存する（切り詰めない）
      await recordAiOutput({
        kind: 'feedback_ticket_draft',
        targetTable: 'feedback_tickets', targetId: String(row.id),
        payload: args, toolName: 'create_feedback_ticket',
        promptVersion: args.prompt_version ?? null,
        actorId: reporter.id,
      });
      return ok({ created: true, id: row.id, title: row.title, status: row.status });
    }),
  );

  server.registerTool(
    'list_feedback_tickets',
    {
      title: 'フィードバックチケットの一覧',
      description:
        'フィードバックチケット（GMO ONAiR 自体への要望・不具合報告）を一覧する。' +
        'status / target_app / category / search で絞り込める。新しい起票順・上限つき（既定20・最大100）。',
      inputSchema: {
        status: z.enum(STATUSES.map((s) => s.key) as [string, ...string[]]).optional()
          .describe('対応状況 (open=未対応 / in_progress=対応中 / resolved=対応済み / rejected=却下)'),
        target_app: z.string().optional().describe('対象アプリのキーで絞り込み'),
        category: z.enum(['bug', 'feature', 'other']).optional(),
        search: z.string().max(100).optional().describe('題名・内容の部分一致検索'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => runTool(async () => {
      const rows = await feedbackTicketService.list({
        status: args.status, target_app: args.target_app, category: args.category,
        search: args.search, limit: clampLimit(args.limit, 20),
      });
      return ok({ total: rows.length, tickets: rows });
    }),
  );
}
