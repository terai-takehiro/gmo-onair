/**
 * 機材台帳の行 (PC・768px 以上)
 *
 * ── `<table>` から `<Row>` に載せ替えました ─────────────────
 *
 * `<table>` の列幅は**中身が決めます**。だから絞り込みを変えるたびに列が動き、
 * 同じ「種別」の列が画面によって違う幅になっていました。7段の固定幅に寄せると、
 * **出す列を変えても残った列は同じ位置のまま**になります。
 *
 * この一覧が持っている3つは**そのまま残しています**:
 *
 *   ・親子の入れ子   … 行の頭に段差を出す（`LEAD_W` の中で下げる）。
 *                      **列は親子で同じ位置** — 段差を列側に入れると子行だけずれる
 *   ・まとめて選ぶ   … `CHECK_W` の四角。行を押すのとは別（`stopPropagation`）
 *   ・その場編集     … `editMode` のとき入力欄に変わる（中身は1文字も変えていない）
 *
 * ── 横に長いときは行ごと流す ────────────────────────────────
 *
 * 既定の8列でも 1,300px を超えます。`RowMain`（商品名）は `flex-1` なので
 * 何もしないと**商品名だけが潰れて 0px** になります。
 * 内側に「固定列の合計 ＋ 商品名の最低幅」を `min-width` として持たせ、
 * 足りないときは**枠ごと横に流す**（列は潰さない）。
 *
 * ── そのぶん「操作」は右に貼り付ける ────────────────────────
 *
 * 流れる形にすると、**直す・消すが既定で画面の外**に出ます（毎日使う画面で
 * 横に送らないと押せないのは実質使えません）。操作の列だけ右端に貼り付けます。
 * **貼り付ける枠は下が透けてはいけない**ので、行ごとに背景の色を必ず持たせ、
 * 操作の枠は `bg-inherit` でその色を受け取ります（透明のままだと、
 * 横に送ったとき下を通る文字が操作ボタンに重なって読めなくなる）。
 */
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, Copy, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import {
  ACTION_W, CHECK_W, COL_DEFS, COL_W, CUSTOM_COL_W, LEAD_W, NAME_MIN_PX,
  type ColKey, type EquipmentRecord,
} from './types';
import { customCells, standardCells, type CellContext, type CustomCellContext } from './EquipmentCells';

function SortLabel({ label, sortKey, currentKey, currentDir, onSort }: {
  label: string; sortKey: string; currentKey: string | null; currentDir: 'asc' | 'desc'; onSort: (k: string) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <button
      type="button"
      className={`inline-flex min-w-0 items-center gap-0.5 ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="truncate">{label}</span>
      {active
        ? currentDir === 'asc'
          ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
          : <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        : <ChevronsUpDown className="h-3 w-3 shrink-0 text-fg-disabled" aria-hidden="true" />}
    </button>
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
  cellCtx: CellContext;
  customCtx: CustomCellContext;
  onOpen: (id: string) => void;
  onCopy: (item: EquipmentRecord) => void;
  onEdit: (item: EquipmentRecord) => void;
  onDelete: (item: EquipmentRecord, parentId?: string) => void;
}

export function EquipmentTable(p: EquipmentTableProps) {
  const visibleStd = p.colOrder.filter((k) => p.visibleCols.has(k));
  const visibleCustom = p.customCtx.columns.filter((c) => p.customCtx.visible.has(c.id));

  /**
   * 横に流し始める幅。**固定列の合計 ＋ 隙間 ＋ 商品名の最低幅**。
   * 商品名（`RowMain`）は幅を持たないので、ここで足しておかないと潰れる。
   */
  const fixed = LEAD_W
    + (p.canBulkEdit ? CHECK_W : 0)
    + visibleStd.reduce((n, k) => n + (k === 'name' ? 0 : COL_W[k as keyof typeof COL_W] ?? 0), 0)
    + visibleCustom.length * CUSTOM_COL_W
    + ACTION_W;
  const gaps = (1 + (p.canBulkEdit ? 1 : 0) + visibleStd.length + visibleCustom.length + 1) * 12;
  const minWidth = fixed + gaps + (visibleStd.includes('name') ? NAME_MIN_PX : 0);

  const actions = (item: EquipmentRecord, parentId?: string) => (
    <RowSlot
      w={ACTION_W}
      align="right"
      placeholder={null}
      className="sticky right-0 border-l border-border-faint bg-inherit pl-2"
      onClick={(e) => e.stopPropagation()}
    >
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
    </RowSlot>
  );

  const cells = (item: EquipmentRecord, nameSuffix?: React.ReactNode) => (
    <>
      {standardCells(item, p.colOrder, p.visibleCols, p.cellCtx, nameSuffix)}
      {customCells(item, p.customCtx)}
    </>
  );

  const idToItem = new Map(p.items.map((i) => [i.id, i]));
  const depthOf = (item: EquipmentRecord) => {
    let d = 0;
    let pid = item.parent_id;
    while (pid && idToItem.get(pid)?.parent_id) { d++; pid = idToItem.get(pid)?.parent_id; }
    return d;
  };

  /** 子の行。**列は親と同じ位置**で、段差は行の頭の中だけに出す */
  const childRow = (child: EquipmentRecord, depth: number, parentId?: string) => (
    <Row
      key={child.id}
      divider
      density="table"
      className={`bg-muted ${p.cellCtx.editMode ? '' : 'cursor-pointer hover:bg-background'}`}
      onClick={p.cellCtx.editMode ? undefined : () => p.onOpen(child.id)}
    >
      <RowSlot w={LEAD_W} align="right" placeholder={null}>
        <span className="text-sub-sm text-muted-foreground" style={{ paddingLeft: `${depth * 12}px` }}>└</span>
      </RowSlot>
      {p.canBulkEdit && <RowSlot w={CHECK_W} placeholder={null} />}
      {cells(child, child.parent_name
        ? <span className="rounded-badge-xs text-note ml-1.5 bg-muted px-1 py-0.5 text-muted-foreground">← {child.parent_name}</span>
        : undefined)}
      {actions(child, parentId)}
    </Row>
  );

  return (
    <div className="hidden md:block">
      <div className="rounded-card overflow-x-auto border border-border bg-card">
        <div style={{ minWidth: `${minWidth}px` }}>
          <RowHeader>
            <RowSlot w={LEAD_W} placeholder={null} />
            {p.canBulkEdit && (
              <RowSlot w={CHECK_W} placeholder={null}>
                <EnhancedCheckbox
                  checked={
                    p.items.length > 0 && p.selectedIds.size === p.items.length
                      ? true
                      : p.selectedIds.size > 0 ? 'indeterminate' : false
                  }
                  onCheckedChange={p.onSelectAll}
                  aria-label="すべて選ぶ"
                />
              </RowSlot>
            )}
            {visibleStd.map((key) => {
              const col = COL_DEFS.find((c) => c.key === key);
              if (!col) return null;
              const label = (
                <SortLabel
                  label={col.label} sortKey={col.sortKey}
                  currentKey={p.sortKey} currentDir={p.sortDir} onSort={p.onSort}
                />
              );
              // **表頭も本文と同じ部品で並べる。** 別に幅を書くと必ずずれる
              return key === 'name'
                ? <RowMain key={key}>{label}</RowMain>
                : <RowSlot key={key} w={COL_W[key as keyof typeof COL_W]}>{label}</RowSlot>;
            })}
            {visibleCustom.map((col) => (
              <RowSlot key={col.id} w={CUSTOM_COL_W}>
                <span className="truncate">{col.name}</span>
                <span className="text-note ml-1 shrink-0 text-fg-disabled">{col.scope === 'shared' ? '共' : '個'}</span>
              </RowSlot>
            ))}
            <RowSlot w={ACTION_W} align="right" className="sticky right-0 border-l border-border-faint bg-surface-subtle pl-2">
              操作
            </RowSlot>
          </RowHeader>

          {p.items.map((item, idx) => {
            const hasChildren = (item.children_count ?? 0) > 0;
            const isExpanded = p.expandedIds.has(item.id);
            const kids = p.childrenCache[item.id] ?? [];
            const loading = p.loadingChildren.has(item.id);
            const selected = p.selectedIds.has(item.id);

            // 「子機材も表示」でヒットした子は、親と並んでこの一覧に来る
            if (item.parent_id != null) return childRow(item, depthOf(item) + 1);

            return (
              <div key={item.id}>
                <Row
                  divider
                  density="table"
                  className={`${selected ? 'bg-primary-surface-weak' : 'bg-card'} ${p.cellCtx.editMode ? '' : 'cursor-pointer hover:bg-background'}`}
                  onClick={p.cellCtx.editMode ? undefined : () => p.onOpen(item.id)}
                >
                  <RowSlot w={LEAD_W} placeholder={null} onClick={(e) => e.stopPropagation()}>
                    {hasChildren && (
                      <button
                        type="button"
                        aria-label={isExpanded ? `${item.name} の付属品を閉じる` : `${item.name} の付属品を開く`}
                        className="rounded-control flex h-6 w-6 items-center justify-center text-muted-foreground hover:bg-muted"
                        onClick={() => p.onToggleExpand(item)}
                      >
                        {loading
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          : isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                            : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                    )}
                  </RowSlot>
                  {p.canBulkEdit && (
                    <RowSlot w={CHECK_W} placeholder={null} onClick={(e) => e.stopPropagation()}>
                      <EnhancedCheckbox
                        checked={selected}
                        aria-label={`${item.name} を選ぶ`}
                        onCheckedChange={() => { /* shift 押しは onClick で見る */ }}
                        onClick={(e) => p.onSelectOne(item.id, idx, (e as React.MouseEvent).shiftKey)}
                      />
                    </RowSlot>
                  )}
                  {cells(item, hasChildren
                    ? <span className="rounded-chip font-number text-note ml-1.5 bg-muted px-1.5 py-0.5 text-muted-foreground">{item.children_count}</span>
                    : undefined)}
                  {actions(item)}
                </Row>

                {isExpanded && kids.map((child) => childRow(child, 1, item.id))}
                {isExpanded && loading && (
                  <div className="text-sub-sm flex items-center gap-1.5 border-b border-border-faint bg-muted px-4 py-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />付属品を読み込んでいます
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
