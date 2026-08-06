/**
 * 料金表の分類1つぶん (v4 ⑧)
 *
 * 列は**モックの並びそのまま**、幅だけ7段 (`SlotWidth`) に寄せています:
 *
 *   品目 ／ 補足     伸びる (`RowMain`)     モック flex:1
 *   数え方           96px (`RowSlot`)       モック 88px
 *   定価             128px (`MoneyCell`)    モック 104px
 *   グループ内       128px (`MoneyCell`)    モック 112px
 *   操作             128px (`RowSlot`)      モック 128px
 *
 * ── 「設定なし」を「¥0」と見せない ──────────────────────────
 *
 * `unit_price` が NULL の品目は**その相手には出さない**という意味で、
 * 0円とはまったく別です。`<Money>` は null を「—」にするので、
 * その下に小さく「設定なし」と添えて取り違えを防ぎます。
 */
import { Pencil, Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { CalcTypeLabels, type PricingCategory, type PricingItem } from '@/types';

/**
 * 値段の欄。**NULL は「—」ではなく「設定なし」**、0 は「¥0」。
 *
 * `muted` はグループ内価格用。**2つの金額列が隣り合っている**ので、
 * どちらも同じ濃さだと 1 つの長い数字に見えます (実ブラウザで確認)。
 * 定価を主・グループ内を副にして、目が列を切り分けられるようにします。
 */
function Price({ value, width, muted }: { value: number | null | undefined; width: 128; muted?: boolean }) {
  if (value === null || value === undefined) {
    return (
      <RowSlot w={width} align="right">
        <span className="text-sub-sm text-muted-foreground">設定なし</span>
      </RowSlot>
    );
  }
  return <MoneyCell value={value} width={width} className={muted ? 'text-secondary-foreground' : undefined} />;
}

export function CategoryCard({
  category, items, canEditCategory, canEditItem, canDeleteItem,
  first, last, onMove, onRename, onDelete, onAddItem, onEditItem, onDeleteItem,
}: {
  category: PricingCategory;
  /** 絞り込み後の品目。**category.items ではなくこちらを描く** */
  items: PricingItem[];
  canEditCategory: boolean;
  canEditItem: boolean;
  canDeleteItem: boolean;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onRename: () => void;
  onDelete: () => void;
  onAddItem: () => void;
  onEditItem: (item: PricingItem) => void;
  onDeleteItem: (item: PricingItem) => void;
}) {
  const total = category.items?.length ?? 0;

  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-border-subtle bg-surface-subtle px-4 py-2.5 lg:px-5">
        <h2 className="text-cardtitle">{category.name}</h2>
        <span className="font-number text-sub text-muted-foreground">
          {items.length === total ? `${total} 品目` : `${items.length} / ${total} 品目`}
        </span>
        <div className="flex-1" />
        {canEditItem && (
          <Button variant="outline" onClick={onAddItem}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />品目を足す
          </Button>
        )}
        {canEditCategory && (
          <>
            {/* 並べ替えは ↑↓。**数字を入力させない** (同じ値を入れると並びが不定になる) */}
            <Button variant="ghost" size="icon" disabled={first} onClick={() => onMove(-1)} aria-label={`${category.name} を上へ`}>
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" disabled={last} onClick={() => onMove(1)} aria-label={`${category.name} を下へ`}>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onRename} aria-label={`${category.name} の名前を変える`}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`${category.name} を消す`}>
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title={total === 0 ? 'この分類にはまだ品目がありません' : '探している言葉に当たる品目がありません'}
            description={total === 0 ? '「品目を足す」から入れてください。' : '言葉を短くするか、消してみてください。'}
          />
        </div>
      ) : (
        <>
          <RowHeader className="hidden sm:flex">
            <RowMain>品目 ／ 補足</RowMain>
            <RowSlot w={96}>数え方</RowSlot>
            <RowSlot w={128} align="right">定価</RowSlot>
            <RowSlot w={128} align="right">グループ内</RowSlot>
            <RowSlot w={128} align="right" />
          </RowHeader>
          {items.map((item) => (
            <Row key={item.id} divider stackOnMobile>
              <RowMain>
                <RowTitle>{item.name}</RowTitle>
                {item.sub_label && <RowSub>{item.sub_label}</RowSub>}
              </RowMain>
              <RowSlot w={96}>
                <span className="text-sub-sm text-muted-foreground">{CalcTypeLabels[item.calc_type]}</span>
              </RowSlot>
              <Price value={item.unit_price} width={128} />
              <Price value={item.group_price} width={128} muted />
              <RowSlot w={128} align="right">
                {canEditItem && (
                  <span className="flex items-center justify-end gap-1">
                    <Button variant="outline" onClick={() => onEditItem(item)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />直す
                    </Button>
                    {canDeleteItem && (
                      <Button variant="ghost" size="icon" onClick={() => onDeleteItem(item)} aria-label={`${item.name} を消す`}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </Button>
                    )}
                  </span>
                )}
              </RowSlot>
            </Row>
          ))}
        </>
      )}
    </section>
  );
}
