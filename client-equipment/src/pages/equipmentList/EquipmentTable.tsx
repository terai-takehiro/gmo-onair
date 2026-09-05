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
 *
 * ⚠️ **貼り付けたぶん、いちばん右の列はその下に隠れます**（`right: 0` の
 * `sticky` は必ず下の内容に重なる。横に送りきれば操作は本来の位置に戻り、
 * 隠れていた列が出てきます）。罫線1本だけだと**中途半端に切れた列**にしか
 * 見えなかったので、**下に列があるあいだだけ影**を出します
 * （`useSticksOverContent`）。既定の列で隠れるのは「貸出可」です。
 *
 * ── 描くのは見えている行だけ ────────────────────────────────
 *
 * 行の中身・幅・並びは**1つも変えていません**。変えたのは**何行ぶんを
 * DOM に置くか**だけです（`useRowWindow`）。5,000 点の台帳で開くのに
 * **30.7 秒**かかり、そのうち **28.2 秒は画面が固まったまま**でしたが、
 * これは全部「3,800 行ぶんの DOM を作る時間」でした（DB 42ms・API 140ms）。
 *
 * そのために**行を先に平らな配列にします**（親・付属品・読み込み中の
 * 3 種類を1本に並べる）。前は親の行の中に付属品を入れ子で描いていたので、
 * 「上から数えて N 行目」が数えられませんでした。
 * ⚠️ **`onSelectOne` に渡す番号は `items` の中の番号のまま**にすること —
 * 平らにした配列の番号を渡すと、**付属品を開いているときだけ
 * Shift 押しの範囲がずれます**（開き方によって違う範囲が選ばれる）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, Copy, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import {
  ACTION_W, CHECK_W, COL_DEFS, COL_W, CUSTOM_COL_W, LEAD_W, flattenRows, ledgerMinWidth,
  type ColKey, type EquipmentRecord,
} from './types';
import { customCells, standardCells, type CellContext, type CustomCellContext } from './EquipmentCells';
import { useRowWindow, WINDOWED_LIST_STYLE } from './useRowWindow';

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

/**
 * 貼り付けた「操作」の**下にまだ列があるか**（＝右にスクロールの余地があるか）。
 *
 * CSS だけでは分かりません（「はみ出しているか」を当てる仕掛けが無い）。
 * 幅の変化（`ResizeObserver`）と横スクロールの両方を見ます —
 * 列を出し入れしただけでもはみ出す量が変わるので、スクロールだけでは足りません。
 */
function useSticksOverContent(ref: React.RefObject<HTMLDivElement>) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 1px の余裕。端まで送ったとき小数の誤差で影が残り続けるのを防ぐ
    const read = () => setOver(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    // **中身のほうも見る。** 列を出し入れしても枠の幅は変わらないので、
    // 枠だけ見ていると「はみ出しが増えたのに影が出ない」になる
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener('scroll', read); ro.disconnect(); };
  }, [ref]);
  return over;
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
   * 横に流し始める幅。**算数は `ledgerMinWidth` の1か所**に置いてある
   * （隙間の数と行の左右の余白を2度間違えたので、テストで固定した）。
   */
  const minWidth = ledgerMinWidth({
    canBulkEdit: p.canBulkEdit,
    visibleStd,
    customCount: visibleCustom.length,
  });

  const scroller = useRef<HTMLDivElement>(null);
  const overlapping = useSticksOverContent(scroller);

  /**
   * 貼り付けた「操作」の見せ方。
   *
   * **下に列があるあいだだけ影を出す。** 影が無いと、隠れている列
   * （既定では「貸出可」）が**中途半端に切れた列**に見えます
   * — 実際には横に送れば出てくるので、「壊れている」ではなく
   * 「上に貼り付いている」と読めるようにする。右端まで送ると
   * 操作は本来の位置に戻り、下には何も無いので影も消す。
   */
  const actionStick = `sticky right-0 border-l pl-2 ${
    overlapping ? 'border-border shadow-[-8px_0_8px_-6px_rgba(0,0,0,0.12)]' : 'border-border-faint'
  }`;

  const actions = (item: EquipmentRecord, parentId?: string) => (
    <RowSlot
      w={ACTION_W}
      align="right"
      placeholder={null}
      className={`${actionStick} bg-inherit`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="flex justify-end gap-0.5">
        {p.canEdit && (
          <Button variant="ghost" size="icon-sm" aria-label={`${item.name} を写して追加`} onClick={() => p.onCopy(item)}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {p.canEdit && (
          <Button variant="ghost" size="icon-sm" aria-label={`${item.name} を編集`} onClick={() => p.onEdit(item)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        {p.canDelete && (
          <Button
            variant="ghost" size="icon-sm" className="text-destructive"
            aria-label={`${item.name} を削除`} onClick={() => p.onDelete(item, parentId)}
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

  /**
   * 出す行を平らに並べる（親・付属品・読み込み中）。**並びと段差は今までどおり**で、
   * 「上から数えて N 行目」が数えられる形にしただけ。
   */
  const rows = useMemo(
    () => flattenRows(p.items, p.expandedIds, p.childrenCache, p.loadingChildren),
    [p.items, p.expandedIds, p.childrenCache, p.loadingChildren],
  );

  /** 見えている範囲だけ描く。上下は空の箱で高さを埋める（スクロールバーは今までと同じ） */
  const body = useRef<HTMLDivElement>(null);
  const win = useRowWindow(body, rows.length);

  /** 子の行。**列は親と同じ位置**で、段差は行の頭の中だけに出す */
  const childRow = (child: EquipmentRecord, depth: number, divider: boolean, parentId?: string) => (
    <Row
      key={child.id}
      data-eq-row
      divider={divider}
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
      <div ref={scroller} className="rounded-card overflow-x-auto border border-border bg-card">
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
            <RowSlot w={ACTION_W} align="right" className={`${actionStick} bg-surface-subtle`}>
              操作
            </RowSlot>
          </RowHeader>

          <div ref={body} style={WINDOWED_LIST_STYLE}>
            {/* 上に無い行のぶんの高さ（スクロールバーの長さと位置を今までと同じに保つ） */}
            {win.padTop > 0 && <div style={{ height: win.padTop }} aria-hidden="true" />}

            {rows.slice(win.start, win.end).map((row) => {
              if (row.kind === 'loading') {
                return (
                  <div
                    key={`loading-${row.key}`}
                    data-eq-row
                    className="text-sub-sm flex items-center gap-1.5 border-b border-border-faint bg-muted px-4 py-2 text-muted-foreground"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />付属品を読み込んでいます
                  </div>
                );
              }
              if (row.kind === 'child') return childRow(row.item, row.depth, row.divider, row.parentId);

              const item = row.item;
              const hasChildren = (item.children_count ?? 0) > 0;
              const isExpanded = p.expandedIds.has(item.id);
              const loading = p.loadingChildren.has(item.id);
              const selected = p.selectedIds.has(item.id);

              return (
                <Row
                  key={item.id}
                  data-eq-row
                  divider={row.divider}
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
                        onClick={(e) => p.onSelectOne(item.id, row.index, (e as React.MouseEvent).shiftKey)}
                      />
                    </RowSlot>
                  )}
                  {cells(item, hasChildren
                    ? <span className="rounded-chip font-number text-note ml-1.5 bg-muted px-1.5 py-0.5 text-muted-foreground">{item.children_count}</span>
                    : undefined)}
                  {actions(item)}
                </Row>
              );
            })}

            {/* 下に無い行のぶんの高さ */}
            {win.padBottom > 0 && <div style={{ height: win.padBottom }} aria-hidden="true" />}
          </div>
        </div>
      </div>
    </div>
  );
}
