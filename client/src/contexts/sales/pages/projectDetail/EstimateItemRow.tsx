/**
 * 見積の明細1行（並べ替え対応）
 *
 * `EstimateItems.tsx` から**行の見た目だけ**を切り出したもの。`useSortable` を
 * 呼ぶには行ごとに別のコンポーネントである必要がある（`.map()` の中で直接呼ぶと、
 * 明細の増減のたびにフックの呼び出し回数が変わって React が落ちる — Kanban の
 * `KanbanCard.tsx` と同じ理由）。計算・保存の判断は一切持たない
 * （すべて呼ぶ側から渡された `it` と関数を使うだけ）。
 */
import { useCallback, useLayoutEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, CopyCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import type { EstimateItemRow as ItemData } from './EstimateItems';

export function EstimateItemRowView({
  id, it, i, locked, allowListPriceEdit, onUpdate, onDelete, onCopyPeriod,
}: {
  id: string;
  it: ItemData;
  i: number;
  locked: boolean;
  /**
   * `list_unit_price`（定価）を編集できるフィールドにするか（仕様変更 #9）。
   * **グループ内案件（`projects.customer_type === 'internal'`）の見積で `true`**
   * （判断は `EstimateItems.tsx` が案件の `customer_type` から決める）。
   * グループ外の案件では今までどおり表示専用 — 定価は料金表選択時に自動で入る値で、
   * 定価＝単価なので編集欄を出す意味が無い。
   *
   * ⚠️ **「グループ内案件」＝「プロジェクト管理(GPM)」ではない。** v4.5.19 は
   * ここを取り違えて GPM の見積タブからしか有効にしておらず、案件管理の見積タブでは
   * 定価の欄が1つも出ていなかった（ユーザー報告「修正されていない」の中身）。
   */
  allowListPriceEdit?: boolean;
  onUpdate: (i: number, patch: Partial<ItemData>) => void;
  onDelete: (i: number) => void;
  onCopyPeriod: (i: number) => void;
}) {
  // **編集できないとき（送付済み・閲覧のみ）はドラッグも並べ替えられない。**
  // `disabled` にするとハンドルを出さない側と揃う（`locked` の間はそもそも列を描かない）
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: locked });

  // 備考（改行できる）の高さを中身に合わせる。**ふだんは1行**で、改行したぶんだけ伸びる
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const fitNotes = useCallback(() => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = 'auto';                     // 減ったときも縮むよう、測る前に一度戻す
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  // 打っている最中だけでなく、**保存後にサーバーの値で描き直されたとき・版を
  // 切り替えたとき**も合わせ直す（`onChange` だけだと1行の高さに戻ってしまう）
  useLayoutEffect(() => { fitNotes(); }, [fitNotes, it.item_notes, locked]);

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
          locked ? (
            /*
              **直せないときは入力欄ではなく素のテキストで出す。**
              `<input>` は値から CR/LF を落とすので、`Input disabled` のままだと
              改行入りの備考が「1行目2行目」と繋がって出る（改行を打てるように
              した時点で表に出てくる不具合なので、ここも同時に直す）。
              `whitespace-pre-wrap` で改行をそのまま見せ、`break-words` で
              長い1行が 375px の外へ突き抜けないようにする
            */
            <p className="text-sub-sm mt-1 whitespace-pre-wrap break-words text-muted-foreground">
              {it.item_notes}
            </p>
          ) : (
            /*
              **備考は改行できる**（9/2 要望）。`<input>` では改行そのものが打てないため
              `Textarea` にした（売上明細の備考は既に `Textarea`・そちらに揃えた）。
              ・`<form>` に包まれていないので **Enter はそのまま改行**（送信にならない）
              ・共通 `Textarea` の既定 `min-h-[80px]` を `min-h-0` で打ち消す
                （`cn()` は tailwind-merge なので後から渡したほうが勝つ）。
                打ち消さないと明細の全行が 80px になって表が縦に伸び切る
              ・高さは中身に合わせて伸ばす（`fitNotes`）。DB は TEXT・PDF は pdfkit が
                LF をそのまま改行として描くので、**ここを直すだけで見積書・
                検収書・請求書にも改行が出る**
            */
            <Textarea
              ref={notesRef}
              value={it.item_notes ?? ''}
              placeholder="この行の備考（Enter で改行できます）"
              aria-label="この行の備考"
              rows={1}
              className="text-sub-sm mt-1 min-h-0 resize-none overflow-hidden py-1 leading-snug"
              onChange={(e) => { onUpdate(i, { item_notes: e.target.value }); fitNotes(); }}
            />
          )
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
          {allowListPriceEdit ? (
            /*
              **グループ内案件の見積では、定価そのものを編集欄にする（仕様変更 #9）。**
              手入力の行（料金表を経由しない行）にも定価を持たせたい、という
              グループ内見積の要望。空欄に戻せば `null`（＝定価なし）に戻す —
              「定価が無い」と「定価＝0円」を混同しない（`shared/CLAUDE.md`
              「NULL＝決めていない」と同じ考え方）。
              ⚠️ **ここで入れた値は表示・PDF 印字専用のまま**（migration 261 の設計を
              壊さない）— 金額計算（`amount`・粗利・合計）には一切混ぜない。
            */
            <>
            <div className="flex items-center gap-1">
              <span className="shrink-0 text-sub-sm text-muted-foreground">定価</span>
              <Input
                type="number" disabled={locked}
                value={it.list_unit_price ?? ''}
                placeholder="任意"
                aria-label="定価（税抜・表示とPDF印字専用。金額計算には使いません）"
                className="text-sub-sm"
                onChange={(e) => {
                  const raw = e.target.value;
                  onUpdate(i, { list_unit_price: raw === '' ? null : Number(raw) || 0 });
                }}
              />
            </div>
            {/* 編集欄に変わっても**いくら引いているかは消さない**。グループ内の見積は
                まさにこの差額を見ながら作るので、下の読み取り専用の注記と同じ数を出す */}
            {it.list_unit_price != null && it.list_unit_price > it.unit_price && (
              <p className="text-sub-sm leading-tight text-muted-foreground">
                値引き <Money value={it.list_unit_price - it.unit_price} inline className="text-warning" />
              </p>
            )}
            </>
          ) : (
            /*
              **定価と値引き額を並べて出す（グループ内見積でも・要望③）。**
              `list_unit_price`（定価）は料金表から選んだ行にだけ入る。実額
              （`unit_price`）を手で下げても定価との差が自動で見える — 保存のたびに
              計算し直さなくても、単価欄を見ればいくら値引きしたか分かる
            */
            it.list_unit_price != null && it.list_unit_price > it.unit_price && (
              <p className="flex flex-wrap items-baseline gap-x-1 text-sub-sm leading-tight text-muted-foreground">
                <span>定価</span>
                <Money value={it.list_unit_price} inline />
                <span>／値引き</span>
                <Money value={it.list_unit_price - it.unit_price} inline className="text-warning" />
              </p>
            )
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
          <Button variant="ghost" size="sm" aria-label="この行を削除" onClick={() => onDelete(i)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
          </Button>
        </RowSlot>
      )}
    </Row>
    </div>
  );
}
