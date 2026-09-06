import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { opsReportService, OPS_REPORT_KINDS } from '../../dailyops/services/ops-report.service';
import { getWeeklyStats } from '../../dailyops/services/weekly-stats.service';
import { ok, runTool, clampLimit, audit, REQUESTED_BY, currentActorId } from '../helpers';
import { queryAll } from '../../../shared/db/connection';
import { recordAiOutput } from '../../../shared/services/ai-output.service';
import { OPS_NEWS_ITEM_KIND } from '../../../shared/services/ai-feedback.service';

// 日常業務アプリ (dailyops) の MCP ツール — 汎用レポート基盤 (ops_reports / ops_report_items)。
// AI エージェントが定期実行 (毎朝のニュース収集 / 週明けの週次レポート生成) で使う想定。
//
// 運用契約:
// - weekly_activity … 週1本 (period_key = 週開始日の月曜)。get_weekly_activity_stats で集計を取り、
//   それを文章化した body と、集計スナップショット payload ({stats: ...}) を submit_ops_report で
//   status='draft' 投稿する。人間がアプリでトピック行を追記し「確認・確定」して published にする。
// - daily_news … 日1本 (period_key = 日付)。Web の業界ニュースを add_ops_report_items で行として
//   投稿する (レポートが無ければ自動作成・published)。人間もアプリから行を追記できる。
// - mail_intake … 日1本 (period_key = 日付)。メールの仕分けが「何を取り込み、何を落としたか」を
//   残す。**取り込んだものは各テーブルに残るが、落とした判断はどこにも残らない** ので、
//   これが無いと取りこぼしを後から数えられない (会社方針「AI を使い捨てにしない」条件1)。
// - レポート本体 (title/body/payload) と行 (items) は分離されており、submit_ops_report は
//   items に一切触らない。人間の追記が消えることはない。

const KIND_ENUM = z.enum(OPS_REPORT_KINDS);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const NEWS_CATEGORIES = 'LED / 照明 / 映像 / 音声 / 配信 / コンテンツ / スタジオ / AR/XR / その他';

export function registerOpsReportTools(server: McpServer): void {
  server.registerTool(
    'get_weekly_activity_stats',
    {
      title: '週次活動集計の取得',
      description:
        'ウィークリー活動報告のための数値集計を取得する (新規案件 / 営業活動内訳 / パイプライン現況 / 売上 / 今週・来週のイベント / 来週期限の次回アクション)。' +
        'week_start 省略時は先週の月曜。任意の日付を渡してもその週の月曜に正規化される。' +
        'この結果を文章化して submit_ops_report (kind=weekly_activity) の body に、結果そのものを payload の {stats: ...} に入れて投稿する。',
      inputSchema: {
        week_start: z.string().regex(DATE_RE).optional().describe('対象週の開始日 (YYYY-MM-DD、省略時=先週月曜)'),
      },
    },
    async (args) => runTool(async () => ok(await getWeeklyStats(args.week_start))),
  );

  server.registerTool(
    'submit_ops_report',
    {
      title: '日常業務レポートの投稿 (upsert)',
      description:
        '日常業務アプリのレポート本体を投稿する。kind × period_key で 1 本 (再実行は同じレポートの更新になり重複しない)。' +
        'weekly_activity は period_key=週開始日の月曜 (自動正規化)・status は既定 draft (人間が確認後に公開するため draft のまま送る)。' +
        'weekly の payload には get_weekly_activity_stats の結果を {stats: ...} として同梱すること (アプリの集計セクションはこのスナップショットを表示する)。' +
        'daily_news は period_key=日付・status=published で送る (閲覧型のため確定操作は不要)。' +
        '注意: このツールは行 (items) には一切触れない。人間がアプリで追記した行は消えない。published 済みのレポートを draft に戻すこともない。',
      inputSchema: {
        kind: KIND_ENUM.describe('weekly_activity=ウィークリー活動報告 / daily_news=デイリーニュース報告 / mail_intake=メール取込ログ'),
        period_key: z.string().regex(DATE_RE).describe('対象期間 (週次=週開始日の月曜 / 日次=日付、YYYY-MM-DD)'),
        title: z.string().max(200).optional().describe('レポートタイトル (例: 週次活動報告 2026-07-06週)'),
        body: z.string().optional().describe('AI 生成本文 (markdown)。weekly のナラティブ'),
        payload: z.record(z.string(), z.unknown()).optional().describe('構造化データ。weekly は {stats: get_weekly_activity_stats の結果}'),
        status: z.enum(['draft', 'published']).optional().describe('既定: draft。daily_news は published を指定'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const { report, action } = await opsReportService.upsertReport({
        kind: args.kind,
        period_key: args.period_key,
        title: args.title,
        body: args.body,
        payload: args.payload,
        status: args.status,
        requested_by: args.requested_by ?? null,
        created_by: currentActorId(),
      });
      audit('submit_ops_report', { ...args, body: args.body ? `${args.body.slice(0, 200)}…` : undefined },
        { report_id: report.id, kind: args.kind, period_key: report.period_key, action }, args.requested_by);
      return ok({ [action]: true, id: report.id, kind: report.kind, period_key: report.period_key, status: report.status, action });
    }),
  );

  server.registerTool(
    'add_ops_report_items',
    {
      title: '日常業務レポートへの行追加',
      description:
        'レポートに行 (項目) を追加する。レポートが無ければ自動作成する (daily_news は published、weekly_activity は draft で作成)。' +
        `daily_news の行 = ニュース 1 件: category (${NEWS_CATEGORIES})、content (1行要約)、url (記事URL・必須推奨)、ai_related (AI 関連ニュースか)、note (補足メモ)。` +
        '同じ URL の行が既にあればスキップされる (再実行しても重複しない)。' +
        'weekly_activity の行 = トピック 1 件: category (グループへの技術支援 / イベント / セールス・マーケティング / 技術内製化 / 技術高度化 / AI活用 / その他)、content (内容)、note (補足)。' +
        'pick (採用フラグ 1〜5) は通常人間がアプリで設定するため AI からは省略してよい。' +
        '\n\nmail_intake (メール取込ログ・日1本) の行 = 1つの種別についての1行: ' +
        'category に種別 (kairos3_contact / kairos3_download / kairos3_inview / finance_doc / sales_thread / inquiry / dropped)、' +
        'content に「走査N通 / 取込N件 / 落としN件」、note に落としたものの代表の件名 (10本まで)。' +
        '**中身の全文は入れない** — 取り込んだメールの原文は各テーブルの body_text にある。' +
        '⚠️ これは「何を落としたか」を残すための記録。落とした判断がどこにも残らないと、' +
        '取りこぼしを後から数えられない (実測で資料ダウンロード通知 17件が1か月気づかれなかった)。',
      inputSchema: {
        kind: KIND_ENUM,
        period_key: z.string().regex(DATE_RE).describe('対象期間 (週次は月曜へ自動正規化)'),
        items: z.array(z.object({
          category: z.string().max(50).optional(),
          content: z.string().min(1).max(2000).describe('1行要約 / トピック内容'),
          note: z.string().max(2000).optional().describe('補足・メモ'),
          url: z.string().max(1000).optional().describe('ニュース記事の URL'),
          ai_related: z.boolean().optional().describe('AI 関連ニュースか'),
          pick: z.number().int().min(1).max(5).optional().describe('採用フラグ (通常は人間が設定)'),
        })).min(1).max(50),
        prompt_version: z.string().max(100).optional()
          .describe('生成に使ったプロンプトの版 (例 news-v2)。渡すと版ごとの成績を比較できる。任意 — 既存の呼び出しは変えなくてよい'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const report = await opsReportService.ensureReport(args.kind, args.period_key, currentActorId());
      // daily_news / mail_intake の新規レポートは published に昇格 (閲覧型・確定操作が無い)
      if ((args.kind === 'daily_news' || args.kind === 'mail_intake') && report.status !== 'published') {
        await opsReportService.upsertReport({ kind: args.kind, period_key: args.period_key, status: 'published' });
      }
      const { added, skipped } = await opsReportService.addItems(
        report.id as string,
        args.items,
        { source: 'ai', recordedBy: args.requested_by || currentActorId(), dedupeUrl: true },
      );
      // フィードバックループ（Phase 2 ③・会社方針「AIを使い捨てにしない」の条件1）。
      // **item ごとに1行**記録する — pick（1〜5）は行単位で付くので、レポート単位に
      // 畳むと「どの記事が刺さったか」が読めない。**best-effort**（記録の失敗で
      // ニュース投稿そのものは止めない）。ここで拾うのは今回入れた source='ai' の行だけ:
      // `addItems` は id を返さないので、sort_order が単調増加であることを使って
      // 末尾 `added` 件を引き直す（人の行は source='human' なので混ざらない）。
      if (added > 0) {
        try {
          const inserted = await queryAll(
            `SELECT id, category, content, note, url, ai_related, pick
               FROM ops_report_items
              WHERE report_id = ? AND deleted_at IS NULL AND source = 'ai'
              ORDER BY sort_order DESC LIMIT ?`,
            [report.id, added],
          ) as Array<Record<string, unknown>>;
          for (const row of inserted) {
            await recordAiOutput({
              kind: OPS_NEWS_ITEM_KIND,
              targetTable: 'ops_report_items', targetId: String(row.id),
              // payload は保存された行の全文（人が pick を付けたときの before になる）
              payload: row, toolName: 'add_ops_report_items',
              promptVersion: args.prompt_version ?? null,
              actorId: currentActorId(), requestedBy: args.requested_by ?? null,
            });
          }
        } catch (e) {
          console.warn('[mcp] ops_news_item の記録に失敗しました（続行）:', (e as Error).message);
        }
      }
      audit('add_ops_report_items', { kind: args.kind, period_key: args.period_key, item_count: args.items.length },
        { report_id: report.id, added, skipped }, args.requested_by);
      return ok({ report_id: report.id, kind: report.kind, period_key: report.period_key, added, skipped });
    }),
  );

  server.registerTool(
    'list_ops_reports',
    {
      title: '日常業務レポート一覧',
      description: '日常業務アプリのレポートを一覧する (メタのみ・本文なし)。投稿済み確認や欠番チェックに使う。',
      inputSchema: {
        kind: KIND_ENUM.optional(),
        status: z.enum(['draft', 'published']).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async (args) => runTool(async () => {
      const { rows, total } = await opsReportService.listReports({
        kind: args.kind, status: args.status, page: 1, limit: clampLimit(args.limit, 20),
      });
      return ok({ total, reports: rows });
    }),
  );

  server.registerTool(
    'get_ops_report',
    {
      title: '日常業務レポート取得',
      description:
        'レポートを全文 + 行 (items) 込みで取得する。id 指定、または kind + period_key 指定 (週次は月曜へ自動正規化)。' +
        '人間がアプリで追記した行 (source=human) も含まれるため、それを踏まえて本文を更新できる。',
      inputSchema: {
        id: z.string().optional().describe('レポート ID'),
        kind: KIND_ENUM.optional(),
        period_key: z.string().regex(DATE_RE).optional(),
      },
    },
    async (args) => runTool(async () => {
      const report = args.id
        ? await opsReportService.getReportById(args.id)
        : (args.kind && args.period_key)
          ? await opsReportService.getReportByPeriod(args.kind, args.period_key)
          : undefined;
      if (!args.id && !(args.kind && args.period_key)) {
        return ok({ error: 'id または kind + period_key を指定してください' });
      }
      return ok(report ?? { found: false, message: '該当するレポートはまだありません' });
    }),
  );
}
