import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { ok, runTool, audit, clampLimit, REQUESTED_BY } from '../helpers';

// 隔週キープ資料 Phase 3: 議事録サマリ (meeting_minutes)。
// 開催日をキーに 決定事項 (decisions) と領域別サマリ (topics: {area, text}[]) を保持。
// topics の一部 (数値報告・営業進捗) は get_weekly_activity_stats から下書き自動生成し、
// 人が確定する運用を想定。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function getMinutesRow(meetingDate: string) {
  return await queryOne('SELECT * FROM meeting_minutes WHERE meeting_date = ?', [meetingDate]) as Record<string, unknown> | null;
}

export function registerMinutesTools(server: McpServer): void {
  server.registerTool(
    'get_meeting_minutes',
    {
      title: '議事録サマリの取得',
      description: '指定日の会議の議事録サマリ (決定事項 / 領域別トピック / 次回開催日) を取得する。未登録なら found=false。',
      inputSchema: {
        meeting_date: z.string().regex(DATE_RE).describe('開催日 YYYY-MM-DD'),
      },
    },
    async (args) => runTool(async () => {
      const row = await getMinutesRow(args.meeting_date);
      return ok(row ? { found: true, minutes: row } : { found: false, meeting_date: args.meeting_date });
    }),
  );

  server.registerTool(
    'upsert_meeting_minutes',
    {
      title: '議事録サマリの登録/更新',
      description:
        '会議の議事録サマリを登録/更新する。**渡したフィールドだけ更新** (未指定は既存値を保持)。' +
        'decisions は決定事項の全置換 (string[])、topics は領域別サマリの全置換 ({area, text}[] — ' +
        'area 例: 数値報告 / 構築 / 採用 / AI / 技術支援)。next_meeting_date は次回開催日。',
      inputSchema: {
        meeting_date: z.string().regex(DATE_RE).describe('開催日 YYYY-MM-DD'),
        decisions: z.array(z.string().max(300)).max(30).optional().describe('決定事項 (全置換)'),
        topics: z.array(z.object({
          area: z.string().max(50).describe('領域名 (数値報告 / 構築 / 採用 / AI 等)'),
          text: z.string().max(500).describe('サマリ本文'),
        })).max(30).optional().describe('領域別サマリ (全置換)'),
        next_meeting_date: z.string().regex(DATE_RE).optional().describe('次回開催日 YYYY-MM-DD'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      const existing = await getMinutesRow(args.meeting_date);
      let action: 'created' | 'updated';
      if (!existing) {
        action = 'created';
        await execute(
          `INSERT INTO meeting_minutes (meeting_date, decisions, topics, next_meeting_date)
           VALUES (?, ?::jsonb, ?::jsonb, ?)`,
          [args.meeting_date, JSON.stringify(args.decisions ?? []), JSON.stringify(args.topics ?? []),
           args.next_meeting_date ?? null],
        );
      } else {
        action = 'updated';
        const sets: string[] = ['updated_at = NOW()'];
        const params: unknown[] = [];
        if (args.decisions !== undefined) { sets.push('decisions = ?::jsonb'); params.push(JSON.stringify(args.decisions)); }
        if (args.topics !== undefined) { sets.push('topics = ?::jsonb'); params.push(JSON.stringify(args.topics)); }
        if (args.next_meeting_date !== undefined) { sets.push('next_meeting_date = ?'); params.push(args.next_meeting_date); }
        await execute(`UPDATE meeting_minutes SET ${sets.join(', ')} WHERE meeting_date = ?`, [...params, args.meeting_date]);
      }
      const row = await getMinutesRow(args.meeting_date);
      audit('upsert_meeting_minutes',
        { meeting_date: args.meeting_date, fields: Object.keys(args).filter((k) => k !== 'requested_by' && k !== 'meeting_date') },
        { meeting_date: args.meeting_date, action }, args.requested_by);
      return ok({ [action]: true, action, minutes: row });
    }),
  );

  server.registerTool(
    'list_meeting_minutes',
    {
      title: '議事録サマリの一覧',
      description: '議事録サマリを開催日の範囲で一覧する (新しい順)。前回会議分の取得 (決定事項の引き継ぎ表示) に使う。',
      inputSchema: {
        from: z.string().regex(DATE_RE).optional().describe('開催日の下限 (YYYY-MM-DD)'),
        to: z.string().regex(DATE_RE).optional().describe('開催日の上限 (YYYY-MM-DD)'),
        limit: z.number().int().optional().describe('最大件数 (既定 20 / 上限 100)'),
      },
    },
    async (args) => runTool(async () => {
      const limit = clampLimit(args.limit);
      let where = 'WHERE 1=1';
      const params: unknown[] = [];
      if (args.from) { where += ' AND meeting_date >= ?'; params.push(args.from); }
      if (args.to) { where += ' AND meeting_date <= ?'; params.push(args.to); }
      const rows = await queryAll(
        `SELECT * FROM meeting_minutes ${where} ORDER BY meeting_date DESC LIMIT ?`,
        [...params, limit],
      );
      return ok({ total: (rows as unknown[]).length, minutes: rows });
    }),
  );
}
