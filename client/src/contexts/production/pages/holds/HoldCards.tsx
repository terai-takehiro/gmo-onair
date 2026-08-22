/**
 * ③ 仮押さえ — **スマホ版**（M10）
 *
 * ── なぜ作り直したか（390px で実測）────────────────────────
 *
 * PC の行は 「あと」72px ＋ 名前 ＋ 「本番日」96px ＋ 「決める」160px です。
 * スマホでは本番日だけ畳まれるので、**残り 150px に予定名と部屋が入る**ことになり、
 * `検証E 仮…` `WORLD S…` としか読めませんでした。
 * **何の予約か分からないまま「確定にする」を押させる**形です。
 *
 * → 縦に積みます。**読む（何の予約か）→ 決める（2つのボタン）** の順。
 *   ボタンは横に2つ並べて、下端の近くに置きます。
 *
 * ── 本番日はスマホでこそ出す ────────────────────────────────
 *
 * PC では `hideOnMobile` で畳んでいた列ですが、**外で見る人にいちばん要る数字**は
 * 「いつの予約か」です。「あと2日」だけだと、その2日後が何日なのか分かりません。
 *
 * ── 左スワイプで「確定にする」「落とす」の両方を出す（M11） ─────────
 *
 * 下端のボタンはそのまま残し、`SwipeAction` でもう1つの入り口を足した。
 * 呼ぶのは同じ `onFix` / `onDrop`（`onDrop` は確認ダイアログを挟む `askDrop` を
 * そのまま渡している）。**新しい業務ロジックは足していない** — 既にある2つの
 * ボタンに、もう1つの入り口（左スワイプ）を足すだけ。
 */
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { SwipeAction } from '@gmo-onair/shared/src/client-v4/swipeAction';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { leftTone, leftLabel, type HoldRow } from './holdLogic';

export function HoldCards({
  rows, canEdit, canDrop, busy, onFix, onDrop,
}: {
  rows: Array<HoldRow & { left: number }>;
  canEdit: boolean;
  canDrop: boolean;
  busy: boolean;
  onFix: (id: string) => void;
  onDrop: (b: HoldRow & { left: number }) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((b) => (
        <SwipeAction
          key={b.id}
          actions={busy ? [] : [
            ...(canEdit ? [{
              label: '確定', icon: <Check className="h-4 w-4" aria-hidden="true" />, tone: 'default' as const, onAction: () => onFix(b.id),
            }] : []),
            ...(canDrop ? [{
              label: '落とす', icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: 'danger' as const, onAction: () => onDrop(b),
            }] : []),
          ]}
        >
          <div
            className={cn(
              'rounded-card flex flex-col gap-2 border border-border p-3',
              b.left <= 7 ? 'bg-destructive-surface/40' : 'bg-card',
            )}
          >
            <div className="flex items-start gap-2.5">
              <TableBadge label={leftLabel(b.left)} w={null} className={cn('shrink-0', leftTone(b.left))} />
              <span className="min-w-0 flex-1">
                <span className="text-list block truncate font-bold">{b.title}</span>
                <span className="text-sub block text-muted-foreground">
                  {[
                    /* **本番日をスマホでは出す。**「あと2日」だけだと何日か分からない */
                    `${b.start_time.slice(5, 10).replace('-', '/')}`,
                    b.rooms?.map((r) => r.room_abbreviation || r.room_name).join(' ・ ') || '部屋なし',
                  ].join(' ・ ')}
                </span>
                {(b.gls_number || b.project_name) && (
                  <span className="text-sub block truncate text-muted-foreground">
                    {[b.gls_number, b.project_name].filter(Boolean).join(' ／ ')}
                  </span>
                )}
              </span>
            </div>

            {canEdit && (
              <div className="flex gap-2">
                <Button className="flex-1" disabled={busy} onClick={() => onFix(b.id)}>
                  <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />確定にする
                </Button>
                {canDrop && (
                  <Button variant="outline" className="flex-1" disabled={busy} onClick={() => onDrop(b)}>
                    <Trash2 className="mr-1.5 h-4 w-4 text-destructive" aria-hidden="true" />落とす
                  </Button>
                )}
              </div>
            )}
          </div>
        </SwipeAction>
      ))}
    </div>
  );
}
