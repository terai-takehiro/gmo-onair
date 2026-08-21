/**
 * 次回アクションの完了・延期 (v4・この回で新しく画面に出した)
 *
 * `POST /activity-logs/:id/complete-next-action` `/postpone-next-action` は
 * 「営業ダッシュボードのワンタップ操作」用にサーバーには前からあったが、
 * **この一覧からは一度も呼ばれていなかった**（旧実装は編集ダイアログを
 * 開き直すしかなく、次回アクションだけを片づけるのに全項目を開く必要があった）。
 * `顧客360°ビュー`（`CustomerDetailPage.tsx`）が同じ口を先に使っており、
 * 「完了」＋「延期（明日／1週間）」の形をそちらに合わせてある
 * （画面によって次回アクションの片づけ方が変わると迷う）。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';

function dateAfter(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param extraInvalidateKeys 呼び出し元だけが持つ追加の鍵（既定は空）。
 *   例: `顧客360°ビュー` は `['customer-overview', id]` も一緒に落とさないと、
 *   完了・延期を押しても上のサマリー（未完了アクション件数）が古いままになる。
 *   ここに足しても既存の呼び出し（`ActivityLogPage.tsx`）は影響を受けない。
 */
export function useNextActionActions(extraInvalidateKeys: unknown[][] = []) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activity-logs'] });
    qc.invalidateQueries({ queryKey: ['activity-upcoming'] });
    extraInvalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
  };

  const mutation = useMutation({
    mutationFn: async (p: { id: string; action: 'complete' | 'postpone'; date?: string }) =>
      (p.action === 'complete'
        ? api.post(`/activity-logs/${p.id}/complete-next-action`)
        : api.post(`/activity-logs/${p.id}/postpone-next-action`, { date: p.date })
      ).then((r) => r.data),
    onSuccess: (_data, p) => {
      invalidate();
      notifySuccess(p.action === 'complete' ? '次回アクションを完了にしました' : '期限を延ばしました');
    },
    onError: (err) => notifyApiError('次回アクションの更新に失敗しました', err),
  });

  return {
    complete: (id: string) => mutation.mutate({ id, action: 'complete' }),
    postponeTomorrow: (id: string) => mutation.mutate({ id, action: 'postpone', date: dateAfter(1) }),
    postponeWeek: (id: string) => mutation.mutate({ id, action: 'postpone', date: dateAfter(7) }),
    isPending: mutation.isPending,
  };
}
