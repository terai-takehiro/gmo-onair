/**
 * 受信箱の受領書類を、トップページからその場で進める（2026-09 のご指示）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * トップページの受信箱に届いた書類が並んでいても、**押すと財務の画面へ飛ぶだけ**で、
 * 「見た」ことを残す手立てがありませんでした。**誰かひとりが対応したら他の人の
 * 画面から消える**ようにするには、その場で状態を進められる必要があります。
 *
 * ── 何をその場でできるようにするか ──────────────────────────
 *
 *   受信 → **確認する**（確認中）→ **承認**（承認）→ 仕入・販管費に登録
 *
 * **最後の1歩（仕入・販管費に登録）はここには置きません。** 案件・仕入先・
 * 税抜の金額を確かめる必要があり、1クリックで済ませてよい操作ではないからです
 * （`HandoffDialog` が受領書類の画面で訊きます）。
 *
 * ⚠️ **却下はここに置きません。** 「もう要らない」を1クリックにすると、
 * トップページのスクロール中に押してしまった請求書が誰の目にも触れなくなります。
 * 却下は受領書類の画面（中身を開ける場所）だけにあります。
 *
 * ── 権限 ────────────────────────────────────────────────────
 *
 * サーバーは `PUT /dailyops/finance-docs/:id` に **`dailyops` か `sales` の editor**
 * を要求します（`inbox.routes.ts` の `docsEdit`）。呼ぶ側がそれを見て出し分けること —
 * 出して 403 にすると「壊れている」としか見えません
 * （`shared/tests/clickable403.test.ts` の形）。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';

/** 受信箱に出る書類の状態のうち、ここで進められるもの */
export type InboxDocStatus = 'new' | 'reviewing' | 'approved' | 'rejected' | 'processed';

/** 次の1歩。**進める先が無い状態には何も出さない** */
export function nextStepOf(status: InboxDocStatus | null | undefined):
  { to: 'reviewing' | 'approved'; label: string } | null {
  if (status === 'new') return { to: 'reviewing', label: '確認する' };
  if (status === 'reviewing') return { to: 'approved', label: '承認' };
  return null;
}

export function useAdvanceFinanceDoc() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (p: { id: string; status: 'reviewing' | 'approved' }) =>
      api.put(`/dailyops/finance-docs/${p.id}`, { status: p.status }),
    onSuccess: (_res, p) => {
      /*
        ⚠️ **invalidate の対**（client/CLAUDE.md の「react-query の鍵」）。
        同じ書類が **受信箱 ／ 受領書類の一覧 ／ アプリのバッジ** の3か所に出る。
        1つでも落とし忘れると「片づけたのに残っている」に見える。
      */
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.inbox() });
      qc.invalidateQueries({ queryKey: ['dashboard', 'app-badges'] });
      qc.invalidateQueries({ queryKey: ['finance-doc-groups'] });
      qc.invalidateQueries({ queryKey: ['finance-docs'] });
      notifySuccess(p.status === 'approved' ? '承認しました' : '確認中にしました', {
        description: p.status === 'approved'
          ? '仕入・販管費への登録は財務の担当者が受領書類の画面で行います。'
          : '受領書類の画面で中身と添付を確かめられます。',
      });
    },
    onError: (e) => notifyApiError('進められませんでした', e, '時間をおいて、もう一度お試しください。'),
  });

  return { advance: mutation.mutate, isPending: mutation.isPending };
}
