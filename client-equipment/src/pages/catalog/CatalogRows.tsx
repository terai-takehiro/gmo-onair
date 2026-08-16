/**
 * ケーブル・コネクタの表頭と行 (v4)
 *
 * 列幅は7段 (56 / 72 / 96 / 128 / 160 / 200 / 240) だけを使い、
 * `<RowSlot>` に入れて**値が無い行でも列が保たれる**ようにしています。
 * 以前は 10 列を `<td>` で手書きし、列の出し入れを利用者ごとに保存していたため、
 * 同じ台帳を2人で見ると列の並びが違いました。
 *
 * ── ケーブルとコネクタは1枚の表（モックどおり）──────────────
 *
 * 先頭の列は**種別**（ケーブル／コネクタ）です。用途（映像・音声…）は
 * モックの表に無いので出さず、絞り込みのチップに残してあります。
 * コネクタは m と 色 を持たないので `—` を出します。**列ごと消しません** —
 * 消すと行ごとに列の位置がずれて、数字が縦にそろわなくなります。
 */
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Button } from '@/components/ui/button';
import { CONFIG_BY_SOURCE, SOURCE_TONE, type SupplyItem } from './types';
import { HIDE_UNTIL_WIDE } from '@/lib/rowVisibility';

export function CatalogRowHeader({ showActions }: { showActions: boolean }) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={72}>種別</RowSlot>
      <RowMain>商品名 ／ メーカー・型名</RowMain>
      <RowSlot w={56} align="right" className={HIDE_UNTIL_WIDE}>m</RowSlot>
      <RowSlot w={72} className={HIDE_UNTIL_WIDE}>色</RowSlot>
      <RowSlot w={160} className={HIDE_UNTIL_WIDE}>設置場所</RowSlot>
      <RowSlot w={96} className={HIDE_UNTIL_WIDE}>収納方法</RowSlot>
      <RowSlot w={96} align="right">本数・個数</RowSlot>
      {showActions && <RowSlot w={96} align="right">{''}</RowSlot>}
    </RowHeader>
  );
}

export function CatalogRow({
  item, canEdit, canDelete, onEdit, onCopy, onDelete,
}: {
  item: SupplyItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (it: SupplyItem) => void;
  onCopy: (it: SupplyItem) => void;
  onDelete: (it: SupplyItem) => void;
}) {
  const showActions = canEdit || canDelete;
  const config = CONFIG_BY_SOURCE[item.source];
  const hasLength = config.hasLength;
  const length = item.length_m == null || item.length_m === '' ? null : String(item.length_m);

  return (
    <Row divider interactive stackOnMobile>
      <RowSlot w={72}>
        <TableBadge label={config.label} w={null} className={SOURCE_TONE[item.source]} />
      </RowSlot>

      <RowMain>
        <RowTitle>{item.name}</RowTitle>
        <RowSub>
          {[item.manufacturer_name, item.model_number].filter(Boolean).join(' ・ ') || '型名なし'}
        </RowSub>
      </RowMain>

      <RowSlot w={56} align="right" hideOnMobile className={HIDE_UNTIL_WIDE}>
        {hasLength
          ? (length && <span className="font-number text-sub-sm text-secondary-foreground">{length}</span>)
          : <span className="text-sub-sm text-fg-disabled">—</span>}
      </RowSlot>
      <RowSlot w={72} hideOnMobile className={HIDE_UNTIL_WIDE}>
        {hasLength
          ? (item.color && <span className="truncate text-sub-sm text-secondary-foreground">{item.color}</span>)
          : <span className="text-sub-sm text-fg-disabled">—</span>}
      </RowSlot>

      <RowSlot w={160} hideOnMobile className={HIDE_UNTIL_WIDE}>
        {item.location_name && (
          <span className="truncate text-sub-sm text-secondary-foreground">{item.location_name}</span>
        )}
      </RowSlot>

      <RowSlot w={96} hideOnMobile className={HIDE_UNTIL_WIDE}>
        {item.storage_method && (
          <span className="truncate text-sub-sm text-muted-foreground">{item.storage_method}</span>
        )}
      </RowSlot>

      <RowSlot w={96} align="right">
        <span className="font-number text-list">{Number(item.quantity ?? 0).toLocaleString('ja-JP')}</span>
        <span className="ml-1 text-sub-sm text-muted-foreground">{config.unit}</span>
      </RowSlot>

      {showActions && (
        <RowSlot w={96} align="right" placeholder="">
          <span className="flex gap-0.5">
            {canEdit && (
              <Button variant="ghost" size="icon-sm" onClick={() => onCopy(item)} aria-label={`${item.name} を写して足す`}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
            {canEdit && (
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(item)} aria-label={`${item.name} を直す`}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost" size="icon-sm" className="text-destructive"
                onClick={() => onDelete(item)} aria-label={`${item.name} を消す`}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </span>
        </RowSlot>
      )}
    </Row>
  );
}
