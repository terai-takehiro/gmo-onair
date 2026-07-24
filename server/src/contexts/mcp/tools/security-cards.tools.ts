import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { securityCardService } from '../../dailyops/services/security-card.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';
import { AppError } from '../../../shared/middleware/errorHandler';

// 日常業務アプリ (dailyops) — スタジオ セキュリティカード管理の MCP ツール。
// GMOサムライスタジオ用賀 (studio='yoga') のセキュリティカード 24 枚。
// カードはセキュリティレベルに応じて解錠できる部屋が異なる (access)。
// どの会社・担当者に、いつからいつまで貸し出したか (貸出/返却) を管理する。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** card_no か card_id からカードを解決する */
async function resolveCard(args: { card_no?: number; card_id?: string; studio?: string }): Promise<Record<string, unknown>> {
  let card: Record<string, unknown> | undefined;
  if (args.card_id) card = await securityCardService.getCard(args.card_id);
  else if (typeof args.card_no === 'number') card = await securityCardService.getCardByNo(args.card_no, args.studio ?? 'yoga');
  if (!card) throw new AppError(404, 'セキュリティカードが見つかりません (card_no または card_id を確認してください)', 'NOT_FOUND');
  return card;
}

export function registerSecurityCardTools(server: McpServer): void {
  server.registerTool(
    'list_security_cards',
    {
      title: 'スタジオ セキュリティカード一覧',
      description:
        'GMOサムライスタジオ用賀のセキュリティカード (全24枚) を一覧する。各カードのセキュリティレベル・' +
        '解錠できる部屋 (access)・現在の貸出状況 (利用可能 / 貸出中の会社・担当者・返却予定日) を返す。' +
        'status=lent で貸出中のみ、available で利用可能のみに絞れる。',
      inputSchema: {
        studio: z.string().optional().describe("拠点キー (既定 'yoga' = 用賀。現時点は用賀のみ)"),
        status: z.enum(['available', 'lent']).optional().describe('available=利用可能のみ / lent=貸出中のみ'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await securityCardService.listCards({ studio: args.studio, status: args.status });
      return ok({ total: rows.length, cards: rows });
    }),
  );

  server.registerTool(
    'get_security_card',
    {
      title: 'スタジオ セキュリティカードの詳細',
      description:
        'セキュリティカード 1 枚の詳細 (解錠できる部屋・現在の貸出状況・貸出履歴) を返す。' +
        'card_no (カード番号 1-24) か card_id で指定する。',
      inputSchema: {
        card_no: z.number().int().min(1).max(24).optional().describe('カード番号 (1-24)'),
        card_id: z.string().optional().describe('カード id (card_no の代わりに指定可)'),
        studio: z.string().optional().describe("拠点キー (既定 'yoga')"),
      },
    },
    async (args) => runTool(async () => ok(await resolveCard(args))),
  );

  server.registerTool(
    'lend_security_card',
    {
      title: 'スタジオ セキュリティカードの貸出',
      description:
        'セキュリティカードを貸し出す。card_no (1-24) と貸出先の担当者 (borrower_person) は必須。' +
        '会社名・連絡先・利用目的・貸出日 (既定は今日)・返却予定日 (due_on) も記録できる。' +
        '既に貸出中のカードはエラーになる (先に返却が必要)。' +
        '貸出対応者は handled_by (GMO ONAiR のメンバー名) を渡すと記録される。',
      inputSchema: {
        card_no: z.number().int().min(1).max(24).optional().describe('カード番号 (1-24)'),
        card_id: z.string().optional(),
        studio: z.string().optional().describe("拠点キー (既定 'yoga')"),
        borrower_person: z.string().min(1).describe('貸出先の担当者 (氏名)'),
        borrower_company: z.string().optional().describe('貸出先の会社'),
        borrower_contact: z.string().optional().describe('連絡先 (電話/メール 等)'),
        purpose: z.string().optional().describe('利用目的'),
        lent_on: z.string().regex(DATE_RE).optional().describe('貸出日 YYYY-MM-DD (既定は今日)'),
        due_on: z.string().regex(DATE_RE).optional().describe('返却予定日 YYYY-MM-DD'),
        handled_by: z.string().optional().describe('貸出対応者 (GMO ONAiR のメンバー名)'),
        notes: z.string().optional().describe('メモ'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const card = await resolveCard(args);
      const row = await securityCardService.lend(String(card.id), {
        borrower_person: args.borrower_person,
        borrower_company: args.borrower_company ?? null,
        borrower_contact: args.borrower_contact ?? null,
        purpose: args.purpose ?? null,
        lent_on: args.lent_on ?? null,
        due_on: args.due_on ?? null,
        lent_by_user_id: currentActorId(),
        lent_by_name: args.handled_by ?? args.requested_by ?? null,
        notes: args.notes ?? null,
        requested_by: args.requested_by ?? null,
        created_by: currentActorId(),
      });
      audit('lend_security_card',
        { card_no: row.card_no, borrower_company: args.borrower_company, borrower_person: args.borrower_person, due_on: args.due_on },
        { card_id: row.id, card_no: row.card_no, status: row.status }, args.requested_by);
      return ok({ lent: true, card_no: row.card_no, level_label: row.level_label, borrower_company: row.borrower_company, borrower_person: row.borrower_person, due_on: row.due_on, status: row.status });
    }),
  );

  server.registerTool(
    'return_security_card',
    {
      title: 'スタジオ セキュリティカードの返却',
      description:
        '貸出中のセキュリティカードを返却する。card_no (1-24) で指定する。' +
        '返却日 (returned_on) は既定で今日。貸出中でないカードはエラーになる。',
      inputSchema: {
        card_no: z.number().int().min(1).max(24).optional().describe('カード番号 (1-24)'),
        card_id: z.string().optional(),
        studio: z.string().optional().describe("拠点キー (既定 'yoga')"),
        returned_on: z.string().regex(DATE_RE).optional().describe('返却日 YYYY-MM-DD (既定は今日)'),
        handled_by: z.string().optional().describe('返却対応者 (GMO ONAiR のメンバー名)'),
        notes: z.string().optional().describe('返却時のメモ'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const card = await resolveCard(args);
      const row = await securityCardService.returnCard(String(card.id), {
        returned_on: args.returned_on ?? null,
        returned_by_user_id: currentActorId(),
        returned_by_name: args.handled_by ?? args.requested_by ?? null,
        notes: args.notes ?? null,
        requested_by: args.requested_by ?? null,
      });
      audit('return_security_card',
        { card_no: row.card_no, returned_on: args.returned_on },
        { card_id: row.id, card_no: row.card_no, status: row.status }, args.requested_by);
      return ok({ returned: true, card_no: row.card_no, level_label: row.level_label, status: row.status });
    }),
  );

  server.registerTool(
    'list_security_card_lendings',
    {
      title: 'スタジオ セキュリティカードの貸出履歴',
      description:
        'セキュリティカードの貸出履歴を一覧する。status=active で貸出中のみ、returned で返却済みのみ。' +
        'card_id で特定カードのみ、from/to (貸出日の範囲) でも絞れる。新しい貸出順。',
      inputSchema: {
        status: z.enum(['active', 'returned']).optional().describe('active=貸出中 / returned=返却済み'),
        card_id: z.string().optional().describe('特定カードの履歴のみ'),
        from: z.string().regex(DATE_RE).optional().describe('貸出日の下限 (YYYY-MM-DD)'),
        to: z.string().regex(DATE_RE).optional().describe('貸出日の上限 (YYYY-MM-DD)'),
        studio: z.string().optional().describe("拠点キー (既定 'yoga')"),
      },
    },
    async (args) => runTool(async () => {
      const rows = await securityCardService.listLendings({
        status: args.status, card_id: args.card_id, from: args.from, to: args.to, studio: args.studio,
      });
      return ok({ total: rows.length, lendings: rows });
    }),
  );
}
