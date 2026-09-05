/**
 * 受信箱の「不要」— AI起票ネタを1クリックで見送りにする（根源整理 Phase 1）
 *
 * ── なぜこの口が要るか（docs/core-redesign-plan.md §3-3 / §3-6）────────
 *
 * AI が起こしたネタ案件には長く「確認 or ステージ移動」しか出口が無く、
 * **「作られるべきでなかった」という判断を1クリックで残す道が無かった**。
 * 却下が学習データに一度も入らないので、AI の拾いすぎが永久に直らない。
 *
 * この hook は既存の `PATCH /projects/:id/stage`（e_lost）に理由
 * 「見送り（案件化せず）」（migration 238 で失注理由マスタに追加済み）を
 * 添えて呼ぶだけ。サーバー側で `recordIntakeDecision('dropped')` が走るので、
 * **押した却下がそのまま AI の教師データになる**（新しい記録経路は作らない）。
 *
 * ── 3画面が同じ1本を使う（写しを作らない）──────────────────────
 *
 *   ・ホームの受信箱（`platform/pages/home/TaskHubCard.tsx`）
 *   ・案件作成のレール（`projectNew/IntakeRail.tsx`）
 *   ・案件詳細の AI 起票バナー（`projectDetail/AiReviewBanner.tsx`）
 *
 * 書き写すと、理由の文字列がずれて失注分析で別の理由に数えられる。
 *
 * ⚠️ **AI 起票の行にだけ出すこと**（呼ぶ側の責任）。人間起票の案件に押しても
 * `recordIntakeDecision` は AI 起票のみ記録するので計測は汚れないが、
 * 人間のネタを1クリックで失注にできる形は事故のもと（`docs/core-redesign-plan.md` §4）。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';

/**
 * 失注理由マスタ（`lost_reason_categories`）の名前と**一字一句同じ**にすること。
 * `lost_reason` は理由の名前を文字列で持つ（`LostDialog.tsx` と同じ渡し方）ので、
 * ずれると失注分析で「見送り」がバラバラの理由に数えられる。
 */
export const DISMISS_LOST_REASON = '見送り（案件化せず）';

export function useDismissAiProject() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (projectId: string) =>
      api.patch(`/projects/${projectId}/stage`, {
        stage: 'e_lost',
        lost_reason: DISMISS_LOST_REASON,
      }),
    onSuccess: (_res, projectId) => {
      /*
       * ⚠️ **invalidate の対**（client/CLAUDE.md の「react-query の鍵」）。
       * `['projects']`（一覧）は `['project', id]`（1件）に**前方一致しない**ので
       * 両方落とす。受信箱（ホーム・レール・バッジ）と旧 ai-inbox、
       * ダッシュボードの帯（sales-overview がネタ件数を数える）も同じ行を持つ。
       */
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.inbox() });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.aiInbox() });
      qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      notifySuccess('失注にしました', {
        description: '理由「見送り（案件化せず）」で記録し、AI の学習データにも残しました。',
      });
    },
    onError: (e) => notifyApiError('失注にできませんでした', e, '時間をおいて、もう一度お試しください。'),
  });

  /**
   * 確認してから実行する。**確認文もここ1か所** — 3画面で文言が割れると
   * 「同じボタンなのに違うことを言う」ことになる。可逆であることを必ず書く
   * （自動整理の決めごと「クローズを安くする」— 重い確認は却下を溜める）。
   * 戻り値は「実行したか」（呼ぶ側が選択解除などの後片づけに使う。
   * やめたときに後片づけまでやると、カードは残るのに選択だけ消える）。
   */
  const dismiss = async (projectId: string, name?: string | null): Promise<boolean> => {
    const ok = await confirmAction({
      title: name ? `「${name}」を失注にしますか？` : 'このネタを失注にしますか？',
      description:
        '失注ではなく「見送り（案件化せず）」として記録します。案件詳細のステージ帯からいつでも戻せます。',
      confirmLabel: '失注にする',
    });
    if (ok) mutation.mutate(projectId);
    return ok;
  };

  return { dismiss, isPending: mutation.isPending };
}
