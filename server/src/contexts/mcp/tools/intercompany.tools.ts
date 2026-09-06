import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createIntercompanyPurchase, suggestIntercompanyAmount } from '../../finance/services/intercompany.service';
import { ok, runTool, preview, audit, currentActorId, REQUESTED_BY } from '../helpers';

// 社内取引（GJV⇄GSS） — 2026年10月の事業再編・P2 Round 2（docs/reorg-2026-10-plan.md §4.12）。
// 「サムライスタジオへ社内発注」の MCP 版。confirm 2段階（renumber_project と同じ形）。

export function registerIntercompanyTools(server: McpServer): void {
  server.registerTool(
    'create_intercompany_purchase',
    {
      title: '社内取引の作成（GSS→GJVの社内発注）',
      description:
        'GJV の案件が GSS のスタジオ・人員・機材を使うときの社内取引を記録する（重要操作）。' +
        'GSS 側の社内売上（revenues）と GJV 側の社内仕入（purchases）を同じ回に1本ずつ作り、' +
        '`intercompany_links` で1対1に結ぶ（写しの案件は作らない）。作成後は片方だけを直せない・' +
        '消せない——直すのはこの取引専用の経路（`updateIntercompanyLink`/`deleteIntercompanyLink`、' +
        '設定画面は「案件詳細 > 仕入タブ > 社内取引」）から。' +
        '必ず confirm なしで一度実行してプレビューを取得し、ユーザーの明示的な了承を得てから ' +
        'confirm: true で再実行すること（承認なしの confirm: true は禁止）。',
      inputSchema: {
        project_id: z.string().min(1).describe('買い手（GJV）の案件 ID'),
        episode_id: z.string().min(1).describe('紐づける回（買い手の案件のもの）'),
        amount: z.number().int().positive().describe('金額（円・税抜）'),
        recognition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('計上日 YYYY-MM-DD（省略可）'),
        tax_category: z.enum(['tax10', 'tax8', 'exempt', 'nontax']).optional().describe('税区分（既定 tax10）'),
        notes: z.string().max(500).optional(),
        confirm: z.boolean().default(false).describe('プレビューをユーザーに確認してもらってから true'),
        ...REQUESTED_BY,
      },
    },
    async (args) => runTool(async () => {
      if (!args.confirm) {
        const suggestion = await suggestIntercompanyAmount(args.project_id);
        return preview(
          `GSS → GJV の社内取引（${args.amount.toLocaleString()}円）を作る`,
          [
            'GSS の社内売上（revenues）と GJV の社内仕入（purchases）が1本ずつ作られる（案件は増えない）',
            '両方の相手先は自社行（GSS の売上先＝GJV の自社行／GJV の仕入先＝GSS の自社行）',
            '作成後は片方だけを直せない・消せない（intercompany_links で結ばれる）',
            'GSS 側が請求書発行・検収・入金のいずれか済みになったら、この取引ごと直せなくなる',
            suggestion.estimate_id
              ? `参考: この案件の直近の見積の原価行の合計は ${suggestion.suggested_amount.toLocaleString()}円`
              : '参考: この案件にはまだ見積が無いため、原価行からの金額の下見はできない',
          ],
          '取り消せません（社内取引の専用経路以外からは編集・削除できません）',
        );
      }

      const result = await createIntercompanyPurchase({
        projectId: args.project_id,
        episodeId: args.episode_id,
        amount: args.amount,
        recognitionDate: args.recognition_date ?? null,
        taxCategory: args.tax_category,
        notes: args.notes ?? null,
        userId: currentActorId(),
      });
      audit('create_intercompany_purchase', args,
        { link_id: result.link.id, revenue_id: result.revenue.id, purchase_id: result.purchase.id },
        args.requested_by);
      return ok({
        executed: true,
        link_id: result.link.id,
        revenue: result.revenue,
        purchase: result.purchase,
      });
    }),
  );
}
