/**
 * 機材台帳の「機材」タブ ／ スマホ表示 (768px 未満)
 *
 * v4 対象化。前の形（`items` をそのままフラットに並べる・タップで詳細へ
 * 遷移するだけ）から3つ足しました — **設置場所でまとめる・付属品を開く・
 * 複数選ぶ**（監査 `docs/reviews/2026-08-20-mobile-optimization-audit.md`
 * の3「カスタム列・その場編集・親子の入れ子」のうち、その場編集を除く2つと、
 * 設計時にあわせて決めた設置場所グルーピング）。
 *
 * ── 見えている枚数だけ作る、は拠点ごとに引き継ぐ ────────────────
 *
 * 前のカードは `useRowWindow`（同じ高さの行）で間引いていましたが、
 * 開閉で高さが変わるカードにはこの式が使えません（開いたぶんだけ位置が
 * ずれる）。**貸出機材タブ**（`RentalPanel.tsx`）がすでに同じ問題を
 * 「拠点ならぬカテゴリごとに `useVarRowWindow`（可変高さ）を持つ」形で
 * 解いているので、そのまま倣います（`EquipmentLocationSection.tsx`）。
 * 見出しを間引きの外に出すことで、拠点を挟んでも位置計算が壊れません。
 *
 * ── その場編集はここに入れていない ──────────────────────────────
 *
 * PC の「表で直す」は**一覧全体を編集モードにして**入力欄に変えます。
 * カードは行の形が違うので同じ切り替えをそのまま使えず、タップの導線を
 * 別に作る必要があります。今回はカスタム列を読み取り専用で出すところまでで、
 * 押して直す導線は別の回に回しました。
 */
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { buildCardEntries, groupByLocation, type CardEntry } from './cardRowTypes';
import { EquipmentLocationSection } from './EquipmentLocationSection';
import type { EquipmentRecord, LocationRecord } from './types';

export function EquipmentCards({
  items, locations, onOpen, onDelete,
  expandedIds, childrenCache, loadingChildren, onToggleExpand,
  canBulkEdit, canDelete, selectedIds, onSelectOne,
  customColumns, visibleCustomCols, customValues,
}: {
  items: EquipmentRecord[];
  locations: LocationRecord[];
  onOpen: (id: string) => void;
  onDelete: (item: EquipmentRecord, parentId?: string) => void;
  expandedIds: Set<string>;
  childrenCache: Record<string, EquipmentRecord[]>;
  loadingChildren: Set<string>;
  onToggleExpand: (item: EquipmentRecord) => void;
  canBulkEdit: boolean;
  canDelete: boolean;
  selectedIds: Set<string>;
  onSelectOne: (id: string) => void;
  customColumns: CustomColumn[];
  visibleCustomCols: Set<string>;
  customValues: Record<string, Record<string, string>>;
}) {
  const entries = buildCardEntries(items, expandedIds, childrenCache, loadingChildren);
  const sections = groupByLocation(entries, locations);
  const showSectionHeaders = sections.length > 1;

  const handleDelete = (entry: CardEntry) => {
    // 「付属品も出す」で当たった子は `item.parent_id` を持つ。開いて出した
    // 付属品は `kids` に入っているのでここには来ない（親のカードごと消す）
    onDelete(entry.item, entry.item.parent_id ?? undefined);
  };

  return (
    <div className="flex flex-col gap-4 md:hidden">
      {sections.map((section) => (
        <EquipmentLocationSection
          key={section.id ?? '__none__'}
          section={section}
          showHeader={showSectionHeaders}
          loadingChildren={loadingChildren}
          onToggleExpand={(entry) => onToggleExpand(entry.item)}
          onOpen={onOpen}
          onDelete={handleDelete}
          canBulkEdit={canBulkEdit}
          canDelete={canDelete}
          selectedIds={selectedIds}
          onSelectOne={onSelectOne}
          customColumns={customColumns}
          visibleCustomCols={visibleCustomCols}
          customValues={customValues}
        />
      ))}
    </div>
  );
}
