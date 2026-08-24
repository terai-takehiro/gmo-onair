/**
 * 制作資料（進行台本・スケジュール表）の MCP ツール — 段10 / 05-mcp.md。
 *
 * **制作資料のツールだけは OAuth actor 専用。** 静的 API キーは `requireProductionActor()`
 * が全ツールの先頭で 403 にする（read ツールには `gate.ts` の権限ゲートが掛からないため、
 * ここで止めるしかない。§3-1）。
 *
 * **書き込みは「提案まで」。** `propose_sheet_draft` は `qsheet_ai_proposals` に1行置くだけで、
 * 台本そのもの（Yjs の `data`）はサーバーから一切書き換えない（§6・利用者判断: 会話内での
 * 取り込みは第1版では求めない）。取り込みツールは意図的に出していない。
 *
 * ⚠️ **qsheet→techops移行 Phase 4（2026-08-22）: ツール名を techops 系の新名へ改名し、
 * 旧名（`get_qsheet`/`find_similar_qsheets`/`create_qsheet`/`propose_qsheet_draft`/
 * `discard_qsheet_proposal`）も同じ実装で二重登録した。** MCP プロトコルにはツール名の
 * エイリアス機構が無く、外部エージェント（Claude Desktop 等）は `tools/call` を
 * ツール名の完全一致で送るため、名前を変えるだけでは既存の連携が壊れる。
 *
 * 実装は「本体（コアロジック）を1つの関数として持ち、`registerTool` は新旧2回ずつ
 * それぞれの名前で呼ぶ」形にした。**write 系は `audit()` の呼び出しを各 `registerTool`
 * のハンドラ本体に直接書く**（コアロジックの中に埋めない）— これは
 * `scripts/generate-mcp-tools.mjs` の `extractTools()` が「`registerTool(...)` の
 * ソーステキストの中に `audit(` という文字列があるかどうか」で read/write を静的判定
 * しているため、共有関数の中に `audit()` を隠すと**新旧どちらの登録も read と誤判定**され、
 * `client/public/mcp-tools.json`（MCP コネクタ画面）に書き込みツールが「参照」と出てしまう
 * （実害は権限ゲート自体は `gate.ts` の `WRITE_TOOL_PERMISSIONS` を直接見るので別に機能するが、
 * 表示が嘘になる）。
 *
 * `mcp_audit_log.tool_name` は実際に呼ばれた名前（新旧どちらか）をそのまま記録するので、
 * 旧名の呼び出し頻度は `SELECT tool_name, count(*) FROM mcp_audit_log WHERE tool_name IN
 * ('create_qsheet','propose_qsheet_draft','discard_qsheet_proposal') GROUP BY tool_name`
 * で観測できる（read 系の `get_qsheet`/`find_similar_qsheets` はこのコードベースの規約上
 * 元から audit() を呼ばないため、この経路では観測できない — 撤去判断は書き込み3本の
 * 観測結果と、外部連携先への確認を組み合わせて行うこと。§4 Phase 4 参照）。
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ok, runTool, audit, REQUESTED_BY, type ToolResult } from '../helpers';
import { requireProductionActor } from './production.access';
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne } from '../../../shared/db/connection';
import { MINI_APPS, type MiniAppKey } from '../../../shared/production/miniapps';
import { QSHEET_BLOCK_TYPES } from '../../../shared/qsheet/blockTypes';
import { ITEM_KINDS, COL_GROUPS } from '../../../shared/schedule/kinds';
import { getJourneyForProject, getJourneyForDocument } from '../../qsheet/services/journey.service';
import { SCHEDULE_STATUSES } from '../../qsheet/services/schedule.service';
import { canAccessDoc, canAccessProposal } from '../../qsheet/access';
import { listProductionDocs } from '../../qsheet/services/production/doc-list.service';
import { fetchDocForRead, getQsheetOutline, getQsheetRows } from '../../qsheet/services/production/qsheet-read.service';
import { getDaySchedule } from '../../qsheet/services/production/schedule-read.service';
import { findSimilarQsheets } from '../../qsheet/services/production/similar.service';
import { createQsheetIdempotent, createOutlineOrLineProposal } from '../../qsheet/services/production/mcp-write.service';
import {
  createScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  createScheduleTable,
  updateScheduleTable,
  createScheduleColumn,
  updateScheduleColumn,
  deleteScheduleColumn,
  reorderScheduleColumns,
} from '../../qsheet/services/production/schedule-write.service';
import { discardProposal } from '../../qsheet/ai/apply.service';

const DOC_APP_KEYS = MINI_APPS.filter((a) => a.kind === 'document').map((a) => a.key) as [MiniAppKey, ...MiniAppKey[]];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 旧名（`*_qsheet` 系）の description 先頭に足す非推奨ノート。新名の説明文はそのまま流用する。 */
function deprecatedNote(newName: string): string {
  return `[非推奨/deprecated — 新名 '${newName}' を使ってください。旧名は当面動き続けますが撤去予定です] `;
}

export function registerProductionTools(server: McpServer): void {
  // ── read ────────────────────────────────────────────────
  server.registerTool(
    'list_production_docs',
    {
      title: '制作資料の一覧（進行台本・スケジュール表）',
      description:
        '進行台本（app=sheet）とスケジュール表（app=schedule）を横断で検索する。' +
        '見える範囲（作成者本人／共有先／system_admin）だけを返し、共有されていない資料は件数にも含めない。' +
        '制作資料のツールは ONAiR ログイン連携（OAuth）が必須（共有APIキーでは 403）。',
      inputSchema: {
        project_id: z.string().optional().describe('案件 id（GLS番号ではない）'),
        gls_number: z.string().optional().describe('GLS番号（GLS-A012）。project_id の代わりに使える'),
        date: z.string().regex(DATE_RE).optional(),
        app: z.enum(DOC_APP_KEYS).optional().describe('省略＝両方'),
        q: z.string().max(100).optional().describe('資料名・資料番号の部分一致'),
        limit: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      const result = await listProductionDocs(actor, {
        projectId: args.project_id,
        glsNumber: args.gls_number,
        date: args.date,
        // DOC_APP_KEYS は MINI_APPS の document 種別だけを列挙したものなので実行時は必ず 'sheet'|'schedule'
        app: args.app as 'sheet' | 'schedule' | undefined,
        q: args.q,
        limit: Math.min(100, Math.max(1, args.limit ?? 20)),
        page: Math.max(1, args.page ?? 1),
      });
      return ok(result);
    }),
  );

  server.registerTool(
    'get_production_journey',
    {
      title: '制作のジャーニー（今どこまで出来ているか）',
      description:
        '案件（project_id）または資料単体（document_id）のジャーニーを返す。' +
        '`tone`（blank/touched/recent）は完成度ではなく「触られたか」。遅れている・進んでいる' +
        'といった評価をユーザーに返さないこと。資料の中身（台詞など）は含まない。',
      inputSchema: {
        project_id: z.string().optional(),
        document_id: z.string().optional().describe('案件に紐づかない資料単体のとき'),
        from: z.string().regex(DATE_RE).optional(),
        to: z.string().regex(DATE_RE).optional(),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      if (!args.project_id && !args.document_id) {
        throw new AppError(400, 'BAD_REQUEST', 'project_id か document_id のどちらかを指定してください');
      }
      const result = args.project_id
        ? await getJourneyForProject(args.project_id, actor)
        : await getJourneyForDocument(args.document_id!, actor);
      if (!result) throw new AppError(404, 'NOT_FOUND', '見つかりません');
      const days = result.days.filter((d) => {
        if (!d.date) return true; // 日が決まっていない束は範囲指定に関わらず含める
        if (args.from && d.date < args.from) return false;
        if (args.to && d.date > args.to) return false;
        return true;
      });
      return ok({ days });
    }),
  );

  // get_sheet（旧 get_qsheet）— コアロジックを共有し、新旧2つの名前で登録する。
  const GET_SHEET_SCHEMA = {
    document_id: z.string(),
    mode: z.enum(['outline', 'section', 'full']).optional().describe('既定 outline'),
    section_id: z.string().optional().describe('mode=section のとき必須'),
    include_text: z.boolean().optional().describe('台詞などの本文を含める。既定 false'),
  };
  async function getSheetCore(args: {
    document_id: string; mode?: 'outline' | 'section' | 'full'; section_id?: string; include_text?: boolean;
  }): Promise<ToolResult> {
    const actor = await requireProductionActor();
    const doc = await fetchDocForRead(args.document_id);
    if (!doc || !(await canAccessDoc(actor, args.document_id, doc.created_by))) {
      throw new AppError(404, 'NOT_FOUND', '台本が見つかりません');
    }
    const mode = args.mode ?? 'outline';
    if (mode === 'outline') return ok(await getQsheetOutline(doc));
    const sections = await getQsheetRows(doc, {
      mode: mode as 'section' | 'full',
      sectionId: args.section_id,
      includeText: !!args.include_text,
    });
    return ok({ sections });
  }
  const GET_SHEET_DESCRIPTION =
    '台本全文は既定で返さない（数百KBになり得るため）。既定 mode=outline はロールの一覧と尺だけ、' +
    'section はその1構成だけ、full は400行まで（超えたら section 指定を促すエラーを返す）。' +
    'include_text=false（既定）では台詞は文字数だけを返す。列（セル）は blk.<type>#<n> という' +
    '参照キーで返る（同じ型の列が2本ある場合の区別に使う）。';
  server.registerTool(
    'get_sheet',
    { title: '進行台本の中身', description: GET_SHEET_DESCRIPTION, inputSchema: GET_SHEET_SCHEMA },
    async (args) => runTool(() => getSheetCore(args)),
  );
  server.registerTool(
    'get_qsheet',
    {
      title: '進行台本の中身（旧名）',
      description: deprecatedNote('get_sheet') + GET_SHEET_DESCRIPTION,
      inputSchema: GET_SHEET_SCHEMA,
    },
    async (args) => runTool(() => getSheetCore(args)),
  );

  server.registerTool(
    'get_day_schedule',
    {
      title: '当日のスケジュール表（枠）',
      description:
        'schedule_id、または project_id + date（省略可）で当日の枠を返す。' +
        'kind=onair の長さと台本のロールの尺の合計がつり合っているかを見るのに使う。' +
        '尺を自動で書き戻してはいけない。',
      inputSchema: {
        schedule_id: z.string().optional(),
        project_id: z.string().optional(),
        date: z.string().regex(DATE_RE).optional().describe('project_id と併用'),
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor();
      const result = await getDaySchedule(actor, { scheduleId: args.schedule_id, projectId: args.project_id, date: args.date });
      return ok(result);
    }),
  );

  // find_similar_sheets（旧 find_similar_qsheets）
  const FIND_SIMILAR_SCHEMA = {
    document_id: z.string().optional().describe('この台本に似た回を探す（いちばん精度が高い）'),
    project_id: z.string().optional().describe('document_id が無いとき'),
    exclude_document_id: z.string().optional(),
    limit: z.number().int().min(1).max(5).optional(),
  };
  async function findSimilarSheetsCore(args: {
    document_id?: string; project_id?: string; exclude_document_id?: string; limit?: number;
  }): Promise<ToolResult> {
    const actor = await requireProductionActor();
    if (args.document_id) {
      const doc = await queryOne('SELECT created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [args.document_id]);
      if (!doc || !(await canAccessDoc(actor, args.document_id, (doc.created_by as string) ?? null))) {
        throw new AppError(404, 'NOT_FOUND', '台本が見つかりません');
      }
    }
    const results = await findSimilarQsheets(actor, {
      documentId: args.document_id,
      projectId: args.project_id,
      excludeDocumentId: args.exclude_document_id,
      limit: args.limit ?? 3,
    });
    return ok({ results });
  }
  const FIND_SIMILAR_DESCRIPTION =
    '過去の似た回の骨格（ロール名・尺・列構成）を返す。本文は返さない。' +
    '見える範囲（共有されている台本）だけを対象にするため、共有が少ないと空になることがある。' +
    'is_reference=false（見本にしない印）の台本は対象外。既定 limit=3・最大5。';
  server.registerTool(
    'find_similar_sheets',
    { title: '似た過去回の台本を探す', description: FIND_SIMILAR_DESCRIPTION, inputSchema: FIND_SIMILAR_SCHEMA },
    async (args) => runTool(() => findSimilarSheetsCore(args)),
  );
  server.registerTool(
    'find_similar_qsheets',
    {
      title: '似た過去回の台本を探す（旧名）',
      description: deprecatedNote('find_similar_sheets') + FIND_SIMILAR_DESCRIPTION,
      inputSchema: FIND_SIMILAR_SCHEMA,
    },
    async (args) => runTool(() => findSimilarSheetsCore(args)),
  );

  // ── write ───────────────────────────────────────────────

  // create_schedule / update_schedule
  // スケジュール表そのもの (qsheet_schedules) の作成・更新。台本と違い「提案まで」ではなく
  // 直接書き込む — 既存の HTTP ルート (schedules.routes.ts) と同じ粒度の単純な CRUD のため。
  // 作成直後は列 (column) が0本なので、続けて create_schedule_column で列を用意するか
  // template_id でテンプレートを適用する。削除 (delete_schedule) は意図的に出していない
  // (共有先がいる資料の削除は影響が大きく、まずは画面から行う運用にする)。
  server.registerTool(
    'create_schedule',
    {
      title: 'スケジュール表を新規に作る',
      description:
        'スケジュール表 (qsheet_schedules) を1本新規に作る。作成直後は列・枠が0本 ' +
        '（テンプレートを使わない場合）。project_id / program_id はどちらか一方だけを指定する ' +
        '（両方は非推奨）。template_id を渡すとテンプレートの列・枠を初期投入する ' +
        '（テンプレートによっては onair_start_min が必須で、無いと 400 になる）。' +
        '制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        title: z.string().max(500).optional(),
        service_date: z.string().regex(DATE_RE),
        location_id: z.string().optional(),
        project_id: z.string().optional(),
        program_id: z.string().optional().describe('番組（マニュアル・案件管理外）。project_id とは同時に立てない'),
        episode_id: z.string().optional(),
        template_id: z.string().optional(),
        onair_start_min: z.number().int().min(0).max(2880).optional().describe('template_id 使用時に必要になることがある'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const row = await createScheduleTable(actor, {
        title: args.title ?? '',
        serviceDate: args.service_date,
        locationId: args.location_id ?? null,
        projectId: args.project_id ?? null,
        programId: args.program_id ?? null,
        episodeId: args.episode_id ?? null,
        templateId: args.template_id ?? null,
        onairStartMin: args.onair_start_min ?? null,
      });
      audit('create_schedule', args, { created_id: row?.id }, args.requested_by);
      return ok(row);
    }),
  );

  server.registerTool(
    'update_schedule',
    {
      title: 'スケジュール表を更新',
      description:
        '既存のスケジュール表 (schedule_id) を部分更新する。渡したフィールドだけ変わる。' +
        '他の人の編集と競合したときはエラー (CONFLICT) になるので、直前に get_day_schedule で ' +
        '読み直してから呼ぶこと。制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        schedule_id: z.string(),
        title: z.string().max(500).optional(),
        service_date: z.string().regex(DATE_RE).optional(),
        location_id: z.string().optional().describe('空文字で消せる'),
        project_id: z.string().optional().describe('空文字で消せる'),
        program_id: z.string().optional().describe('空文字で消せる'),
        episode_id: z.string().optional().describe('空文字で消せる'),
        view_start_min: z.number().int().min(0).max(2880).optional(),
        view_end_min: z.number().int().min(0).max(2880).optional(),
        slot_min: z.number().int().min(1).optional(),
        status: z.enum(SCHEDULE_STATUSES).optional(),
        notes: z.string().optional().describe('空文字で消せる'),
        expected_updated_at: z.string().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const row = await updateScheduleTable(actor, args.schedule_id, {
        title: args.title,
        serviceDate: args.service_date,
        locationId: 'location_id' in args ? (args.location_id || null) : undefined,
        projectId: 'project_id' in args ? (args.project_id || null) : undefined,
        programId: 'program_id' in args ? (args.program_id || null) : undefined,
        episodeId: 'episode_id' in args ? (args.episode_id || null) : undefined,
        viewStartMin: args.view_start_min,
        viewEndMin: args.view_end_min,
        slotMin: args.slot_min,
        status: args.status,
        notes: 'notes' in args ? (args.notes || null) : undefined,
        expectedUpdatedAt: args.expected_updated_at,
      });
      audit('update_schedule', args, { schedule_id: args.schedule_id }, args.requested_by);
      return ok(row);
    }),
  );

  // create_schedule_column / update_schedule_column / delete_schedule_column / reorder_schedule_columns
  // スケジュール表の列 (qsheet_schedule_columns) の CRUD ＋ 並べ替え。列は枠 (item) の入れ物
  // (会場/支度/運営の3グループ)。既存の HTTP ルート (schedule-columns.routes.ts) と同じ粒度。
  server.registerTool(
    'create_schedule_column',
    {
      title: 'スケジュール表に列を1つ追加',
      description:
        `スケジュール表 (schedule_id) に列を1つ追加する。col_group は ${COL_GROUPS.join('/')} の` +
        'いずれか（会場/支度/運営）。room_id は col_group=venue のときだけ指定できる。' +
        '制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        schedule_id: z.string(),
        col_group: z.enum(COL_GROUPS),
        label: z.string().max(200),
        room_id: z.string().optional().describe('col_group=venue のときだけ'),
        color: z.string().optional(),
        sort_order: z.number().int().optional().describe('省略時は同じ col_group の末尾に追加'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const row = await createScheduleColumn(actor, args.schedule_id, {
        colGroup: args.col_group,
        label: args.label,
        roomId: args.room_id ?? null,
        color: args.color ?? null,
        sortOrder: args.sort_order,
      });
      audit('create_schedule_column', args, { created_id: row?.id, schedule_id: args.schedule_id }, args.requested_by);
      return ok(row);
    }),
  );

  server.registerTool(
    'update_schedule_column',
    {
      title: 'スケジュール表の列を更新',
      description:
        '既存の列 (column_id) を部分更新する。渡したフィールドだけ変わる（col_group は変えられない ' +
        '— グループをまたぐ移動は reorder_schedule_columns で行う）。他の人の編集と競合したときは ' +
        'エラー (CONFLICT) になる。制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        schedule_id: z.string(),
        column_id: z.string(),
        label: z.string().max(200).optional(),
        room_id: z.string().optional().describe('col_group=venue の列だけ。空文字で消せる'),
        color: z.string().optional().describe('空文字で消せる'),
        width_px: z.number().int().min(80).max(640).optional(),
        expected_updated_at: z.string().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const row = await updateScheduleColumn(actor, args.schedule_id, args.column_id, {
        label: args.label,
        roomId: 'room_id' in args ? (args.room_id || null) : undefined,
        color: 'color' in args ? (args.color || null) : undefined,
        widthPx: args.width_px,
        expectedUpdatedAt: args.expected_updated_at,
      });
      audit('update_schedule_column', args, { column_id: args.column_id, schedule_id: args.schedule_id }, args.requested_by);
      return ok(row);
    }),
  );

  server.registerTool(
    'delete_schedule_column',
    {
      title: 'スケジュール表の列を削除',
      description:
        '既存の列 (column_id) を削除する（取消不可）。列の中にある枠 (item) も同時に削除される。' +
        '制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        schedule_id: z.string(),
        column_id: z.string(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const deletedItems = await deleteScheduleColumn(actor, args.schedule_id, args.column_id);
      audit(
        'delete_schedule_column',
        args,
        { column_id: args.column_id, schedule_id: args.schedule_id, deleted_items: deletedItems },
        args.requested_by,
      );
      return ok({ deleted: true, column_id: args.column_id, deleted_items: deletedItems });
    }),
  );

  server.registerTool(
    'reorder_schedule_columns',
    {
      title: 'スケジュール表の列を並べ替え',
      description:
        '列の並び順・所属グループをまとめて変える。order には対象列すべてを ' +
        '{ id, col_group, sort_order } の形で渡す（get_day_schedule では列の並び順までは分からないため、' +
        '事前に schedule_id で HTTP 画面か GET /schedules/:id で現在の列一覧を確認してから呼ぶこと）。' +
        '他の人が消した列は静かに無視される。expected_updated_at は取らない（レスポンスの全列で ' +
        '画面を丸ごと差し替える設計）。制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        schedule_id: z.string(),
        order: z.array(z.object({
          id: z.string(),
          col_group: z.enum(COL_GROUPS),
          sort_order: z.number().int(),
        })).min(1),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const rows = await reorderScheduleColumns(actor, args.schedule_id, args.order);
      audit('reorder_schedule_columns', args, { schedule_id: args.schedule_id, count: rows?.length }, args.requested_by);
      return ok(rows);
    }),
  );

  // create_schedule_item / update_schedule_item / delete_schedule_item
  // スケジュール表の枠 (qsheet_schedule_items) の CRUD。get_day_schedule (read) と対になる書き込み。
  // 台本 (get_sheet 系) と違い「提案まで」ではなく直接書き込む — 枠の追加・時刻調整は
  // 台本の内容を作り替えるものではなく、既存の HTTP ルート (schedule-items.routes.ts) と
  // 同じ粒度の単純な CRUD のため。
  server.registerTool(
    'create_schedule_item',
    {
      title: 'スケジュール表に枠を1つ追加',
      description:
        'スケジュール表 (schedule_id) に枠を1つ追加する。column_id は get_day_schedule の ' +
        'columns[].id から選ぶ。start_min/end_min は0時からの分 (例 9:30 = 570)。' +
        `kind は ${ITEM_KINDS.join('/')} のいずれか (既定 other)。制作資料 (qsheet) の editor 以上が必要。`,
      inputSchema: {
        schedule_id: z.string(),
        column_id: z.string(),
        title: z.string().max(500).optional(),
        kind: z.enum(ITEM_KINDS).optional(),
        start_min: z.number().int().min(0).max(2880),
        end_min: z.number().int().min(0).max(2880),
        assignee: z.string().optional(),
        note: z.string().optional(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const row = await createScheduleItem(actor, args.schedule_id, {
        columnId: args.column_id,
        title: args.title,
        kind: args.kind,
        startMin: args.start_min,
        endMin: args.end_min,
        assignee: args.assignee ?? null,
        note: args.note ?? null,
      });
      audit('create_schedule_item', args, { created_id: row?.id, schedule_id: args.schedule_id }, args.requested_by);
      return ok(row);
    }),
  );

  server.registerTool(
    'update_schedule_item',
    {
      title: 'スケジュール表の枠を更新',
      description:
        '既存の枠 (item_id) を部分更新する。渡したフィールドだけ変わる。他の人の編集と競合したときは ' +
        'エラー (CONFLICT) になるので、直前に get_day_schedule で読み直してから呼ぶこと。' +
        '制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        schedule_id: z.string(),
        item_id: z.string(),
        column_id: z.string().optional(),
        title: z.string().max(500).optional(),
        kind: z.enum(ITEM_KINDS).optional(),
        start_min: z.number().int().min(0).max(2880).optional(),
        end_min: z.number().int().min(0).max(2880).optional(),
        assignee: z.string().optional().describe('空文字で消せる'),
        note: z.string().optional().describe('空文字で消せる'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      const row = await updateScheduleItem(actor, args.schedule_id, args.item_id, {
        columnId: args.column_id,
        title: args.title,
        kind: args.kind,
        startMin: args.start_min,
        endMin: args.end_min,
        assignee: 'assignee' in args ? args.assignee : undefined,
        note: 'note' in args ? args.note : undefined,
      });
      audit('update_schedule_item', args, { item_id: args.item_id, schedule_id: args.schedule_id }, args.requested_by);
      return ok(row);
    }),
  );

  server.registerTool(
    'delete_schedule_item',
    {
      title: 'スケジュール表の枠を削除',
      description: '既存の枠 (item_id) を削除する (取消不可)。制作資料 (qsheet) の editor 以上が必要。',
      inputSchema: {
        schedule_id: z.string(),
        item_id: z.string(),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const actor = await requireProductionActor('editor');
      await deleteScheduleItem(actor, args.schedule_id, args.item_id);
      audit('delete_schedule_item', args, { item_id: args.item_id, schedule_id: args.schedule_id }, args.requested_by);
      return ok({ deleted: true, item_id: args.item_id });
    }),
  );

  // create_sheet（旧 create_qsheet）
  const CREATE_SHEET_SCHEMA = {
    title: z.string().max(500),
    project_id: z.string().optional(),
    episode_id: z.string().optional(),
    broadcast_date: z.string().regex(DATE_RE).optional(),
    block_types: z.array(z.enum(QSHEET_BLOCK_TYPES)).optional()
      .describe('既定の列。省略時は scenario / video / audio の3列'),
    idempotency_key: z.string().max(200).optional(),
    ...REQUESTED_BY,
  };
  async function createSheetCore(args: {
    title: string; project_id?: string; episode_id?: string; broadcast_date?: string;
    block_types?: (typeof QSHEET_BLOCK_TYPES)[number][]; idempotency_key?: string;
  }) {
    const actor = await requireProductionActor('editor');
    return createQsheetIdempotent(actor, {
      title: args.title,
      projectId: args.project_id,
      episodeId: args.episode_id,
      broadcastDate: args.broadcast_date,
      blockTypes: args.block_types,
      idempotencyKey: args.idempotency_key,
    });
  }
  const CREATE_SHEET_DESCRIPTION =
    '中身は空（sections=[]）で作る。骨格は propose_sheet_draft で提案する。' +
    'idempotency_key を渡すと同じ意図で二度呼んでも1本しか作らない（例 mcp:<project_id>:<YYYY-MM-DD>:qsheet）。' +
    '制作資料（qsheet）の editor 以上が必要。';
  server.registerTool(
    'create_sheet',
    { title: '空の進行台本を作る', description: CREATE_SHEET_DESCRIPTION, inputSchema: CREATE_SHEET_SCHEMA },
    async (args) => runTool(async () => {
      const result = await createSheetCore(args);
      audit('create_sheet', args, { created_id: result.document.id, doc_no: result.document.docNo, idempotent: !result.created }, args.requested_by);
      return ok(result);
    }),
  );
  server.registerTool(
    'create_qsheet',
    {
      title: '空の進行台本を作る（旧名）',
      description: deprecatedNote('create_sheet') + CREATE_SHEET_DESCRIPTION,
      inputSchema: CREATE_SHEET_SCHEMA,
    },
    async (args) => runTool(async () => {
      const result = await createSheetCore(args);
      audit('create_qsheet', args, { created_id: result.document.id, doc_no: result.document.docNo, idempotent: !result.created }, args.requested_by);
      return ok(result);
    }),
  );

  // propose_sheet_draft（旧 propose_qsheet_draft）
  const PROPOSE_DRAFT_SCHEMA = {
    document_id: z.string(),
    kind: z.enum(['script_outline_draft', 'script_line_draft']),
    payload: z.record(z.unknown()),
    context: z.object({
      based_on_document_ids: z.array(z.string()).max(5).optional(),
      schedule_id: z.string().optional(),
      onair_window_min: z.number().int().optional(),
      note: z.string().max(1000).optional(),
    }).optional(),
    read_feedback_digest: z.boolean().optional(),
    model: z.string().max(100).optional(),
    prompt_version: z.string().max(50).optional(),
    idempotency_key: z.string().max(200).optional(),
    ...REQUESTED_BY,
  };
  async function proposeSheetDraftCore(args: {
    document_id: string;
    kind: 'script_outline_draft' | 'script_line_draft';
    payload: Record<string, unknown>;
    context?: { based_on_document_ids?: string[]; schedule_id?: string; onair_window_min?: number; note?: string };
    read_feedback_digest?: boolean;
    model?: string;
    prompt_version?: string;
    idempotency_key?: string;
    requested_by?: string;
  }) {
    const actor = await requireProductionActor('editor');
    return createOutlineOrLineProposal(actor, {
      documentId: args.document_id,
      kind: args.kind,
      payload: args.payload,
      context: args.context,
      readFeedbackDigest: args.read_feedback_digest,
      model: args.model,
      promptVersion: args.prompt_version,
      idempotencyKey: args.idempotency_key,
      requestedBy: args.requested_by,
    });
  }
  const PROPOSE_DRAFT_DESCRIPTION =
    '台本への書き込みはしない。qsheet_ai_proposals に提案を1件作るだけで、' +
    '取り込みは編集画面の「AIの提案」から人が行う。' +
    'kind=script_outline_draft は payload={ budget_sec, sections:[{ key, label, duration_sec, ' +
    'rows:[{ key, label, duration_sec, speaker, hint? }] }] }（台詞は書かない・骨格のみ）。' +
    'kind=script_line_draft は payload={ lines:[{ row_id, name, text, is_q_word? }] }（既存行の' +
    '台詞を埋める。row_id はその台本に実在するものだけ有効）。HTML タグは使わない（落とされる）。' +
    '生成前に get_ai_feedback_digest(kind=同じ値) を必ず一度読み、read_feedback_digest に読んだかを' +
    '記録すること。制作資料（qsheet）の editor 以上が必要。';
  server.registerTool(
    'propose_sheet_draft',
    { title: 'AI 提案を1件置く（台本そのものは変わらない）', description: PROPOSE_DRAFT_DESCRIPTION, inputSchema: PROPOSE_DRAFT_SCHEMA },
    async (args) => runTool(async () => {
      const result = await proposeSheetDraftCore(args);
      audit(
        'propose_sheet_draft',
        args,
        { created_id: result.proposal?.id, document_id: args.document_id, kind: args.kind, rows: result.proposal?.summary.rows, idempotent: !result.created },
        args.requested_by,
      );
      return ok(result);
    }),
  );
  server.registerTool(
    'propose_qsheet_draft',
    {
      title: 'AI 提案を1件置く（台本そのものは変わらない）（旧名）',
      description: deprecatedNote('propose_sheet_draft') + PROPOSE_DRAFT_DESCRIPTION,
      inputSchema: PROPOSE_DRAFT_SCHEMA,
    },
    async (args) => runTool(async () => {
      const result = await proposeSheetDraftCore(args);
      audit(
        'propose_qsheet_draft',
        args,
        { created_id: result.proposal?.id, document_id: args.document_id, kind: args.kind, rows: result.proposal?.summary.rows, idempotent: !result.created },
        args.requested_by,
      );
      return ok(result);
    }),
  );

  // discard_sheet_proposal（旧 discard_qsheet_proposal）
  const DISCARD_PROPOSAL_SCHEMA = {
    proposal_id: z.string(),
    reason: z.string().max(500).optional().describe('なぜ使わないか（短くてよい）'),
    ...REQUESTED_BY,
  };
  async function discardSheetProposalCore(args: { proposal_id: string; reason?: string }): Promise<void> {
    const actor = await requireProductionActor('editor');
    const row = await queryOne('SELECT id, document_id, schedule_id, state FROM qsheet_ai_proposals WHERE id = ?', [args.proposal_id]);
    if (!row || !(await canAccessProposal(actor, { document_id: (row.document_id as string) ?? null, schedule_id: (row.schedule_id as string) ?? null }))) {
      throw new AppError(404, 'NOT_FOUND', '提案が見つかりません');
    }
    await discardProposal(args.proposal_id, args.reason ?? null, actor.id);
  }
  const DISCARD_PROPOSAL_DESCRIPTION =
    '提案を使わないと決めたことを記録する（04 の POST /proposals/:id/discard と同じ）。' +
    '見送りが記録されないと「拾いすぎ」が測れないため、使わない提案も必ず呼ぶこと。' +
    '制作資料（qsheet）の editor 以上が必要。';
  server.registerTool(
    'discard_sheet_proposal',
    { title: '提案を見送る', description: DISCARD_PROPOSAL_DESCRIPTION, inputSchema: DISCARD_PROPOSAL_SCHEMA },
    async (args) => runTool(async () => {
      await discardSheetProposalCore(args);
      audit('discard_sheet_proposal', args, { proposal_id: args.proposal_id }, args.requested_by);
      return ok({ discarded: true, proposal_id: args.proposal_id });
    }),
  );
  server.registerTool(
    'discard_qsheet_proposal',
    {
      title: '提案を見送る（旧名）',
      description: deprecatedNote('discard_sheet_proposal') + DISCARD_PROPOSAL_DESCRIPTION,
      inputSchema: DISCARD_PROPOSAL_SCHEMA,
    },
    async (args) => runTool(async () => {
      await discardSheetProposalCore(args);
      audit('discard_qsheet_proposal', args, { proposal_id: args.proposal_id }, args.requested_by);
      return ok({ discarded: true, proposal_id: args.proposal_id });
    }),
  );
}
