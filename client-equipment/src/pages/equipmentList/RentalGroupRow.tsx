/**
 * 貸出機材の1つの塊 (型番ごと) と、開いたときの1台ずつの行。
 */
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Button } from '@/components/ui/button';
import { CONDITION_LABELS, TYPE_LABELS } from '@/lib/constants';
import { HIDE_UNTIL_WIDE } from '@/lib/rowVisibility';
import { UNIT_STATUS_LABELS, UNIT_STATUS_TONE, type ModelGroup } from './rentalTypes';

export function RentalGroupRow({
  group, measureKey, expanded, showCategory, onToggle, onEditRental, onOpenUnit,
}: {
  group: ModelGroup;
  /**
   * 高さを覚えるときの鍵（`rentalRowKey`）。**開いているかどうかを含む。**
   * 見えている塊だけ描くので、`useVarRowWindow` はこの鍵で実寸を覚えます。
   * 型番だけを鍵にすると、閉じたあとも開いたときの高さを使い続けます。
   */
  measureKey: string;
  expanded: boolean;
  /** カテゴリの見出しが上に出ているときは、行にカテゴリを重ねて出さない */
  showCategory: boolean;
  onToggle: () => void;
  onEditRental: () => void;
  onOpenUnit: (id: string) => void;
}) {
  const repair = group.units.filter((u) => u.status === 'in_repair').length;
  const active = group.units.filter((u) => u.status === 'active').length;
  const displayName = group.rental_display_name || group.name;
  const renamed = !!group.rental_display_name && group.rental_display_name !== group.name;

  return (
    <div data-eq-row data-eq-key={measureKey} className="rounded-card border border-border bg-card">
      <Row interactive stackOnMobile>
        <RowSlot w={56} align="center">
          <button
            type="button"
            className="min-h-tap flex w-full items-center justify-center text-muted-foreground lg:min-h-[36px]"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${displayName} の内訳を${expanded ? '閉じる' : '開く'}`}
          >
            {expanded
              ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
              : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </RowSlot>

        <RowMain>
          <RowTitle>
            {displayName}
            {renamed && <span className="ml-1.5 text-sub text-muted-foreground">({group.name})</span>}
          </RowTitle>
          <RowSub>
            {[group.manufacturer_name, group.model_number].filter(Boolean).join(' ・ ') || '型名なし'}
          </RowSub>
        </RowMain>

        {/*
          カテゴリの名前は**利用者が設定で作る文字**なので、長さに上限がありません。
          `RowSlot` は `shrink-0` なので、はみ出したぶんは**隣の列の上に重なります** —
          切れて読めないより、隣に重なって**両方**読めないほうが悪いので切ります。
          128 にしてあるのは、この行は伸びる列（商品名）が広く**32px 削っても困らない**
          一方で、96 だと和文5字から切れ始めるため。全文は `title` で読めます。
        */}
        <RowSlot
          w={128}
          hideOnMobile
          className={`overflow-hidden ${HIDE_UNTIL_WIDE}`}
          title={group.rental_category_name || undefined}
        >
          {!showCategory && group.rental_category_name && (
            <TableBadge
              label={group.rental_category_name}
              w={null}
              className="bg-muted text-muted-foreground border-transparent"
            />
          )}
        </RowSlot>

        {/*
          ⚠️ **72px では「ネットワーク」が収まりません**（実測 87.6px。
          `TableBadge` が幅を固定するのは和文4字までで、6字は自然幅になる）。
          機材の台帳の「種別」と同じ壊れ方をしていたので、同じく1段上げる。
        */}
        <RowSlot w={96} hideOnMobile className={`overflow-hidden ${HIDE_UNTIL_WIDE}`}>
          <TableBadge
            label={TYPE_LABELS[group.equipment_type_code] ?? group.equipment_type_code}
            w={null}
            className="bg-primary-surface-weak text-primary border-transparent"
          />
        </RowSlot>

        <RowSlot w={72} align="right">
          <span className="font-number text-list">{group.total_count}</span>
          <span className="ml-1 text-sub-sm text-muted-foreground">台</span>
        </RowSlot>

        <RowSlot w={96}>
          {repair > 0 ? (
            <TableBadge label={`修理中 ${repair}`} w={null} className="bg-warning-surface text-warning border-transparent" />
          ) : active === group.total_count && group.total_count > 0 ? (
            <TableBadge label="全台稼働" w={null} className="bg-success-surface text-success border-transparent" />
          ) : null}
        </RowSlot>

        <RowSlot w={56} align="right" placeholder="">
          <Button variant="ghost" size="icon-sm" onClick={onEditRental} aria-label={`${displayName} の貸出の出しかたを直す`}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </RowSlot>
      </Row>

      {expanded && (
        <div className="border-t border-border">
          {group.units.map((u, i) => (
            <div key={u.id}>
              <Row divider interactive stackOnMobile onClick={() => onOpenUnit(u.id)}>
                <RowSlot w={72}>
                  <span className="font-number text-sub">
                    {u.unit_number != null ? `No.${u.unit_number}` : `#${i + 1}`}
                  </span>
                </RowSlot>
                <RowMain>
                  <RowTitle>{[u.location_name, u.location_detail].filter(Boolean).join(' ／ ') || '置き場所なし'}</RowTitle>
                  <RowSub>{u.eq_code}{u.serial_number ? ` ・ ${u.serial_number}` : ''}</RowSub>
                </RowMain>
                <RowSlot w={96}>
                  <TableBadge
                    label={UNIT_STATUS_LABELS[u.status] ?? u.status}
                    w={null}
                    className={UNIT_STATUS_TONE[u.status] ?? 'bg-muted text-muted-foreground border-transparent'}
                  />
                </RowSlot>
                <RowSlot w={72} hideOnMobile>
                  <span className="text-sub-sm text-muted-foreground">
                    {CONDITION_LABELS[u.condition] ?? u.condition ?? ''}
                  </span>
                </RowSlot>
              </Row>
              {(u.children?.length ?? 0) > 0 && (
                <p className="flex flex-wrap gap-x-4 gap-y-0.5 bg-muted px-4 py-1.5 text-sub-sm text-muted-foreground">
                  {u.children.filter((c) => c?.id).map((c) => (
                    <span key={c.id}>↳ {c.name ?? '?'}{c.unit_number != null ? ` No.${c.unit_number}` : ''}</span>
                  ))}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
