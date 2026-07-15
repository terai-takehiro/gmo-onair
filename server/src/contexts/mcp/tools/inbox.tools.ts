import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { financeDocService, inquiryService, FINANCE_DOC_TYPES, FINANCE_DOC_STATUSES } from '../../dailyops/services/inbox.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';

// 日常業務アプリ (dailyops) — 受信箱系の MCP ツール。
// AI がメールを読み取り、見積/請求書 と その他問い合わせ を分類して取り込む想定。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

export function registerInboxTools(server: McpServer): void {
  // ── 見積/請求書/注文書 ──────────────────────────────
  server.registerTool(
    'record_finance_doc',
    {
      title: '見積/請求書/注文書の取込',
      description:
        'メールで受信した 見積書 / 請求書 / 注文書 を処理トラッキングに登録する。' +
        'doc_type=quote(見積書)/invoice(請求書)/order(注文書)。送付者・件名・内容(要約)・金額(税込)・締月(YYYY-MM)・支払期日(YYYY-MM-DD)・受信日を渡す。' +
        'message_id (メールの Message-ID) を渡すと再取込時に重複せず更新される。' +
        '登録直後の status は new (受信)。承認/却下/処理完了は人がアプリで操作するため通常 AI は status を送らない。',
      inputSchema: {
        doc_type: z.enum(FINANCE_DOC_TYPES).describe('quote=見積書 / invoice=請求書 / order=注文書'),
        sender: z.string().optional().describe('送付者 (取引先・担当者名)'),
        subject: z.string().optional().describe('メール件名 / 書類名'),
        content: z.string().optional().describe('内容の要約'),
        amount: z.number().optional().describe('金額 (税込・円)'),
        closing_month: z.string().regex(MONTH_RE).optional().describe('締月 (YYYY-MM)'),
        payment_due: z.string().regex(DATE_RE).optional().describe('支払期日 (YYYY-MM-DD)'),
        received_at: z.string().regex(DATE_RE).optional().describe('受信日 (YYYY-MM-DD)'),
        gls_number: z.string().optional().describe('関連案件の GLS 番号 (分かれば)'),
        notes: z.string().optional(),
        message_id: z.string().optional().describe('メールの Message-ID (重複取込ガード)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const { row, action } = await financeDocService.create({
        doc_type: args.doc_type, sender: args.sender ?? null, subject: args.subject ?? null,
        content: args.content ?? null, amount: args.amount ?? null,
        closing_month: args.closing_month ?? null, payment_due: args.payment_due ?? null,
        received_at: args.received_at ?? null, gls_number: args.gls_number ?? null, notes: args.notes ?? null,
        source: 'email', message_id: args.message_id ?? null,
        requested_by: args.requested_by ?? null, created_by: currentActorId(),
      });
      audit('record_finance_doc', { doc_type: args.doc_type, sender: args.sender, subject: args.subject, amount: args.amount },
        { id: row.id, action, doc_type: row.doc_type }, args.requested_by);
      return ok({ [action]: true, id: row.id, action, doc_type: row.doc_type, status: row.status });
    }),
  );

  server.registerTool(
    'list_finance_docs',
    {
      title: '見積/請求書の一覧',
      description: '見積/請求書/注文書を一覧する。status / doc_type で絞り込み、pending=true で未処理 (処理完了・却下以外) のみ。',
      inputSchema: {
        status: z.enum(FINANCE_DOC_STATUSES).optional(),
        doc_type: z.enum(FINANCE_DOC_TYPES).optional(),
        pending: z.boolean().optional().describe('true で未処理のみ (new/reviewing/approved)'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await financeDocService.list({ status: args.status, doc_type: args.doc_type, pendingOnly: args.pending });
      return ok({ total: rows.length, docs: rows });
    }),
  );

  // ── その他問い合わせ ──────────────────────────────
  server.registerTool(
    'record_inquiry',
    {
      title: 'その他問い合わせの取込 (有益メールのみ)',
      description:
        '他のどのカテゴリ (案件・営業活動・見積/請求・内覧会) にも属さないメールのうち、' +
        '**弊社にとって有益なもの** だけを登録する。' +
        '⚠️ 次のメールは登録しない (呼び出し前に AI が除外すること): 外部からの営業・売り込み / スパム / メルマガ・広告 / 自動通知の類 / 既に他ツールで扱う内容 (見積請求→record_finance_doc、内覧会→register_inview_attendee、案件の問い合わせ→create_project/create_activity_log)。' +
        'summary は内容の1行要約、importance は high(要即対応)/medium/low、category は分類タグ (協業・取材・採用・技術相談 等の自由文字列)、action_needed は推奨アクションを簡潔に。' +
        'message_id を渡すと再取込時に重複せず更新される。',
      inputSchema: {
        summary: z.string().min(1).describe('内容の1行要約 (必須)'),
        sender: z.string().optional().describe('送信者 (氏名・会社)'),
        subject: z.string().optional().describe('メール件名'),
        category: z.string().optional().describe('分類タグ (協業/取材/採用/技術相談 等・自由)'),
        importance: z.enum(['high', 'medium', 'low']).optional().describe('重要度 (既定 medium)'),
        action_needed: z.string().optional().describe('推奨アクション (誰が何をすべきか)'),
        url: z.string().optional(),
        received_at: z.string().regex(DATE_RE).optional().describe('受信日 (YYYY-MM-DD)'),
        message_id: z.string().optional().describe('メールの Message-ID (重複取込ガード)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const { row, action } = await inquiryService.create({
        summary: args.summary, sender: args.sender ?? null, subject: args.subject ?? null,
        category: args.category ?? null, importance: args.importance ?? 'medium',
        action_needed: args.action_needed ?? null, url: args.url ?? null,
        received_at: args.received_at ?? null, source: 'email', message_id: args.message_id ?? null,
        requested_by: args.requested_by ?? null, created_by: currentActorId(),
      });
      audit('record_inquiry', { subject: args.subject, sender: args.sender, importance: args.importance, category: args.category },
        { id: row.id, action }, args.requested_by);
      return ok({ [action]: true, id: row.id, action, importance: row.importance });
    }),
  );

  server.registerTool(
    'list_inquiries',
    {
      title: 'その他問い合わせの一覧',
      description: 'その他問い合わせを一覧する。importance で絞り込み、unhandled=true で未対応のみ。',
      inputSchema: {
        importance: z.enum(['high', 'medium', 'low']).optional(),
        unhandled: z.boolean().optional().describe('true で未対応のみ'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await inquiryService.list({ importance: args.importance, unhandledOnly: args.unhandled });
      return ok({ total: rows.length, inquiries: rows });
    }),
  );
}
