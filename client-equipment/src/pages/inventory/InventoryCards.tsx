/**
 * ⑤ 棚卸し — 一覧（回を選ぶ画面）のスマホ版カード積み
 *
 * 監査（`docs/v4-native-ui-audit-2026-08-20.md` ⑤棚卸し）の指摘:
 * 「一覧画面（InventoryPage.tsx）自体は棚卸し「回」を選ぶだけの素の Row リストで、
 * 詳細に入って初めてネイティブ品質になる（一覧との差が大きい）」を受けて、
 * PC の罫線区切りリスト（`InventoryPage.tsx` の `Row`）とは別に、スマホだけ
 * 独立したカードを積む形にした。**PC の行を縮めたものではない**
 * （`production/pages/holds/HoldCards.tsx` / `lending/LendingCards.tsx` と同じ考え方）。
 *
 * カード自体を押すと詳細（チェックリスト）を開く。「削除」だけ別の操作として
 * 右上の鉛筆位置に置く — 指で押し間違えて棚卸し1回ぶんを丸ごと消さないよう、
 * ゴミ箱は他の情報から離した右上に寄せている。
 *
 * ── 左スワイプでも消せる（M11） ─────────────────────────────
 *
 * 下の「削除」ボタンはそのまま残し、**もう1つの入り口**として
 * `SwipeAction` で包んだ。新しい業務ロジックは増やしていない — 呼ぶのは
 * 既存の `onDelete` と同じ関数
 */
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { SwipeAction } from '@gmo-onair/shared/src/client-v4/swipeAction';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { INVENTORY_STATUS, statusOf } from '@gmo-onair/shared/src/constants/statuses';

interface InventoryCheck {
  id: string;
  title: string;
  check_date: string;
  status: string;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-transparent',
  in_progress: 'bg-info-surface text-info border-transparent',
  completed: 'bg-success-surface text-success border-transparent',
};

export function InventoryCards({
  checks, onOpen, onDelete, deletePending,
}: {
  checks: InventoryCheck[];
  onOpen: (id: string) => void;
  onDelete: (c: InventoryCheck) => void;
  deletePending: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {checks.map((c) => (
        <SwipeAction
          key={c.id}
          actions={deletePending ? [] : [
            { label: '削除', icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: 'danger', onAction: () => onDelete(c) },
          ]}
        >
          <div className="rounded-card flex flex-col gap-2.5 border border-border bg-card p-3.5">
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className="flex min-w-0 items-start gap-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="text-list block font-bold [overflow-wrap:anywhere]">{c.title}</span>
                <span className="text-sub mt-0.5 block text-muted-foreground">{c.check_date}</span>
              </span>
              <TableBadge
                label={statusOf(INVENTORY_STATUS, c.status).label}
                w={null}
                className={cn('shrink-0', STATUS_TONE[c.status] ?? STATUS_TONE.draft)}
              />
            </button>

            <div className="flex gap-2 border-t border-border pt-2.5">
              <Button className="flex-1" onClick={() => onOpen(c.id)}>開く</Button>
              <Button
                variant="outline" size="icon" className="text-destructive"
                aria-label={`${c.title} を削除`} disabled={deletePending}
                onClick={() => onDelete(c)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </SwipeAction>
      ))}
    </div>
  );
}
