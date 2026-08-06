/**
 * ケーブル・コネクタの表頭と行 (v4)
 *
 * 列幅は7段 (56 / 72 / 96 / 128 / 160 / 200 / 240) だけを使い、
 * `<RowSlot>` に入れて**値が無い行でも列が保たれる**ようにしています。
 * 以前は 10 列を `<td>` で手書きし、列の出し入れを利用者ごとに保存していたため、
 * 同じ台帳を2人で見ると列の並びが違いました。
 */
import { Copy, Pencil, Trash2 } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Button } from '@/components/ui/button';
import { KIND_LABELS, KIND_TONE, type CatalogConfig, type CatalogItem } from './types';

export function CatalogRowHeader({ config, showActions }: { config: CatalogConfig; showActions: boolean }) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={72}>用途</RowSlot>
      <RowMain>商品名 ／ メーカー・型名</RowMain>
      {config.hasLength && <RowSlot w={56} align="right">m</RowSlot>}
      {config.hasLength && <RowSlot w={72}>色</RowSlot>}
      <RowSlot w={160}>設置場所</RowSlot>
      <RowSlot w={96}>収納方法</RowSlot>
      <RowSlot w={96} align="right">{config.unit}数</RowSlot>
      {showActions && <RowSlot w={96} align="right">{''}</RowSlot>}
    </RowHeader>
  );
}

export function CatalogRow({
  config, item, canEdit, canDelete, onEdit, onCopy, onDelete,
}: {
  config: CatalogConfig;
  item: CatalogItem;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (it: CatalogItem) => void;
  onCopy: (it: CatalogItem) => void;
  onDelete: (it: CatalogItem) => void;
}) {
  const showActions = canEdit || canDelete;
  const length = item.length_m == null || item.length_m === '' ? null : String(item.length_m);

  return (
    <Row divider interactive stackOnMobile>
      <RowSlot w={72}>
        <TableBadge
          label={KIND_LABELS[item.kind] ?? item.kind}
          w={null}
          className={KIND_TONE[item.kind] ?? KIND_TONE.other}
        />
      </RowSlot>

      <RowMain>
        <RowTitle>{item.name}</RowTitle>
        <RowSub>
          {[item.manufacturer_name, item.model_number].filter(Boolean).join(' ・ ') || '型名なし'}
        </RowSub>
      </RowMain>

      {config.hasLength && (
        <RowSlot w={56} align="right" hideOnMobile>
          {length && <span className="font-number text-sub-sm text-secondary-foreground">{length}</span>}
        </RowSlot>
      )}
      {config.hasLength && (
        <RowSlot w={72} hideOnMobile>
          {item.color && <span className="truncate text-sub-sm text-secondary-foreground">{item.color}</span>}
        </RowSlot>
      )}

      <RowSlot w={160} hideOnMobile>
        {item.location_name && (
          <span className="truncate text-sub-sm text-secondary-foreground">{item.location_name}</span>
        )}
      </RowSlot>

      <RowSlot w={96} hideOnMobile>
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
