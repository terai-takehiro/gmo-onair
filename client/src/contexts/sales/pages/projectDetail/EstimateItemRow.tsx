/**
 * 見積の明細1行（並べ替え対応）
 *
 * `EstimateItems.tsx` から**行の見た目だけ**を切り出したもの。`useSortable` を
 * 呼ぶには行ごとに別のコンポーネントである必要がある（`.map()` の中で直接呼ぶと、
 * 明細の増減のたびにフックの呼び出し回数が変わって React が落ちる — Kanban の
 * `KanbanCard.tsx` と同じ理由）。計算・保存の判断は一切持たない
 * （すべて呼ぶ側から渡された `it` と関数を使うだけ）。
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, CopyCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import type { EstimateItemRow as ItemData } from './EstimateItems';

export function EstimateItemRowView({
  id, it, i, locked, onUpdate, onDelete, onCopyPeriod,
}: {
  id: string;
  it: ItemData;
  i: number;
  locked: boolean;
  onUpdate: (i: number, patch: Partial<ItemData>) => void;
  onDelete: (i: number) => void;
  onCopyPeriod: (i: number) => void;
}) {
  // **編集できないとき（送付済み・閲覧のみ）はドラッグも並べ替えられない。**
  // `disabled` にするとハンドルを出さない側と揃う（`locked` の間はそもそも列を描かない）
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: locked });

  // `Row` は素の関数コンポーネント（`forwardRef` ではない）なので、
  // dnd-kit の `setNodeRef` は1枚外側の `div` に付ける
  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
    <Row divider stackOnMobile align="center">
      {!locked && (
        <RowSlot w={56} align="center">
          <Button
            {...attributes} {...listeners}
            type="button" variant="ghost" size="sm"
            className="cursor-grab touch-none active:cursor-grabbing"
            aria-label="ドラッグして並べ替え"
            title="ドラッグして並べ替え"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </Button>
        </RowSlot>
      )}
      <RowMain>
        <Input value={it.description} disabled={locked} placeholder="品目"
          onChange={(e) => onUpdate(i, { description: e.target.value })} />
        {(!locked || it.item_notes) && (
          <Input value={it.item_notes ?? ''} disabled={locked} placeholder="この行の備考"
            aria-label="この行の備考"
            className="mt-1 text-sub-sm"
            onChange={(e) => onUpdate(i, { item_notes: e.target.value })} />
        )}
      </RowMain>
      <RowSlot w={96}>
        {/* 数量と単位を同居させる（375px 対応で列を増やさない・要望②）。
            数量は整数のみ（サーバーの `estimate_items.quantity` が INTEGER 列）。
            単位は自由入力＋よく使う4つを候補に出す（`<datalist>`） */}
        <div className="flex w-full flex-col gap-1">
          <Input type="number" step={1} min={0} value={it.quantity} disabled={locked} aria-label="数量"
            onChange={(e) => onUpdate(i, { quantity: Math.round(Number(e.target.value)) || 0 })} />
          <Input value={it.unit ?? ''} disabled={locked} placeholder="単位" aria-label="数量の単位"
            list="estimate-item-units" className="text-sub-sm"
            onChange={(e) => onUpdate(i, { unit: e.target.value || null })} />
        </div>
      </RowSlot>
      <RowSlot w={128}>
        <div className="flex w-full flex-col gap-0.5">
          <Input type="number" value={it.unit_price} disabled={locked} aria-label="単価（税抜・1件あたり）"
            onChange={(e) => onUpdate(i, { unit_price: Number(e.target.value) || 0 })} />
          {/*
            **定価と値引き額を並べて出す（グループ内見積でも・要望③）。**
            `list_unit_price`（定価）は料金表から選んだ行にだけ入る。実額
            （`unit_price`）を手で下げても定価との差が自動で見える — 保存のたびに
            計算し直さなくても、単価欄を見ればいくら値引きしたか分かる
          */}
          {it.list_unit_price != null && it.list_unit_price > it.unit_price && (
            <p className="flex flex-wrap items-baseline gap-x-1 text-sub-sm leading-tight text-muted-foreground">
              <span>定価</span>
              <Money value={it.list_unit_price} inline />
              <span>／値引き</span>
              <Money value={it.list_unit_price - it.unit_price} inline className="text-warning" />
            </p>
          )}
        </div>
      </RowSlot>
      <RowSlot w={128}>
        <Input type="number" value={it.cost} disabled={locked} aria-label="仕入（見込み・実際の仕入とは別）"
          onChange={(e) => onUpdate(i, { cost: Number(e.target.value) || 0 })} />
      </RowSlot>
      <RowSlot w={128}>
        <Input type="date" value={it.item_date ?? ''} disabled={locked} aria-label="この行の開始日"
          onChange={(e) => onUpdate(i, { item_date: e.target.value || null })} />
      </RowSlot>
      <RowSlot w={128}>
        <Input type="date" value={it.item_date_end ?? ''} disabled={locked} aria-label="この行の終了日（任意）"
          min={it.item_date ?? undefined}
          onChange={(e) => onUpdate(i, { item_date_end: e.target.value || null })} />
      </RowSlot>
      {!locked && (
        <RowSlot w={56} align="center">
          {/* 要望①: 1行に入れた期間（開始・終了）をボタン1つで他の全行へ */}
          <Button variant="ghost" size="sm" aria-label="この行の期間を全ての行にコピー"
            title="この行の期間（開始・終了）を全ての行にコピー"
            onClick={() => onCopyPeriod(i)}>
            <CopyCheck className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </Button>
        </RowSlot>
      )}
      <Money value={it.amount} className="text-sub w-32 shrink-0" />
      {!locked && (
        <RowSlot w={56} align="right">
          <Button variant="ghost" size="sm" aria-label="この行を消す" onClick={() => onDelete(i)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
          </Button>
        </RowSlot>
      )}
    </Row>
    </div>
  );
}
