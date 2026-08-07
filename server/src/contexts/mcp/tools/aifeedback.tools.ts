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
        '無修正採用率・よく直されるフィールド・直近の修正例 (before→after)・成果と、' +
        'それを踏まえた助言文 (advice) を含む。' +
        '**見積の下書き・案件起票・タスクの下書きなどを生成する前に必ず一度読み、' +
        'advice と top_corrected_field_types を踏まえて出力すること。** ' +
        '例: 単価がよく下方修正されているなら、料金表の定価をそのまま置くのではなく過去の修正幅を考慮する。' +
        'データがまだ無い場合は advice が「傾向は不明」を返すので通常どおり作成してよい。' +
        '\n\n返り値の読み方: ' +
        '`top_corrected_field_types` は配列の鍵を潰した集計 (`tasks[].due_at` 等) で、' +
        '**どのフィールドが弱いかを読むのはこちら**。' +
        '`top_corrected_fields` は鍵ごとの集計で、見積の `items[camera].unit_price` のように' +
        '鍵自体に意味がある場合だけ見る (通し番号の鍵では意味を持たない)。' +
        '`by_model` はモデル / プロンプト版ごとの無修正採用率で、改善したかを比較する単位。' +
        '`intake` (kind=task_intake のとき) は誤検知率 (人がチェックを外した割合) と、' +
        '投入から生まれたタスクの期限内完了率を含む。' +
        '誤検知率が高いなら拾いすぎ、期限内完了率が低いなら置いた期限が短すぎる疑いがある。' +
        '`inquiry` (kind=inquiry_intake のとき) は取り込んだ情報の行き先 ' +
        '(チケット / 案件 / ストック / 見送り) と見送り率。**見送り率が高いなら拾いすぎ。**',
      inputSchema: {
        kind: z
          .string()
          .optional()
          .describe(
            'AI出力の種別 (既定 estimate_draft)。記録があるのは ' +
            'estimate_draft (見積の下書き) / task_intake (投入欄からのタスク下書き) / ' +
            'project_draft (create_project で起票したネタ案件。受付で人が直した差分が入る) / ' +
            'inquiry_intake (record_inquiry で取り込んだ情報。仕分けの行き先と見送り率が入る) / ' +
            'finance_doc_intake (record_finance_doc で取り込んだ書類)'
          ),
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
