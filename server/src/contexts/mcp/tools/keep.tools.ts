import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getPackForMeeting, listPacks } from '../../dailyops/services/keep-pack-store.service';
import { ok, runTool, clampLimit } from '../helpers';

// 隔週キープの「定例報告パック」(keep_report_packs) — docs/design/v4/keep-report.md §5・§9。
// 会議1回ぶんの数字 (着地・見込・推移・ヨミ表・案件ページ・稼働カレンダー・実施報告・内覧会・前回議事録)
// を1本の JSON で読む。Slack の定例投稿・pptx の自動生成はどちらも**パックを読むだけ**にし、
// 人の直しは構成 (デッキ) 側に持つ (条件2)。
// HTTP の GET /dailyops/keep/pack と同じ `getPackForMeeting` を通る (画面と AI が同じ答えを読む)。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerKeepTools(server: McpServer): void {
  server.registerTool(
    'get_keep_report_pack',
    {
      title: '隔週キープの定例報告パック取得',
      description:
        '隔週キープ (業績報告) の会議1回ぶんの数字を1本の JSON (KeepReportPack) で取得する。' +
        '中身: landing (会議の前の月の着地・主体別＋全体・6行の目標/実績/差/比/判定) / forecast (会議の月の着地見込＝確定＋受注前案件の確度加味・unconfirmed に未確定の売上) / ' +
        'trend (2024-01〜の売上[グループ内/外部]・案件数・営業日数・稼働日数・稼働率) / pipeline (ヨミ表: external と samurai [サムライ関連] の2表・見積金額の確度加味/総額) / ' +
        'project_pages (ヨミ表で「資料」に印を付けた案件のページ材料) / event_reports (前回の会議日以降に本番を終えた案件のふりかえり) / ' +
        'calendars (会議の月と翌月の稼働カレンダー) / inview (直近の定期内覧会。満足度は手入力) / minutes (前回議事録)。' +
        '金額は円の整数・比率は % (小数1桁)・判定と比率はサーバーが計算済み (手計算しない)。' +
        '凍結した版 (週報の確定時点の数字) があればそれを返し (frozen=true)、無ければいまの数字 (frozen=false・pack.frozen_at=null)。' +
        'live=true でいまの数字を強制。meeting_date 省略時は次回の開催日 (議事録の next_meeting_date。無ければ次の水曜)。',
      inputSchema: {
        meeting_date: z.string().regex(DATE_RE).optional().describe('会議の開催日 YYYY-MM-DD (省略時=次回の開催日)'),
        entity: z.enum(['all', 'gss', 'gscs', 'gig']).optional()
          .describe('事業主体の絞り込み (ヨミ表・案件ページ・実施報告に効く。数値報告の表は常に全体＋主体別を持つ)。既定 all'),
        segment: z.enum(['all', 'internal', 'external']).optional()
          .describe('お客様の区分の絞り込み (internal=グループ内 / external=外部)。既定 all'),
        live: z.boolean().optional().describe('true でいまの数字を返す (凍結した版があっても読まない)。既定 false'),
      },
    },
    async (args) => runTool(async () => ok(await getPackForMeeting({
      meetingDate: args.meeting_date ?? null, entity: args.entity, segment: args.segment, live: args.live === true,
    }))),
  );

  server.registerTool(
    'list_keep_report_packs',
    {
      title: '凍結した定例報告パックの一覧',
      description:
        '凍結した定例報告パックの一覧 (id / 会議日 / 絞り込み / 凍結した時刻と人 / 結んだ週報の id)。中身は含まない。' +
        '同じ会議日に複数の版があるのは凍結し直したもの (新しい版が先。前の版は消さない)。',
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20),
      },
    },
    async (args) => runTool(async () => ok({ packs: await listPacks(clampLimit(args.limit, 20)) })),
  );
}
