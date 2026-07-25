import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getFeedbackDigest } from '../../../shared/services/ai-feedback.service';
import { ok, runTool } from '../helpers';

// AI フィードバックの還流 (ai-feedback-loop Phase 4) — 読み取り専用。
//
// 方針「AIを使い捨てにしない」の閉じたループの最後の一辺。人間の修正差分を貯めるだけでは
// 賢くならないので、AI 自身が「自分の直近の誤り傾向」を読めるようにする。
// **プロンプトやスキルの更新を待たず、次の実行から効く**のがこの経路の価値。

export function registerAiFeedbackTools(server: McpServer): void {
  server.registerTool(
    'get_ai_feedback_digest',
    {
      title: 'AI出力の修正傾向ダイジェスト (生成前に読む)',
      description:
        'AI が過去に出した内容を人間がどう直したかの集計を返す。' +
        '無修正採用率・よく直されるフィールド・直近の修正例 (before→after)・成果 (受注/失注) と、' +
        'それを踏まえた助言文 (advice) を含む。' +
        '**見積の下書きや案件起票などを生成する前に必ず一度読み、advice と top_corrected_fields を踏まえて出力すること。** ' +
        '例: 単価がよく下方修正されているなら、料金表の定価をそのまま置くのではなく過去の修正幅を考慮する。' +
        'データがまだ無い場合は advice が「傾向は不明」を返すので通常どおり作成してよい。',
      inputSchema: {
        kind: z
          .string()
          .optional()
          .describe('AI出力の種別 (既定 estimate_draft)。現在記録があるのは estimate_draft'),
        window_days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe('集計期間 (日・既定 90)'),
      },
    },
    async (args) =>
      runTool(async () => ok(await getFeedbackDigest(args.kind ?? 'estimate_draft', args.window_days ?? 90))),
  );
}
