import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { projectService } from '../../sales/services/project.service';
import { ok, runTool, audit, clampLimit, REQUESTED_BY } from '../helpers';

// 隔週キープ資料 Phase 1: イベント実施報告 (event_reports)。
// 案件 (project) 1:1 の付帯レコードとして「会議で報告する定性情報」を持つ:
//   トピック (highlights) / リアル・オンライン来場者数 / 写真 (Box 参照)。
// report_status は draft/confirmed の 2 段階 — 資料には confirmed のみ掲載 (誤掲載防止)。
// 写真の実体は Box に置き、ONAiR は box_file_id のみ保持 (thumbnail は資料生成時に Box API で解決)。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface PhotoEntry {
  id: string;
  box_file_id: string;
  caption: string | null;
  sort_order: number;
}

async function getReportByProject(projectId: string): Promise<Record<string, unknown> | null> {
  return await queryOne('SELECT * FROM event_reports WHERE project_id = ?', [projectId]) as Record<string, unknown> | null;
}

/** 案件の存在チェック (無ければ 404) */
async function assertProject(projectId: string): Promise<Record<string, unknown>> {
  const p = await queryOne(
    'SELECT id, name, gls_number, event_start, event_end FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  ) as Record<string, unknown> | null;
  if (!p) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません (project_id を確認してください)');
  return p;
}

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
    async (args) => runTool(async () => {
      const project = await assertProject(args.project_id);
      const report = await getReportByProject(args.project_id);
      if (!report) return ok({ found: false, project: { id: project.id, name: project.name, gls_number: project.gls_number } });
      const summary = await projectService.getSummary(args.project_id);
      return ok({
        found: true,
        report,
        project: { id: project.id, name: project.name, gls_number: project.gls_number, event_start: project.event_start, event_end: project.event_end },
        summary,
      });
    }),
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
      const limit = clampLimit(args.limit);
      let where = 'WHERE 1=1';
      const params: unknown[] = [];
      const status = args.status ?? 'confirmed';
      if (status !== 'all') { where += ' AND r.report_status = ?'; params.push(status); }
      if (args.reported_from) { where += ' AND r.reported_at >= ?'; params.push(args.reported_from); }
      if (args.reported_to) { where += ' AND r.reported_at <= ?'; params.push(args.reported_to); }
      const rows = await queryAll(
        `SELECT r.*, p.name AS project_name, p.gls_number, p.event_start, p.event_end, p.stage
         FROM event_reports r
         JOIN projects p ON p.id = r.project_id AND p.deleted_at IS NULL
         ${where}
         ORDER BY r.reported_at DESC NULLS LAST, r.updated_at DESC
         LIMIT ?`,
        [...params, limit],
      ) as Record<string, unknown>[];
      const withSummary = await Promise.all(rows.map(async (r) => ({
        ...r,
        summary: await projectService.getSummary(r.project_id as string),
      })));
      return ok({ total: withSummary.length, reports: withSummary });
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
      await assertProject(args.project_id);
      const existing = await getReportByProject(args.project_id);
      let action: 'created' | 'updated';
      let id: string;
      if (!existing) {
        id = uuidv4();
        action = 'created';
        await execute(
          `INSERT INTO event_reports (id, project_id, headline, highlights, attendees_onsite, attendees_online, attendees_note, report_status, reported_at)
           VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)`,
          [id, args.project_id, args.headline ?? null, JSON.stringify(args.highlights ?? []),
           args.attendees_onsite ?? null, args.attendees_online ?? null, args.attendees_note ?? null,
           args.report_status ?? 'draft', args.reported_at ?? null],
        );
      } else {
        id = existing.id as string;
        action = 'updated';
        // 渡したフィールドのみ更新 (マージ)
        const sets: string[] = ['updated_at = NOW()'];
        const params: unknown[] = [];
        if (args.headline !== undefined) { sets.push('headline = ?'); params.push(args.headline); }
        if (args.highlights !== undefined) { sets.push('highlights = ?::jsonb'); params.push(JSON.stringify(args.highlights)); }
        if (args.attendees_onsite !== undefined) { sets.push('attendees_onsite = ?'); params.push(args.attendees_onsite); }
        if (args.attendees_online !== undefined) { sets.push('attendees_online = ?'); params.push(args.attendees_online); }
        if (args.attendees_note !== undefined) { sets.push('attendees_note = ?'); params.push(args.attendees_note); }
        if (args.report_status !== undefined) { sets.push('report_status = ?'); params.push(args.report_status); }
        if (args.reported_at !== undefined) { sets.push('reported_at = ?'); params.push(args.reported_at); }
        await execute(`UPDATE event_reports SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
      }
      const row = await getReportByProject(args.project_id);
      audit('upsert_event_report',
        { project_id: args.project_id, fields: Object.keys(args).filter((k) => k !== 'requested_by' && k !== 'project_id') },
        { id, action, project_id: args.project_id, report_status: row?.report_status }, args.requested_by);
      return ok({ [action]: true, action, report: row });
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
      await assertProject(args.project_id);
      let report = await getReportByProject(args.project_id);
      if (!report) {
        const newId = uuidv4();
        await execute(
          `INSERT INTO event_reports (id, project_id, report_status) VALUES (?, ?, 'draft')`,
          [newId, args.project_id],
        );
        report = await getReportByProject(args.project_id);
      }
      const photos = (report!.photos ?? []) as PhotoEntry[];
      const photo: PhotoEntry = {
        id: uuidv4(),
        box_file_id: args.box_file_id,
        caption: args.caption ?? null,
        sort_order: args.sort_order ?? (photos.length > 0 ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0),
      };
      photos.push(photo);
      photos.sort((a, b) => a.sort_order - b.sort_order);
      await execute(`UPDATE event_reports SET photos = ?::jsonb, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(photos), report!.id]);
      audit('attach_event_photo',
        { project_id: args.project_id, box_file_id: args.box_file_id, caption: args.caption },
        { photo_id: photo.id, project_id: args.project_id, photo_count: photos.length }, args.requested_by);
      return ok({ attached: true, photo_id: photo.id, photo_count: photos.length, photos });
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
      const report = await queryOne(
        `SELECT id, project_id, photos FROM event_reports
         WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(photos) e WHERE e->>'id' = ?)`,
        [args.photo_id],
      ) as Record<string, unknown> | null;
      if (!report) throw new AppError(404, 'NOT_FOUND', 'その photo_id の写真が見つかりません');
      const photos = (report.photos as PhotoEntry[]).filter((p) => p.id !== args.photo_id);
      await execute(`UPDATE event_reports SET photos = ?::jsonb, updated_at = NOW() WHERE id = ?`,
        [JSON.stringify(photos), report.id]);
      audit('detach_event_photo', { photo_id: args.photo_id },
        { project_id: report.project_id, photo_count: photos.length }, args.requested_by);
      return ok({ detached: true, project_id: report.project_id, photo_count: photos.length });
    }),
  );
}
