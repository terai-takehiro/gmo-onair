/**
 * 機材台帳の表 (PC・768px 以上)。
 *
 * 親子の入れ子・まとめて選ぶ・その場編集・自分で作った列を同時に持つので
 * `<table>` のままにしてあります (v4 の第1段階＝分割)。
 * 色は共通のトークンに置き換え済みです。
 */
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, Copy, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import { COL_DEFS, type ColKey, type EquipmentRecord } from './types';
import { customCells, standardCells, type CellContext, type CustomCellContext } from './EquipmentCells';

function SortableTh({ label, sortKey, currentKey, currentDir, onSort }: {
  label: string; sortKey: string; currentKey: string | null; currentDir: 'asc' | 'desc'; onSort: (k: string) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th className="select-none whitespace-nowrap px-3 py-2.5 text-left">
      <button
        type="button"
        className={`inline-flex items-center gap-0.5 text-th ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {active
          ? currentDir === 'asc'
            ? <ArrowUp className="h-3 w-3" aria-hidden="true" />
            : <ArrowDown className="h-3 w-3" aria-hidden="true" />
          : <ChevronsUpDown className="h-3 w-3 text-fg-disabled" aria-hidden="true" />}
      </button>
    </th>
  );
}

export interface EquipmentTableProps {
  items: EquipmentRecord[];
  colOrder: ColKey[];
  visibleCols: Set<ColKey>;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  onSort: (k: string) => void;
  canBulkEdit: boolean;
  canEdit: boolean;
  canDelete: boolean;
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onSelectOne: (id: string, index: number, shiftKey: boolean) => void;
  expandedIds: Set<string>;
  childrenCache: Record<string, EquipmentRecord[]>;
  loadingChildren: Set<string>;
  onToggleExpand: (item: EquipmentRecord) => void;
  cellCtx: Omit<CellContext, 'py'>;
  customCtx: Omit<CustomCellContext, 'py'>;
  onOpen: (id: string) => void;
  onCopy: (item: EquipmentRecord) => void;
  onEdit: (item: EquipmentRecord) => void;
  onDelete: (item: EquipmentRecord, parentId?: string) => void;
}

export function EquipmentTable(p: EquipmentTableProps) {
  const visibleCustom = p.customCtx.columns.filter((c) => p.customCtx.visible.has(c.id));

  const actions = (item: EquipmentRecord, parentId?: string) => (
    <td className="whitespace-nowrap px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
      <span className="flex justify-end gap-0.5">
        {p.canEdit && (
          <Button variant="ghost" size="icon-sm" aria-label={`${item.name} を写して足す`} onClick={() => p.onCopy(item)}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {p.canEdit && (
          <Button variant="ghost" size="icon-sm" aria-label={`${item.name} を直す`} onClick={() => p.onEdit(item)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {p.canDelete && (
          <Button
            variant="ghost" size="icon-sm" className="text-destructive"
            aria-label={`${item.name} を消す`} onClick={() => p.onDelete(item, parentId)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </span>
    </td>
  );

  const cells = (item: EquipmentRecord, py: string, nameSuffix?: React.ReactNode) => (
    <>
      {standardCells(item, p.colOrder, p.visibleCols, { ...p.cellCtx, py }, nameSuffix)}
      {customCells(item, { ...p.customCtx, py })}
    </>
  );

  const idToItem = new Map(p.items.map((i) => [i.id, i]));
  const depthOf = (item: EquipmentRecord) => {
    let d = 0;
    let pid = item.parent_id;
    while (pid && idToItem.get(pid)?.parent_id) { d++; pid = idToItem.get(pid)?.parent_id; }
    return d;
  };

  return (
    <div className="hidden md:block">
      <div className="overflow-x-auto rounded-card border border-border bg-card">
        <table className="w-full border-collapse text-sub">
          <thead>
            <tr className="border-b border-border bg-surface-subtle">
              <th className="w-8 px-2 py-2.5" />
              {p.canBulkEdit && (
                <th className="w-8 px-2 py-2.5">
                  <EnhancedCheckbox
                    checked={
                      p.items.length > 0 && p.selectedIds.size === p.items.length
                        ? true
                        : p.selectedIds.size > 0 ? 'indeterminate' : false
                    }
                    onCheckedChange={p.onSelectAll}
                    aria-label="すべて選ぶ"
                  />
                </th>
              )}
              {p.colOrder.filter((k) => p.visibleCols.has(k)).map((key) => {
                const col = COL_DEFS.find((c) => c.key === key);
                if (!col) return null;
                return (
                  <SortableTh
                    key={col.key} label={col.label} sortKey={col.sortKey}
                    currentKey={p.sortKey} currentDir={p.sortDir} onSort={p.onSort}
                  />
                );
              })}
              {visibleCustom.map((col) => (
                <th key={col.id} className="whitespace-nowrap px-3 py-2.5 text-left text-th text-muted-foreground">
                  {col.name}
                  <span className="ml-1 text-note text-fg-disabled">{col.scope === 'shared' ? '共' : '個'}</span>
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2.5 text-right text-th text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-faint">
            {p.items.map((item, idx) => {
              const hasChildren = (item.children_count ?? 0) > 0;
              const isExpanded = p.expandedIds.has(item.id);
              const kids = p.childrenCache[item.id] ?? [];
              const loading = p.loadingChildren.has(item.id);
              const selected = p.selectedIds.has(item.id);

              // 「子機材も表示」でヒットした子は、親と並んでこの一覧に来る
              if (item.parent_id != null) {
                const depth = depthOf(item);
                return (
                  <tr
                    key={item.id}
                    className={`bg-muted ${p.cellCtx.editMode ? '' : 'cursor-pointer'} hover:bg-background`}
                    onClick={p.cellCtx.editMode ? undefined : () => p.onOpen(item.id)}
                  >
                    <td className="py-2 pr-1 text-sub-sm text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}>└</td>
                    {p.canBulkEdit && <td />}
                    {cells(item, 'py-2', item.parent_name
                      ? <span className="ml-1.5 rounded-badge-xs bg-muted px-1 py-0.5 text-note text-muted-foreground">← {item.parent_name}</span>
                      : undefined)}
                    {actions(item)}
                  </tr>
                );
              }

              return [
                <tr
                  key={item.id}
                  className={`${selected ? 'bg-primary-surface-weak' : ''} ${p.cellCtx.editMode ? '' : 'cursor-pointer'} hover:bg-background`}
                  onClick={p.cellCtx.editMode ? undefined : () => p.onOpen(item.id)}
                >
                  <td className="w-8 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    {hasChildren && (
                      <button
                        type="button"
                        aria-label={isExpanded ? `${item.name} の付属品を閉じる` : `${item.name} の付属品を開く`}
                        className="flex h-6 w-6 items-center justify-center rounded-control text-muted-foreground hover:bg-muted"
                        onClick={() => p.onToggleExpand(item)}
                      >
                        {loading
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          : isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                    )}
                  </td>
                  {p.canBulkEdit && (
                    <td className="w-8 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <EnhancedCheckbox
                        checked={selected}
                        aria-label={`${item.name} を選ぶ`}
                        onCheckedChange={() => { /* shift 押しは onClick で見る */ }}
                        onClick={(e) => p.onSelectOne(item.id, idx, (e as React.MouseEvent).shiftKey)}
                      />
                    </td>
                  )}
                  {cells(item, 'py-2', hasChildren
                    ? <span className="ml-1.5 rounded-chip bg-muted px-1.5 py-0.5 font-number text-note text-muted-foreground">{item.children_count}</span>
                    : undefined)}
                  {actions(item)}
                </tr>,
                ...(isExpanded ? kids.map((child) => (
                  <tr
                    key={child.id}
                    className={`bg-muted ${p.cellCtx.editMode ? '' : 'cursor-pointer'} hover:bg-background`}
                    onClick={p.cellCtx.editMode ? undefined : () => p.onOpen(child.id)}
                  >
                    <td className="py-1.5 pl-8 pr-1 text-sub-sm text-muted-foreground">└</td>
                    {p.canBulkEdit && <td />}
                    {cells(child, 'py-1.5')}
                    {actions(child, item.id)}
                  </tr>
                )) : []),
                ...(isExpanded && loading ? [(
                  <tr key={`${item.id}-loading`} className="bg-muted">
                    <td colSpan={99} className="px-6 py-2 text-sub-sm text-muted-foreground">
                      <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" aria-hidden="true" />付属品を読み込んでいます
                    </td>
                  </tr>
                )] : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
