import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { financeDocService, inquiryService, FINANCE_DOC_TYPES, FINANCE_DOC_STATUSES, INQUIRY_STATES } from '../../dailyops/services/inbox.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';
import { RICH_CONTENT_ARGS } from './richContentSchema';
import { recordAiOutput } from '../../../shared/services/ai-output.service';

// 日常業務アプリ (dailyops) — 受信箱系の MCP ツール。
// AI がメールを読み取り、見積/請求書 と その他問い合わせ を分類して取り込む想定。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * AI 出力の種類 (`ai_outputs.kind`)。
 * **人が直した差分を突き合わせる起点**なので、サービス側 (`inbox-ai-feedback.service.ts`)
 * と必ず同じ値を使うこと。
 */
export const FINANCE_DOC_INTAKE_KIND = 'finance_doc_intake';
export const INQUIRY_INTAKE_KIND = 'inquiry_intake';

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
        '登録直後の status は new (受信)。承認/却下/処理完了は人がアプリで操作するため通常 AI は status を送らない。' +
        '⚠️ doc_type=quote(見積書)は台帳（仕入・販管費）に入らないため「受け取った書類」画面には既定で出ない' +
        '（記録はされ、突き合わせには使える）。発注や請求を伴わない見積書だけのメールは、' +
        '登録してもこの画面上の処理は進められない点に注意。',
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
        // Phase 2（prompt_version の全 kind 展開）。**任意のまま増やすだけ** — 毎時動く
        // メール取込スキルの後方互換が制約なので、必須にしない・既存引数は変えない
        prompt_version: z.string().max(100).optional()
          .describe('取込に使ったプロンプトの版 (例 mail-intake-v3)。渡すと版ごとの無修正採用率を比較できる。任意'),
        ...RICH_CONTENT_ARGS,
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
        details: args.details, body_text: args.body_text ?? null,
        requested_by: args.requested_by ?? null, created_by: currentActorId(),
      });
      audit('record_finance_doc', { doc_type: args.doc_type, sender: args.sender, subject: args.subject, amount: args.amount },
        { id: row.id, action, doc_type: row.doc_type }, args.requested_by);
      // **AI の出力を切り詰めずに残す**（会社方針「AI を使い捨てにしない」の条件1）。
      // `mcp_audit_log` は args を 1000 文字で切るので教師データにならない
      await recordAiOutput({
        kind: FINANCE_DOC_INTAKE_KIND,
        targetTable: 'finance_docs', targetId: String(row.id),
        payload: args, toolName: 'record_finance_doc',
        promptVersion: args.prompt_version ?? null,
        actorId: currentActorId(), requestedBy: args.requested_by ?? null,
        sourceChannel: 'email', messageId: args.message_id ?? null,
      });
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
        'summary は内容の1行要約、importance は high(要即対応)/medium/low、action_needed は推奨アクションを簡潔に。' +
        'source は出どころ (mail / slack / phone / talk)。tags は後から引くための短い語を1〜3個 ' +
        '(協業・取材・採用・設備・営業資料・先の話 など。関係する GLS 番号があればそれもタグに入れてよい)。' +
        '\n\n**行き先 (state) は AI が決めない。** 取り込んだものは必ず「未仕分け」で入り、' +
        '人が ストック / チケット(案件管理のタスクになる) / 案件の受付へ送る / 見送り のどれかに仕分ける。' +
        '（ストックは「捨てた」ではない — 見直す日が付き、その日が来ると未仕分けと同じ扱いで机に戻る）' +
        'その仕分けの結果は `get_ai_feedback_digest` (kind=inquiry_intake) の見送り率として返ってくるので、' +
        '**取り込む前に一度読み、拾いすぎていないかを確かめること。**' +
        '\n\nmessage_id を渡すと再取込時に重複せず更新される。',
      inputSchema: {
        summary: z.string().min(1).describe('内容の1行要約 (必須)'),
        sender: z.string().optional().describe('送信者 (氏名・会社・Slack のチャンネルと人)'),
        subject: z.string().optional().describe('メール件名 / スレッド名'),
        source: z.enum(['mail', 'slack', 'phone', 'talk']).optional()
          .describe('出どころ mail=メール / slack=Slack / phone=電話メモ / talk=口頭 (既定 mail)'),
        tags: z.array(z.string()).max(8).optional()
          .describe('後から引くための短い語 (1〜3個推奨・各24文字まで)。例: 協業 / 取材 / 採用 / 設備 / GLS-2607-009'),
        category: z.string().optional().describe('【旧】分類。tags の1つ目として扱われる。新しくは tags を使う'),
        importance: z.enum(['high', 'medium', 'low']).optional().describe('重要度 (既定 medium)'),
        action_needed: z.string().optional().describe('推奨アクション (誰が何をすべきか)'),
        url: z.string().optional(),
        received_at: z.string().regex(DATE_RE).optional().describe('受信日 (YYYY-MM-DD)'),
        message_id: z.string().optional().describe('メールの Message-ID (重複取込ガード)'),
        // Phase 2（prompt_version の全 kind 展開）。任意のまま増やすだけ — 既存の呼び出しを壊さない
        prompt_version: z.string().max(100).optional()
          .describe('取込に使ったプロンプトの版 (例 mail-intake-v3)。渡すと版ごとの無修正採用率を比較できる。任意'),
        ...RICH_CONTENT_ARGS,
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      // `category` は tags の1つ目として畳む（両方来たら tags を優先）
      const tags = args.tags?.length ? args.tags : args.category ? [args.category] : [];
      const { row, action } = await inquiryService.create({
        summary: args.summary, sender: args.sender ?? null, subject: args.subject ?? null,
        tags, importance: args.importance ?? 'medium',
        action_needed: args.action_needed ?? null, url: args.url ?? null,
        received_at: args.received_at ?? null, source: args.source ?? 'mail', message_id: args.message_id ?? null,
        details: args.details, body_text: args.body_text ?? null,
        requested_by: args.requested_by ?? null, created_by: currentActorId(),
      });
      audit('record_inquiry', { subject: args.subject, sender: args.sender, importance: args.importance, source: args.source, tags },
        { id: row.id, action }, args.requested_by);
      await recordAiOutput({
        kind: INQUIRY_INTAKE_KIND,
        targetTable: 'misc_inquiries', targetId: String(row.id),
        payload: args, toolName: 'record_inquiry',
        promptVersion: args.prompt_version ?? null,
        actorId: currentActorId(), requestedBy: args.requested_by ?? null,
        sourceChannel: args.source ?? 'mail', messageId: args.message_id ?? null,
      });
      return ok({ [action]: true, id: row.id, action, importance: row.importance, state: row.state });
    }),
  );

  server.registerTool(
    'list_inquiries',
    {
      title: 'その他問い合わせの一覧',
      description:
        'その他問い合わせを一覧する。importance / state / tag で絞り込める。' +
        'state は unsorted(未仕分け) / stock(ストック) / ticket(チケットにした) / project(案件にした) / dropped(見送り)。' +
        'unhandled=true は未仕分けのみ (state=unsorted と同じ)。' +
        '\n\n**desk=true が「今日さばくもの」**（未仕分け ＋ 見直しの日が来たストック）。' +
        'ストックには見直す日 (stock_review_on) が付いており、その日が来ると未仕分けと同じ扱いで机に戻る。' +
        '見直す日が空のストックも「決めるために」机に出る（画面・ホームのバッジと同じ判定）。' +
        '\n\n⚠️ **返す件数には上限がある**（既定 50・最大 200）。全体の件数を知りたいときは ' +
        'total ではなくアプリの一覧（`/daily/inquiries`）を見ること — ' +
        'total は「この呼び出しで返した件数」であって全件数ではない。',
      inputSchema: {
        importance: z.enum(['high', 'medium', 'low']).optional(),
        state: z.enum(INQUIRY_STATES).optional().describe('行き先で絞る'),
        tag: z.string().optional().describe('このタグが付いたものだけ'),
        unhandled: z.boolean().optional().describe('true で未仕分けのみ'),
        desk: z.boolean().optional().describe('true で「今日さばくもの」(未仕分け + 見直しの日が来たストック)'),
        limit: z.number().int().min(1).max(200).optional().describe('返す件数 (既定 50・最大 200)'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await inquiryService.list({
        importance: args.importance, state: args.state, tag: args.tag,
        unhandledOnly: args.unhandled, deskOnly: args.desk, limit: args.limit,
      });
      // **`total` は「返した件数」**（上限で切れている可能性がある）。
      // 全件のつもりで読ませないよう `limited` を添える
      return ok({ total: rows.length, limited: rows.length >= (args.limit ?? 50), inquiries: rows });
    }),
  );
}
