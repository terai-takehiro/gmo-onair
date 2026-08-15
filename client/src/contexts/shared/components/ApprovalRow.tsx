/**
 * 値引きの承認待ち — **帯と「承認する」を1か所に置く**
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * 値引きが役割の上限を超えると、見積は `approval_state = 'pending'` になり
 * **送れなくなります**（お金のルール ⑤）。ところが承認する導線が
 * **クライアントに1つもありませんでした** — サーバーには `/approve` があるのに
 * 誰も呼べないので、**上限を超えた見積は永久に送れない**状態でした
 * （レビューの指摘。`docs/reviews/codex-findings-v4.md` の #63）。
 *
 * ── 置き場所が2つあるので部品にする ──────────────────────────
 *
 * 案件の見積タブと、プロジェクト管理（GPM）の見積タブ。**2回書くと、
 * 片方だけ直した日から「案件では承認できるのにプロジェクトでは押せない」**
 * が起きます（実際、帳票のボタンで一度やっています）。
 *
 * ── 押して 403 にしない ─────────────────────────────────────
 *
 * 承認できるのは**その見積を作った人の役割に決めた承認者**だけです。
 * 判定は**サーバーが `can_approve` で渡します** — 画面に規則を写すと、
 * 承認者の決め方を変えた日に**ボタンだけ古い規則で出ます**。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Clock } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';

export interface ApprovalTarget {
  id: string;
  version: number;
  subtotal: number;
  discount: number;
  approval_state?: 'none' | 'pending' | 'approved' | null;
  /** いま見ている人が承認できるか。**サーバーが決める** */
  can_approve?: boolean;
}

export function ApprovalNotice({ estimate, base, onDone }: {
  estimate: ApprovalTarget;
  /** API のもと。案件は `/projects/:id/estimates`、GPM は `/gpm/estimates` */
  base: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: () => api.post(`${base}/${estimate.id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries();
      onDone();
      notifySuccess(`v${estimate.version} の値引きを承認しました`, {
        description: 'これでお客様に出せます（「提出済」にすると送付した記録が残ります）。',
      });
    },
    onError: (e) => notifyApiError('承認できませんでした', e),
  });

  if (estimate.approval_state !== 'pending') return null;

  const rate = estimate.subtotal > 0
    ? Math.round((estimate.discount / estimate.subtotal) * 1000) / 10
    : 0;

  return (
    <div className="rounded-card border border-warning-border bg-warning-surface p-4 lg:px-5">
      <div className="flex flex-wrap items-start gap-3">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-list text-warning">
            v{estimate.version} は<strong className="font-bold">承認待ち</strong>です（値引き {rate}%）
          </p>
          <p className="text-sub mt-1 text-foreground">
            値引きが役割の上限を超えているため、<strong className="font-bold">このままではお客様に出せません</strong>。
            {estimate.can_approve
              ? '承認すると出せるようになります。'
              : '承認できるのは、この見積を作った方の役割に決めた承認者だけです（設定 → お金のルール）。'}
          </p>
        </div>
        {/* **承認できる人にだけ出す。** 出して 403 にすると、押した人には
            「壊れている」としか見えない（v4 の決めごと） */}
        {estimate.can_approve && (
          <Button
            size="sm"
            disabled={approve.isPending}
            onClick={async () => {
              const ok = await confirmAction({
                title: `v${estimate.version} の値引きを承認しますか？`,
                // ⚠️ `confirmAction` の説明は**素のテキスト**（`whitespace-pre-line`）。
                // `**…**` と書いても記号がそのまま出るので、強調は言葉の順で付ける
                description: `値引き ${rate}% を承認します。承認するとお客様に出せるようになります。`
                  + '\n承認したことは記録に残ります（誰が・いつ）。'
                  + '取り消したいときは次の版をつくってください。',
                confirmLabel: '承認する',
              });
              if (ok) approve.mutate();
            }}
          >
            <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />承認する
          </Button>
        )}
      </div>
    </div>
  );
}
