/**
 * 機材台帳 ／ 機材 のカード1枚（スマホ）
 *
 * 中身は前の `EquipmentCards.tsx` のカードと同じです（種別バッジ・ID・商品名・
 * 型名／No・メーカー／保管場所・資産バッジ）。今回足したのは4つ:
 *
 *   ・**選ぶ四角**（`canBulkEdit` のときだけ、PC の表と同じ場所の役目）
 *   ・**開閉の矢印**（付属品があるときだけ。タップで `childrenCache` を取りに行く）
 *   ・**カスタム列の表示**（読み取り専用のプレビュー。直すのは下の鉛筆ボタンから）
 *   ・**鉛筆ボタン**（`canEdit` のときだけ）。PC の「操作」列の鉛筆と同じ役目で、
 *     押すと編集シート（`EquipmentDialog` ＝ `FormDialog`）が開き、標準の項目も
 *     カスタム列も直せる。カード本体のタップは元から詳細画面への入口なので、
 *     その役目とは分けてある（`EquipmentCards.tsx` 冒頭のコメント）
 *
 * カード全体を1つの `<button>` にしていた前の形は、四角や矢印を**中に持てない**
 * ので、外枠を `<div>` にして中に複数のタップ領域を並べる形に変えました
 * （`RentalGroupRow.tsx` と同じやり方）。
 *
 * ── 開いた付属品（子機材）にも鉛筆ボタンを付けた ────────────────
 *
 * 前は開いた付属品の行がタップで詳細画面に飛ぶだけで、その場で直す口が
 * 無かった（PC の表は子の行にも「操作」列があり、そちらは直せる）。
 * `onEdit` を「押されたら常に親を直す」で固定していたのをやめ、**どの
 * `EquipmentRecord` を渡されたかで対象が決まる**形にした。親の鉛筆は
 * `entry.item`、付属品の鉛筆は `kid` を渡すだけで、渡した先
 * （`EquipmentDialog`）は「渡された1件を直す」以上のことをしないので、
 * 親を編集したら子までまとめて書き換わる、という事故は起きない。
 */
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { TYPE_BORDER_COLOR } from '@/lib/constants';
import { AssetBadge, SectionBadge } from './badges';
import { visibleCustomEntries, type CardEntry } from './cardRowTypes';
import type { EquipmentRecord } from './types';

export function EquipmentCardRow({
  entry, measureKey, loading, onToggleExpand, onOpen, onDelete,
  canBulkEdit, canEdit, canDelete, selectedIds, onSelectOne, onEdit,
  customColumns, visibleCustomCols, customValues,
}: {
  entry: CardEntry;
  measureKey: string;
  loading: boolean;
  onToggleExpand: () => void;
  onOpen: (id: string) => void;
  onDelete: () => void;
  canBulkEdit: boolean;
  canEdit: boolean;
  canDelete: boolean;
  selectedIds: Set<string>;
  onSelectOne: (id: string) => void;
  /** 鉛筆ボタン → 編集シートを開く。渡した `EquipmentRecord` だけを直す
   *  （親カードの鉛筆は `entry.item`、開いた付属品の鉛筆は `kid` を渡す） */
  onEdit: (item: EquipmentRecord) => void;
  customColumns: CustomColumn[];
  visibleCustomCols: Set<string>;
  customValues: Record<string, Record<string, string>>;
}) {
  const { item } = entry;
  const hasChildren = (item.children_count ?? 0) > 0;
  const customEntries = visibleCustomEntries(item.id, customColumns, visibleCustomCols, customValues);

  return (
    <div
      data-eq-row
      data-eq-key={measureKey}
      className="overflow-hidden rounded-card border border-border bg-card"
      style={{ borderLeft: `3px solid ${TYPE_BORDER_COLOR[item.equipment_type_code ?? ''] ?? '#6b7280'}` }}
    >
      <div className="flex items-stretch">
        {hasChildren && (
          <button
            type="button"
            className="min-h-tap flex w-11 shrink-0 items-center justify-center text-muted-foreground"
            onClick={onToggleExpand}
            aria-expanded={entry.expanded}
            aria-label={`${item.name} の付属品を${entry.expanded ? '閉じる' : '開く'}`}
          >
            {entry.expanded
              ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
              : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}

        {canBulkEdit && (
          <label
            className="flex min-h-tap w-11 shrink-0 cursor-pointer items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <EnhancedCheckbox
              checked={selectedIds.has(item.id)}
              onCheckedChange={() => onSelectOne(item.id)}
              aria-label={`${item.name} を選ぶ`}
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className={`min-h-tap min-w-0 flex-1 py-2.5 text-left hover:bg-background ${hasChildren || canBulkEdit ? 'pr-3' : 'px-3'}`}
        >
          <span className="mb-1 flex items-center justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <SectionBadge typeCode={item.equipment_type_code} section={item.equipment_section} placeholder={false} />
              <span className="font-number text-sub-sm text-muted-foreground">{item.eq_code}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="block truncate text-list">
            {item.name}
            {hasChildren && (
              <span className="ml-1.5 rounded-chip bg-muted px-1.5 font-number text-note text-muted-foreground">
                {item.children_count}
              </span>
            )}
            {item.parent_name && (
              <span className="ml-1.5 rounded-badge-xs bg-muted px-1 text-note text-muted-foreground">
                ← {item.parent_name}
              </span>
            )}
          </span>
          <span className="block truncate text-sub-sm text-muted-foreground">
            {item.model_number || '型名なし'}{item.unit_number != null ? ` ／ No.${item.unit_number}` : ''}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sub-sm text-muted-foreground">
            {[item.manufacturer_name, item.location_name || item.location_detail].filter(Boolean).join(' ／ ')}
            {item.asset_class && <AssetBadge v={item.asset_class} />}
          </span>
        </button>

        {canEdit && (
          <button
            type="button"
            className="flex w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            aria-label={`${item.name} を編集`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        {canDelete && (
          <button
            type="button"
            className="flex w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label={`${item.name} を削除`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {customEntries.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-border bg-muted px-3 py-1.5 text-sub-sm text-muted-foreground">
          {customEntries.map((c) => <span key={c.label}>{c.label}: {c.text}</span>)}
        </p>
      )}

      {entry.expanded && (
        <div className="border-t border-border">
          {entry.kids.map((kid) => (
            <div key={kid.id} className="flex items-stretch border-b border-border-faint last:border-b-0">
              <button
                type="button"
                onClick={() => onOpen(kid.id)}
                className="min-h-tap flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-background"
              >
                <span className="min-w-0 truncate text-sub">
                  {kid.name}
                  {kid.model_number ? ` (${kid.model_number})` : ''}
                  {kid.unit_number != null ? ` No.${kid.unit_number}` : ''}
                </span>
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="flex w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-primary"
                  onClick={(e) => { e.stopPropagation(); onEdit(kid); }}
                  aria-label={`${kid.name} を編集`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {loading && <p className="px-3 py-2 text-sub-sm text-muted-foreground">読み込んでいます…</p>}
        </div>
      )}
    </div>
  );
}
