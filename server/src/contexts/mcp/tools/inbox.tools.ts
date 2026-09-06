import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { financeDocService, inquiryService, FINANCE_DOC_TYPES, FINANCE_DOC_STATUSES, INQUIRY_STATES } from '../../dailyops/services/inbox.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';
import { listGroups } from '../../dailyops/services/finance-doc-chain.service';
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
        'メールで受信した 見積書 / 請求書 / 注文書 を「受領書類」に登録する。' +
        'doc_type=quote(見積書)/invoice(請求書)/order(注文書)。送付者・件名・内容(要約)・金額(税込)・締月(YYYY-MM)・支払期日(YYYY-MM-DD)・受信日を渡す。' +
        'message_id (メールの Message-ID) を渡すと再取込時に重複せず更新される。' +
        '登録直後の status は new (受信)。承認/却下/仕入・販管費への登録は人がアプリで操作するため通常 AI は status を送らない。' +
        '\n\n【ひとつづり】見積書 → 発注書 → 請求書 は1つの取引なので **group_key で束ねる**。' +
        '同じ取引と分かるもの (同じ見積番号・同じ取引先の同じ件名など) には同じ group_key を渡すこと。' +
        '見積書が改定されたら revision を 2, 3… と増やして同じ group_key で登録する。' +
        '見積書だけで終わる取引・請求書しか来ない取引も普通にあるので、揃わなくてよい。' +
        '\n\n【当て先】どの案件かは最終的に人が決める。AI は project_hint (GLS 番号か案件名) を渡すだけでよく、' +
        'サーバーが案件を探して「どれくらい確からしいか」を付ける。**候補が複数あるときは付かない**。' +
        '案件に紐づかない経費 (家賃・回線・ソフトの月額など) は expense_kind="sga" を渡し、' +
        '分かれば payment_terms_days (何日サイト) と processing_month (何月処理・YYYY-MM) も渡す。' +
        '\n\n【添付】attachments で BOX の「受領書類（メール）」フォルダに保存される。**原本なので必ず渡すこと**。' +
        'Gmail コネクタは添付の中身を返さない (名前と id だけ) ので、' +
        '**gmail_message_id + gmail_attachment_id をそのまま渡す** — サーバーが Gmail API から取りに行く。' +
        '手元にバイト列があるときだけ content_base64 を使う。' +
        '返り値の attachments[].stored が false のときは failure_reason が付く (黙って消えない)。',
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
        // ── migration 280: ひとつづり / 当て先 / 添付 ──────────────
        group_key: z.string().max(200).optional()
          .describe('同じ取引を束ねる鍵 (見積番号・「取引先名:件名」など)。見積書→発注書→請求書を1つの取引にまとめる。渡さないと1通で1つの束になる'),
        group_title: z.string().max(200).optional().describe('束の題名 (何の取引か)。渡さなければ件名を使う'),
        vendor_name: z.string().max(200).optional().describe('取引先の会社名 (差出人の署名から)'),
        project_hint: z.string().max(200).optional()
          .describe('当て先の手がかり: GLS 番号 (例 GLS-A-2608-001) か案件名。サーバーが案件を探し、確からしさを付ける。**AI が案件を決め打ちしない**'),
        expense_kind: z.enum(['purchase', 'sga']).optional()
          .describe('purchase=案件の仕入 / sga=販管費 (案件に紐づかない経費)。決めきれないときは渡さない'),
        payment_terms_days: z.number().int().min(0).max(365).optional()
          .describe('販管費のとき: 支払サイト (締日から何日後か)。「月末締め翌月末払い」なら 31 ではなく processing_month と合わせて人が直せるので、書いてある日数をそのまま渡す'),
        processing_month: z.string().regex(MONTH_RE).optional()
          .describe('販管費のとき: 何月処理か (YYYY-MM)。渡さなければ受信日の月を使う'),
        doc_no: z.string().max(100).optional().describe('書類番号 (見積番号・請求番号)'),
        revision: z.number().int().min(1).max(99).optional().describe('見積の改定回数 (1 始まり)。改定された見積を登録するときに増やす'),
        attachments: z.array(z.object({
          filename: z.string().max(255).describe('ファイル名 (拡張子つき)'),
          mime_type: z.string().max(100).optional(),
          content_base64: z.string().optional()
            .describe('中身を base64 で。1ファイル 10MB まで。**手元にバイト列があるときだけ**'),
          gmail_message_id: z.string().max(200).optional()
            .describe('Gmail のメール id。**中身を持っていないときはこれと gmail_attachment_id を渡す** — サーバーが Gmail API から取りに行く'),
          gmail_attachment_id: z.string().max(2000).optional()
            .describe('Gmail の添付 id。⚠️ **呼ぶたびに変わる**ので、その場で get_message から取った新しいものを渡すこと (保存して後で使えない)'),
        })).max(10).optional()
          .describe(
            'メールの添付 (PDF など)。BOX の「受領書類（メール）」フォルダに保存する。**請求書の原本なので必ず渡すこと**。'
            + 'Gmail コネクタは添付の中身を返さないので、**gmail_message_id + gmail_attachment_id の組で渡す**のが通常。'
            + '取りに行けなかったときは理由付きで記録だけ残る (NO_GMAIL_SCOPE なら Google 連携のやり直しが要る)。'),
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
        // migration 280: ひとつづり・当て先・添付
        group_key: args.group_key ?? null, group_title: args.group_title ?? null,
        vendor_name: args.vendor_name ?? null, project_hint: args.project_hint ?? null,
        project_source: 'ai',
        expense_kind: args.expense_kind ?? null,
        payment_terms_days: args.payment_terms_days ?? null,
        processing_month: args.processing_month ?? null,
        doc_no: args.doc_no ?? null, revision: args.revision ?? null,
        attachments: args.attachments ?? null,
      });
      audit('record_finance_doc',
        // **添付の中身は監査ログに入れない**（base64 で 1000 文字の切り詰めを食い潰し、
        // 肝心の 差出人・件名・金額 が消える）。名前と数だけ残す
        { doc_type: args.doc_type, sender: args.sender, subject: args.subject, amount: args.amount,
          group_key: args.group_key, project_hint: args.project_hint,
          attachments: (args.attachments ?? []).map((a) => a.filename) },
        { id: row.id, action, doc_type: row.doc_type }, args.requested_by);
      // **AI の出力を切り詰めずに残す**（会社方針「AI を使い捨てにしない」の条件1）。
      // `mcp_audit_log` は args を 1000 文字で切るので教師データにならない
      await recordAiOutput({
        kind: FINANCE_DOC_INTAKE_KIND,
        targetTable: 'finance_docs', targetId: String(row.id),
        // **教師データにも base64 は要らない**（読み違えたのは文面であって中身の bytes ではない）。
        // 添付は「何を受け取ったか」が分かれば足りる
        payload: { ...args, attachments: (args.attachments ?? []).map((a) => ({ filename: a.filename, mime_type: a.mime_type })) },
        toolName: 'record_finance_doc',
        promptVersion: args.prompt_version ?? null,
        actorId: currentActorId(), requestedBy: args.requested_by ?? null,
        sourceChannel: 'email', messageId: args.message_id ?? null,
      });
      return ok({
        [action]: true, id: row.id, action, doc_type: row.doc_type, status: row.status,
        // **当て先を当てられたかを返す。** 返さないと、AI は自分の手がかりが
        // 効いたかどうかを知らないまま次のメールも同じ渡し方をする
        group_id: row.group_id, project_id: row.project_id,
        project_confidence: row.project_confidence, project_reason: row.project_reason,
        // **BOX に入らなかった添付をそのまま返す。** 黙って握り潰すと、
        // 入ったつもりで原本がどこにも無い状態に誰も気づけない
        attachments: (row.attachments as Record<string, unknown>[] | undefined ?? [])
          .map((a) => ({ filename: a.filename, stored: !!a.box_file_id, failure_reason: a.failure_reason })),
      });
    }),
  );

  server.registerTool(
    'list_finance_docs',
    {
      title: '見積/請求書の一覧',
      description:
        '受領書類を1通ずつ一覧する。status / doc_type で絞り込み、pending=true で未処理 (登録済・却下以外) のみ。' +
        '**取引としてまとめて見たいときは list_finance_doc_groups のほう**を使う。',
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

  server.registerTool(
    'list_finance_doc_groups',
    {
      title: '受領書類のひとつづり一覧',
      description:
        '受領書類を「1つの取引」(見積書 → 発注書 → 請求書 のひとつづり) 単位で一覧する。' +
        'stage は quote_only(見積書のみ) / ordered(発注済み) / invoiced(請求書あり) / empty。' +
        '**取り込む前にこれを読むと、同じ取引の続きなのかどうかが分かる** — ' +
        '同じ取引なら record_finance_doc に同じ group_key を渡して束ねること。' +
        'pending=true でまだ片づいていない束だけ (中の書類が全部 登録済/却下 なら片づき)。',
      inputSchema: {
        pending: z.boolean().optional().describe('true で片づいていない束だけ'),
        expense_kind: z.enum(['purchase', 'sga']).optional().describe('purchase=案件の仕入 / sga=販管費'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await listGroups({ pendingOnly: args.pending, expense_kind: args.expense_kind });
      return ok({ total: rows.length, groups: rows });
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
