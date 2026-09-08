import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { studioBookingService } from '../../production/services/studio-booking.service';
import { ok, runTool, audit, REQUESTED_BY, currentActorId } from '../helpers';
import { queryOne } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// スタジオ予約カレンダー (production/studio) の MCP ツール。
// 参照 2 種 + 予約作成。

const BOOKING_TYPES = [
  'performance', 'rehearsal', 'hold', 'tour', 'consultation',
  'setup', 'maintenance', 'internal', 'other',
] as const;

const BOOKING_LIST_CAP = 500;

/**
 * 案件番号（現行 `projects.gls_number` ／ 改番で退役した旧番号 `project_numbers.number`）から
 * 案件 id を解決する。完全一致のみ（2026年10月の事業再編・P1 で配線済みの他6箇所——
 * `qsheet/device-settings-owner.ts` の `resolveOwner()` 等——と同じ形。docs/reorg-2026-10-plan.md §4.10）。
 *
 * ⚠️ `qsheet/services/production/doc-list.service.ts` の `resolveProjectId()` は
 * 現行番号しか見ないため使い回さない（意図的な重複 — 他6箇所も同様に個別に書いている）。
 */
async function resolveProjectIdByNumber(number: string): Promise<string | null> {
  const row = await queryOne(
    `SELECT id FROM projects
      WHERE deleted_at IS NULL
        AND (gls_number = ? OR id = (SELECT project_id FROM project_numbers WHERE number = ?))`,
    [number, number]
  );
  return (row?.id as string) ?? null;
}

/** 予約行を要約列に絞る */
function trimBookingRow(row: any) {
  return {
    id: row.id,
    title: row.title,
    booking_type: row.booking_type,
    status: row.status,
    hold_rank: row.hold_rank ?? null,
    all_day: row.all_day,
    start_time: row.start_time,
    end_time: row.end_time,
    location_note: row.location_note,
    notes: row.notes,
    project_id: row.project_id,
    project_name: row.project_name,
    gls_number: row.gls_number,
    episode_code: row.episode_code,
    // 担当者 (migration 279)。**要約でも落とさない** — 入れられるのに読めないと、
    // 「誰が持つ現場か」を訊かれるたびに画面を開き直すことになる
    assignees: (row.assignees as Array<{ id: string; name: string }> | undefined)
      ?.map((a) => ({ id: a.id, name: a.name })) ?? [],
    rooms: (row.rooms as any[] | undefined)?.map((r) => ({
      room_id: r.room_id,
      room_name: r.room_name,
      location_id: r.location_id,
      occupant: r.occupant,
      usage_note: r.usage_note,
    })) ?? [],
  };
}

export function registerStudioTools(server: McpServer): void {
  server.registerTool(
    'list_studio_rooms',
    {
      title: 'スタジオ部屋一覧',
      description: 'スタジオの拠点 (ロケーション) と部屋の一覧を取得する。予約作成 (create_studio_booking) の room_ids を調べる用途にも使う。',
      inputSchema: {},
    },
    async () => runTool(async () => {
      const locations = await studioBookingService.listRooms();
      return ok(locations.map((loc: any) => ({
        id: loc.id,
        name: loc.name,
        rooms: (loc.rooms as any[]).map((r) => ({
          id: r.id, name: r.name, abbreviation: r.abbreviation, room_type: r.room_type, color: r.color,
        })),
      })));
    }),
  );

  server.registerTool(
    'list_studio_bookings',
    {
      title: 'スタジオ予約一覧',
      description:
        'スタジオ予約 (カレンダー) を一覧する。from/to での期間絞り込みを推奨 (無指定だと全件からの取得になり最大500件で打ち切られる)。' +
        'booking_type: performance=本番, rehearsal=リハーサル, hold=仮押さえ, tour=内覧, consultation=相談, setup=設営・準備, maintenance=メンテナンス, internal=社内利用, other=その他。' +
        '返り値の assignees はその予約の担当者 (社内・複数・0人もある)。',
      inputSchema: {
        from: z.string().optional().describe('期間開始 (YYYY-MM-DD または ISO 日時)。この日時以降に終了する予約'),
        to: z.string().optional().describe('期間終了 (YYYY-MM-DD または ISO 日時)。この日時以前に開始する予約'),
        room_id: z.string().optional().describe('部屋 ID (list_studio_rooms で取得) で絞り込み'),
        project_id: z.string().optional().describe('案件 ID で絞り込み'),
      },
    },
    async (args) => runTool(async () => {
      const rows = await studioBookingService.listBookings({
        from: args.from,
        to: args.to,
        roomId: args.room_id,
        projectId: args.project_id,
      });
      const truncated = rows.length > BOOKING_LIST_CAP;
      return ok({
        data: (truncated ? rows.slice(0, BOOKING_LIST_CAP) : rows).map(trimBookingRow),
        total: rows.length,
        truncated,
      });
    }),
  );

  server.registerTool(
    'get_studio_availability',
    {
      title: 'スタジオ空き照会',
      description:
        '指定期間 [from, to] (YYYY-MM-DD・両端含む) の各部屋の空き状況を返す。' +
        '返り値: rooms[] 各要素に busy (期間に重なる予約) と free_days (予約が1件も無い終日空きの日付配列)。' +
        '問い合わせへの「◯日は空いていますか」回答や、予約前の空き確認に使う。room_id を指定すると 1 部屋に絞れる。' +
        '複数日にまたがる予約は各日を busy 扱い (安全側)。照会期間は最大 92 日。' +
        'list_studio_bookings と違い日付境界 (単日照会) の取りこぼしが無い。',
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('照会開始日 (YYYY-MM-DD)'),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('照会終了日 (YYYY-MM-DD・省略時は from と同日 = 単日照会)'),
        room_id: z.string().optional().describe('部屋 ID (list_studio_rooms で取得) で 1 部屋に絞る'),
      },
    },
    async (args) => runTool(async () => {
      const result = await studioBookingService.getAvailability({
        from: args.from,
        to: args.to ?? args.from,
        roomId: args.room_id,
      });
      return ok(result);
    }),
  );

  server.registerTool(
    'create_studio_booking',
    {
      title: 'スタジオ予約作成',
      description:
        'スタジオ予約を新規作成する。作成した予約はカレンダー UI にすぐ表示される。' +
        'room_ids は list_studio_rooms で確認した部屋 ID を渡す。使用者/用途メモを部屋ごとに付けたい場合は room_details を使う。' +
        '既定 status は tentative (仮予約)。日時は JST ローカルの ISO 形式 (例 2026-07-15T13:00:00)。' +
        '作成前に list_studio_bookings 等で同じ枠の予約が既に無いか確認すること — ' +
        'このツールは重複していても保存は止めない (時間帯が重なり、かつ同じ案件か件名がよく似た既存予約があると ' +
        '返り値の booking.duplicate_check に印が付くだけで、作成自体は成功する)。',
      inputSchema: {
        title: z.string().min(1).describe('予約タイトル'),
        start_time: z.string().min(1).describe('開始日時 (例 2026-07-15T13:00:00)'),
        end_time: z.string().min(1).describe('終了日時 (例 2026-07-15T18:00:00)'),
        booking_type: z.enum(BOOKING_TYPES).default('other'),
        status: z.enum(['tentative', 'confirmed']).default('tentative').describe('tentative=仮予約 / confirmed=確定'),
        hold_rank: z.number().int().positive().optional()
          .describe('仮押さえ (status=tentative) の何番手か (1=第一希望、2=次点…)。status が confirmed のときは無視される。同じ枠を取り合う仮押さえどうしの相対順位を人が把握している場合のみ指定する'),
        all_day: z.boolean().default(false),
        project_id: z.string().optional().describe('紐づける案件 ID (任意)'),
        gls_number: z.string().optional()
          .describe('案件番号（現行 SCS-0001 系。旧番号 GLS-A012 等・改番前の番号でも解決される）。project_id の代わりに使える（project_id を渡した場合はそちらが優先）'),
        episode_id: z.string().optional(),
        room_ids: z.array(z.string()).optional().describe('使用する部屋 ID の配列'),
        room_details: z.array(z.object({
          room_id: z.string(),
          occupant: z.string().optional(),
          usage_note: z.string().optional(),
        })).optional().describe('部屋ごとの使用者・用途メモ付き指定 (room_ids より優先)'),
        location_note: z.string()
          .max(40, '場所は短い地名だけにしてください（40字まで）。経緯はやり取りに書いてください')
          .optional()
          .describe(
            '外現場の**短い地名だけ**（例: 用賀 ビジネススクエアタワー18F）。' +
            '**要確認・打診の経緯・長い説明文は書かない** — それらは案件のやり取り (create_activity_log 等) に書くこと。' +
            '場所が確定していないときは空のままにする。',
          ),
        notes: z.string().optional().describe('備考'),
        assignee_user_ids: z.array(z.string()).optional()
          .describe('担当者に設定する登録ユーザーID (users.id) の配列。省略時は担当者なし。sales 権限を持たないユーザーは指定できない'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      // project_id が無く gls_number だけ渡された場合はここで解決する。
      // 現行番号・旧番号どちらでも当たる（resolveProjectIdByNumber・§4.10）。
      let projectId = args.project_id ?? null;
      if (!projectId && args.gls_number) {
        projectId = await resolveProjectIdByNumber(args.gls_number);
        if (!projectId) {
          throw new AppError(404, 'NOT_FOUND', `案件番号「${args.gls_number}」に一致する案件が見つかりません`);
        }
      }
      const row = await studioBookingService.createBooking(
        {
          title: args.title,
          booking_type: args.booking_type,
          project_id: projectId,
          episode_id: args.episode_id ?? null,
          all_day: args.all_day,
          start_time: args.start_time,
          end_time: args.end_time,
          room_ids: args.room_ids,
          room_details: args.room_details,
          location_note: args.location_note ?? null,
          notes: args.notes ?? null,
          status: args.status,
          hold_rank: args.hold_rank ?? null,
          assignee_user_ids: args.assignee_user_ids,
        },
        currentActorId(),
      ) as any;
      audit('create_studio_booking', args, { created_id: row?.id, title: args.title }, args.requested_by);
      return ok({ created: true, booking: row });
    }),
  );
}
