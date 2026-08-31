/**
 * やり取りの1件の「次にやること」の枠（`ThreadCard` から切り出し）
 *
 * ⚠️ **`ThreadCard.tsx` から出したのは行数のため**（1か所直すのに 400 行以上を
 * 読む形をやめる・`scripts/check-file-size.mjs`）。中身と決めごとは動かしていない。
 */
import { ArrowRight } from 'lucide-react';
import { InlineText } from '@gmo-onair/shared/src/client-v4/richContent';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { ActivityLog } from '../types';
/**
 * 「済み」の理由の言い方は **営業活動記録と同じ1本**（`autoClosedLabel`）。
 * ここに写すと、同じ行がやり取りタブと一覧で違う言葉になる。
 */
import { autoClosedLabel } from '../../activityLog/types';
import { shortYmd } from './format';
import { parseNextAction } from './nextAction';

/**
 * 次にやること。
 *
 * **色を使う枠はここだけ。** 複数の枠に色を付けると、どれが行動なのか読めない。
 * 期限切れは赤にする（概要タブのダイジェストと同じ判定 — 片方だけ灰色だと手遅れに気づけない）。
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
 */
export function NextAction({ a, overdue }: { a: ActivityLog; overdue: boolean }) {
  const na = parseNextAction(a.next_action);
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
          {/*
            ⚠️ **機械が閉じたものを「済み」と書かない**（migration 245）。
            案件が失注・完了に入ると、その案件のやることは自動で閉じる —
            **誰も片づけていない**ので「済み」は嘘になる。理由まで書いておけば、
            案件を戻せば開き直ることも察しがつく。改行させないので `whitespace-nowrap`
          */}
          {a.next_action_done_at && (
            <span className="text-sub ml-2 whitespace-nowrap text-muted-foreground">
              {autoClosedLabel(a.next_action_auto_closed_reason) ?? '済み'}
            </span>
          )}
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
      </div>
    </div>
  );
}