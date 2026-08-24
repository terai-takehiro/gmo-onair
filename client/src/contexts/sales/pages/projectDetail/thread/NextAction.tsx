/**
 * やり取りの1件の中の「次にやること」。`ThreadCard.tsx` から切り出した
 * （役割で分ける — 400行の上限。完了・延期を足したときにここだけで超えた）。
 *
 * ── 色を使う枠はここだけ ────────────────────────────────────
 *
 * 複数の枠に色を付けると、どれが行動なのか読めない。期限切れは赤にする
 * （概要タブのダイジェストと同じ判定 — 片方だけ灰色だと手遅れに気づけない）。
 *
 * ── 1つの段落にしない ──────────────────────────────────────
 *
 * 中身は自由文ですが、実際には**言い切り1文 ＋ 付随してやること数件**の形で
 * 書かれています（`nextAction.ts`）。1つの段落に太字で流し込むと**画面 10 行ぶんの
 * 塊**になり、しかも**期限が塊の最後**に付くので目に入りません
 * （利用者から「読みづらい」とご指摘）。
 *
 * - **見出しだけを太字**にする。全部太字は、太字を使っていないのと同じ
 * - **期限は見出しの直後**に置く。並びの後ろに回すと 10 行スクロールしないと読めない
 * - **並びは赤くしない。** 期限切れでも赤いのは枠と見出し（＝期限を持つ行）だけ。
 *   4行とも赤いと、何が期限切れなのか読めない
 *
 * ── 書いた記録だけでは閉じない（ユーザー指摘）────────────────────
 *
 * 新しいやり取りを書いても、この次回アクションは自動では「済み」にならない
 * （別の行として積み上がる）。ここに完了・延期を置かなかった結果、「対応したのに
 * 期限超過のまま残る」状態を招いていた——お待たせ中の期限超過はこのタブ
 * （`/sales/projects/:id/thread`）に送るのに、片づける手段が営業活動記録・
 * お客様詳細にしか無かった（`inbox/kinds.ts` の `inboxHrefOf`）。
 * `useNextActionActions` は既存の口（`顧客360°ビュー`・営業活動記録と共通）を
 * そのまま使う——片づけ方を画面ごとに変えない。
 */
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { InlineText } from '@gmo-onair/shared/src/client-v4/richContent';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Button } from '@/components/ui/button';
import type { ActivityLog } from '../types';
import { shortYmd } from './format';
import { parseNextAction } from './nextAction';
import type { useNextActionActions } from '../../activityLog/useNextActionActions';

export type NextActionActions = ReturnType<typeof useNextActionActions>;

export function NextAction({
  a, overdue, canEdit, actions,
}: {
  a: ActivityLog;
  overdue: boolean;
  /** 完了・延期を押せるか（`sales` の editor。サーバー側と同じ要求） */
  canEdit?: boolean;
  /**
   * 完了・延期の実行口。渡さない（未指定の）ときはボタンを出さない。
   * `useNextActionActions.ts` の冒頭コメント参照
   */
  actions?: NextActionActions;
}) {
  const na = parseNextAction(a.next_action);
  const [postponing, setPostponing] = useState(false);
  const done = !!a.next_action_done_at;
  return (
    <div className={cn(
      'rounded-note mt-3 flex items-start gap-2.5 border px-3 py-2.5',
      overdue ? 'border-destructive-border bg-destructive-surface' : 'border-primary-border bg-primary-surface',
    )}>
      <ArrowRight
        className={cn('mt-0.5 h-4 w-4 shrink-0', overdue ? 'text-destructive' : 'text-primary')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sub break-words font-bold', overdue ? 'text-destructive' : 'text-foreground')}>
          <InlineText text={na.headline} />
          {/*
            **`text-sub-sm`(11.5px) を使わないこと。** スマホでも上げない段なので
            （件数の数字・列見出し・バッジの札のための段）、ここに当てると
            **期限切れの知らせが 375px で 11.5px** になる。数字だけは `font-number`
          */}
          {a.next_action_date && (
            <span className={cn('text-sub ml-2', overdue ? 'text-destructive' : 'text-primary')}>
              <span className="font-number">{shortYmd(a.next_action_date, a.activity_date)}</span>
              {' まで'}{overdue && '（過ぎています）'}
            </span>
          )}
          {done && <span className="text-sub ml-2 text-muted-foreground">済み</span>}
        </p>

        {na.items.length > 0 && (
          <ul className="mt-1.5 flex flex-col gap-1">
            {na.items.map((it, i) => (
              <li key={`${it.marker ?? ''}-${i}`} className="text-sub flex gap-1.5 text-secondary-foreground">
                {/* 印は**原文に書かれていたものだけ**。無ければ `・` を描く（番号を作らない） */}
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">{it.marker ?? '・'}</span>
                <span className="min-w-0 flex-1 break-words"><InlineText text={it.text} /></span>
              </li>
            ))}
          </ul>
        )}

        {!done && canEdit && actions && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button
              size="sm" variant="outline" className="px-2 text-xs"
              disabled={actions.isPending}
              onClick={() => actions.complete(a.id)}
            >
              完了にする
            </Button>
            {postponing ? (
              <>
                <Button size="sm" variant="ghost" className="px-1.5 text-xs"
                  onClick={() => { actions.postponeTomorrow(a.id); setPostponing(false); }}>
                  明日
                </Button>
                <Button size="sm" variant="ghost" className="px-1.5 text-xs"
                  onClick={() => { actions.postponeWeek(a.id); setPostponing(false); }}>
                  1週間
                </Button>
                <Button size="sm" variant="ghost" className="px-1.5 text-xs" onClick={() => setPostponing(false)}>
                  ×
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="px-2 text-xs" onClick={() => setPostponing(true)}>
                延期
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
