import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { keepReportService } from '../../sales/services/keep-report.service';
import { ok, runTool, audit, clampLimit, REQUESTED_BY } from '../helpers';

// 隔週キープ資料 Phase 1: イベント実施報告 (event_reports)。
// 案件 (project) 1:1 の付帯レコードとして「会議で報告する定性情報」を持つ:
//   トピック (highlights) / リアル・オンライン来場者数 / 写真 (Box 参照)。
// report_status は draft/confirmed の 2 段階 — 資料には confirmed のみ掲載 (誤掲載防止)。
// 写真の実体は Box に置き、ONAiR は box_file_id のみ保持 (thumbnail は資料生成時に Box API で解決)。
// ロジックは keepReportService に集約 — UI (報告資料ページ) と同一コードパス。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerEventReportTools(server: McpServer): void {
  server.registerTool(
    'get_event_report',
    {
      title: 'イベント実施報告の取得',
      description:
        '案件に紐づくイベント実施報告 (トピック / 来場者数 / 写真 / 状態) を取得する。' +
        '案件の基本情報 (名前 / GLS / 開催期間) と収支サマリーも同梱。レポート未作成なら found=false。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID (list_projects で取得)'),
      },
    },
    async (args) => runTool(async () =>
      ok(await keepReportService.getEventReportWithProject(args.project_id))),
  );

  server.registerTool(
    'list_event_reports',
    {
      title: 'イベント実施報告の一覧',
      description:
        'イベント実施報告を reported_at (報告対象会議日) の範囲で一覧する。既定は confirmed のみ ' +
        '(資料掲載用 — 隔週キープが「前回開催日〜今日に報告すべき実施済み案件」を一括取得する用途)。' +
        '各レポートに案件情報 (名前 / GLS / 開催期間) と収支サマリー (売上 / 仕入 / 粗利 / 粗利率) を同梱する。',
      inputSchema: {
        reported_from: z.string().regex(DATE_RE).optional().describe('reported_at の下限 (YYYY-MM-DD)'),
        reported_to: z.string().regex(DATE_RE).optional().describe('reported_at の上限 (YYYY-MM-DD)'),
        status: z.enum(['confirmed', 'draft', 'all']).optional().describe('既定 confirmed (資料には confirmed のみ掲載)'),
        limit: z.number().int().optional().describe('最大件数 (既定 20 / 上限 100)'),
      },
    },
    async (args) => runTool(async () => {
      const reports = await keepReportService.listEventReports({
        status: args.status ?? 'confirmed',
        reportedFrom: args.reported_from,
        reportedTo: args.reported_to,
        limit: clampLimit(args.limit),
      });
      return ok({ total: reports.length, reports });
    }),
  );

  server.registerTool(
    'upsert_event_report',
    {
      title: 'イベント実施報告の作成/更新',
      description:
        '案件のイベント実施報告を作成または更新する。**渡したフィールドだけ更新** (未指定は既存値を保持)。' +
        'highlights は箇条書きトピックの全置換 (3-5点・各60字目安)。headline 未設定時は資料側で案件名を使用。' +
        'report_status を confirmed にすると資料掲載対象になる (既定 draft)。reported_at は報告対象会議日。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        headline: z.string().max(120).optional().describe('資料タイトル下の1行サマリ'),
        highlights: z.array(z.string().max(200)).max(10).optional().describe('箇条書きトピック (全置換)'),
        attendees_onsite: z.number().int().min(0).optional().describe('リアル来場者数'),
        attendees_online: z.number().int().min(0).optional().describe('オンライン参加者数'),
        attendees_note: z.string().optional().describe('「速報値」等の注記'),
        report_status: z.enum(['draft', 'confirmed']).optional(),
        reported_at: z.string().regex(DATE_RE).optional().describe('報告対象会議日 (YYYY-MM-DD)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const { id, action, report } = await keepReportService.upsertEventReport(args.project_id, {
        headline: args.headline,
        highlights: args.highlights,
        attendees_onsite: args.attendees_onsite,
        attendees_online: args.attendees_online,
        attendees_note: args.attendees_note,
        report_status: args.report_status,
        reported_at: args.reported_at,
      });
      audit('upsert_event_report',
        { project_id: args.project_id, fields: Object.keys(args).filter((k) => k !== 'requested_by' && k !== 'project_id') },
        { id, action, project_id: args.project_id, report_status: report.report_status }, args.requested_by);
      return ok({ [action]: true, action, report });
    }),
  );

  server.registerTool(
    'attach_event_photo',
    {
      title: 'イベント報告写真の追加',
      description:
        'イベント実施報告に写真を追加する。写真の実体は Box に置き、box_file_id (Box のファイル ID) で参照する — ' +
        'Box MCP の list_folder_content 等で取得した ID を渡す。レポート未作成の案件には draft レポートを自動作成する。' +
        'sort_order 未指定時は末尾に追加。返却される photo_id は detach_event_photo で使う。',
      inputSchema: {
        project_id: z.string().min(1).describe('案件 ID'),
        box_file_id: z.string().min(1).describe('Box のファイル ID'),
        caption: z.string().max(200).optional().describe('キャプション (会場/配信画面 等)'),
        sort_order: z.number().int().min(0).optional().describe('表示順 (未指定は末尾)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const result = await keepReportService.attachEventPhoto(args.project_id, {
        box_file_id: args.box_file_id, caption: args.caption, sort_order: args.sort_order,
      });
      audit('attach_event_photo',
        { project_id: args.project_id, box_file_id: args.box_file_id, caption: args.caption },
        { photo_id: result.photo_id, project_id: args.project_id, photo_count: result.photo_count }, args.requested_by);
      return ok({ attached: true, ...result });
    }),
  );

  server.registerTool(
    'detach_event_photo',
    {
      title: 'イベント報告写真の削除',
      description:
        'イベント実施報告から写真を 1 枚削除する (Box 上の実体ファイルは削除しない)。' +
        'photo_id は attach_event_photo の返却値 または get_event_report の photos[].id。',
      inputSchema: {
        photo_id: z.string().min(1).describe('写真 ID (photos[].id)'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const result = await keepReportService.detachEventPhoto(args.photo_id);
      audit('detach_event_photo', { photo_id: args.photo_id },
        { project_id: result.project_id, photo_count: result.photo_count }, args.requested_by);
      return ok({ detached: true, ...result });
    }),
  );
}
