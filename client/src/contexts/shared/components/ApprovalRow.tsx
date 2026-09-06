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
  /**
   * **必須にしてあります。** `needsApproval` が見るので、渡し忘れると
   * 帯が黙って出なくなります（「出ないだけ」は誰も報告しないので気づけない）。
   */
  status: string;
  approval_state?: 'none' | 'pending' | 'approved' | null;
  /** いま見ている人が承認できるか。**サーバーが決める** */
  can_approve?: boolean;
  /** 承認者に決められているか（編集権限は見ない）。理由を名指しするために使う */
  is_approver?: boolean;
}

/**
 * **この見積に承認の帯を出すか。** 出す側2か所（案件・GPM）が同じ関数を使います。
 *
 * ⚠️ **`approval_state === 'pending'` だけで判定しないこと**（レビューでの指摘）。
 * 次の版を作ると前の版は `superseded` になりますが、**中身は触らない決めごと**なので
 * `approval_state` は `pending` のまま残ります。そのまま出すと、
 * **もう送れない版の帯が新しい版の帯と並んで2枚**出ます。
 *
 * `draft` に絞るのは、**承認が解くのは「送れない」だけ**だからです
 * （却下・差し替え済みの版は、承認しても送れるようにはなりません）。
 * サーバーも同じ条件で弾きます（古いタブから直接叩かれても通さないため）。
 */
export function needsApproval(e: ApprovalTarget): boolean {
  return e.approval_state === 'pending' && e.status === 'draft';
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

  if (!needsApproval(estimate)) return null;

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
            {/* ⚠️ **3通りある。** 「承認者だが編集権限が無い」を
                「承認者ではない」と同じ文にすると、**その人にだけ理由の分からない
                行き止まり**になり、見積はまた誰にも送れないまま止まる（#63 と同じ形） */}
            {estimate.can_approve
              ? '承認すると出せるようになります。'
              : estimate.is_approver
                ? 'あなたはこの見積の承認者ですが、案件・プロジェクトの編集権限が無いため承認できません（設定 → 人と権限）。'
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
