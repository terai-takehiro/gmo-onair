import { memo, useId } from "react";
import { ChevronUp, ChevronDown, Copy, Trash2, Plus, Check } from "lucide-react";
import ScenarioCell from "./cells/scenario";
import MediaCell from "./cells/media";
import AudioMicCell from "./cells/audioMic";
import StageDiagramTd from "./cells/stageDiagram";
import SlideCell from "./cells/slide";
import LedXrCell from "./cells/ledXr";
import ValueCell from "./cells/value";
import type { Block, CueRowData, LedScene } from "./cells/types";

// 段5 PR3: 11 ブロック型ごとのセル描画は components/editor/cells/<type>.tsx に
// 切り出した (純粋な移動・挙動は変えていない)。CueRow.tsx は行の状態操作
// (updateCell / updateEntry / getEntry) と型ごとの振り分けだけを持つ。

export interface CueRowProps {
  row: CueRowData;
  blocks: Block[];
  masters: any;
  stageTemplates?: any[];
  ledScenes?: LedScene[];
  collapsedBlocks?: Set<string>;
  speakerColorMap: Record<string, string>;
  /** マイク香盤「前cue継承」用 — 直前の audio_mic セルの assignments を返す */
  findPrevAudioMicAssignments?: (blockId: string) => any[] | null;
  onChange: (updater: (r: CueRowData) => CueRowData) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  /** この行の直下に空行を挿入 (途中に行を追加) */
  onInsertBelow?: () => void;
  /** 行の複数選択 (グループ ドラッグ移動用) */
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  // v1.2.9: エントリ単位の削除（ゴミ箱経由）を親 (CueTable→EditorPage) で処理するためのコールバック
  onDeleteEntry?: (blockId: string, entryIdx: number, payload: any, meta: { sectionLabel?: string; rowLabel?: string }) => void;
  // v2.8.32: 行 DnD 用 (HTML5 native drag&drop)
  isRowDragged?: boolean;
  isRowDropTarget?: boolean;
  onRowDragStart?: (e: React.DragEvent) => void;
  onRowDragOver?: (e: React.DragEvent) => void;
  onRowDragLeave?: (e: React.DragEvent) => void;
  onRowDrop?: (e: React.DragEvent) => void;
  onRowDragEnd?: (e: React.DragEvent) => void;
}

// ─── CueRow ─────────────────────────────────────────────
function CueRowImpl({
  row,
  blocks,
  masters,
  stageTemplates,
  ledScenes,
  collapsedBlocks,
  speakerColorMap,
  findPrevAudioMicAssignments,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onInsertBelow,
  isSelected,
  onToggleSelect,
  onDeleteEntry,
  isRowDragged,
  isRowDropTarget,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd,
}: CueRowProps) {
  const rowUid = useId();
  const dragHandlers = onRowDragStart
    ? {
        draggable: true,
        onDragStart: onRowDragStart,
        onDragOver: onRowDragOver,
        onDragLeave: onRowDragLeave,
        onDrop: onRowDrop,
        onDragEnd: onRowDragEnd,
      }
    : {};
  const dragClass = `${onRowDragStart ? "cursor-grab active:cursor-grabbing" : ""} ${isRowDragged ? "opacity-40" : ""} ${isRowDropTarget ? "outline outline-2 outline-primary outline-offset-[-2px]" : ""}`;

  // onDeleteEntry は v2.8.155 で「行 = エントリ」に統一されたため未使用。
  // 過去版との互換のため Props に残置 (CueTable から渡るが内部では使わない)。
  void onDeleteEntry;

  const updateCell = (blockId: string, newCell: any) => {
    onChange((r) => ({ ...r, cells: { ...r.cells, [blockId]: newCell } }));
  };

  // 同時共同編集 (Phase 3): セルにライブカーソル用の識別子を付ける (row.id は文書内で一意)。
  const rowId = (row as any).id as string | undefined;
  const cellKey = (blockId: string) => (rowId ? `${rowId}|${blockId}` : undefined);

  // v2.8.155: 1 行 = 1 エントリに統一。常に entries[0] を読み書きする。
  const getEntry = (blk: Block) => {
    const cell = row.cells?.[blk.id] || {};
    if (blk.type === "scenario" || ["video", "audio", "telop"].includes(blk.type)) {
      return (cell.entries || [])[0] || null;
    }
    return null;
  };

  const updateEntry = (blk: Block, field: string, value: any) => {
    const cell = { ...(row.cells?.[blk.id] || {}) };
    const entries = Array.isArray(cell.entries) ? [...cell.entries] : [];
    if (entries.length === 0) {
      entries.push(blk.type === "scenario" ? { name: "", html: "", isQWord: false } : { label: "", memo: "" });
    }
    entries[0] = { ...entries[0], [field]: value };
    cell.entries = entries;
    updateCell(blk.id, cell);
  };

  // シナリオセルの highlight (行全体の背景色) を取得
  const scenarioBlock = blocks.find((b) => b.type === "scenario");
  const scenarioEntry: any = scenarioBlock ? (row.cells?.[scenarioBlock.id]?.entries || [])[0] : null;
  const rowHighlight = (scenarioEntry?.highlight as string | undefined) || undefined;

  return (
    <tr
      {...dragHandlers}
      className={`group transition-colors duration-150 hover:bg-blue-50/40 dark:hover:bg-blue-950/10 border-b border-zinc-100/80 dark:border-zinc-800/60 ${isSelected ? "ring-2 ring-inset ring-primary/60 bg-primary/5" : ""} ${dragClass}`}
      style={rowHighlight ? { backgroundColor: rowHighlight } : undefined}
    >
          {blocks.map((blk) => {
            if (collapsedBlocks?.has(blk.id)) {
              return <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="border-r border-zinc-100/60 dark:border-zinc-800/40" />;
            }
            const en = getEntry(blk);

            if (blk.type === "scenario") {
              return (
                <ScenarioCell
                  key={blk.id}
                  blk={blk}
                  cellKey={cellKey(blk.id)}
                  rowUid={rowUid}
                  entry={en}
                  masters={masters}
                  speakerColorMap={speakerColorMap}
                  updateEntry={updateEntry}
                />
              );
            }

            if (["video", "audio", "telop"].includes(blk.type)) {
              return (
                <MediaCell
                  key={blk.id}
                  blk={blk}
                  cellKey={cellKey(blk.id)}
                  rowUid={rowUid}
                  entry={en}
                  masters={masters}
                  updateEntry={updateEntry}
                />
              );
            }

            if (blk.type === "audio_mic") {
              return (
                <AudioMicCell
                  key={blk.id}
                  blk={blk}
                  cellKey={cellKey(blk.id)}
                  row={row}
                  masters={masters}
                  updateCell={updateCell}
                  findPrevAudioMicAssignments={findPrevAudioMicAssignments}
                />
              );
            }

            if (blk.type === "stage_diagram") {
              return (
                <StageDiagramTd
                  key={blk.id}
                  blk={blk}
                  cellKey={cellKey(blk.id)}
                  row={row}
                  stageTemplates={stageTemplates}
                  updateCell={updateCell}
                />
              );
            }

            if (blk.type === "slide") {
              return (
                <SlideCell
                  key={blk.id}
                  blk={blk}
                  cellKey={cellKey(blk.id)}
                  row={row}
                  updateCell={updateCell}
                />
              );
            }

            if (blk.type === "led_xr") {
              return (
                <LedXrCell
                  key={blk.id}
                  blk={blk}
                  cellKey={cellKey(blk.id)}
                  row={row}
                  ledScenes={ledScenes}
                  updateCell={updateCell}
                />
              );
            }

            // ── remarks / item / lighting ({value} 形の既定枝) ──
            return (
              <ValueCell
                key={blk.id}
                blk={blk}
                cellKey={cellKey(blk.id)}
                row={row}
                updateCell={updateCell}
              />
            );
          })}

          {/* 操作ボタン (モバイル常時表示) */}
          <td className="px-0.5 align-top w-9 border-b border-zinc-100/80 dark:border-zinc-800/60">
            <div className="flex flex-col items-center gap-0.5 pt-1">
              {onToggleSelect && (
                <button
                  onClick={onToggleSelect}
                  className={`size-5 rounded border flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground opacity-100"
                      : "border-zinc-300 dark:border-zinc-600 text-transparent opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                  }`}
                  title="行を選択 (まとめて移動 / Shift+クリックで範囲選択)"
                  aria-pressed={isSelected}
                  aria-label="行を選択"
                >
                  <Check size={12} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-col items-center gap-0.5 pt-0.5 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200">
              <button onClick={onMoveUp} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors">
                <ChevronUp size={14} />
              </button>
              <button onClick={onMoveDown} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors">
                <ChevronDown size={14} />
              </button>
              <button onClick={onInsertBelow} className="p-1.5 text-zinc-400 hover:text-primary active:text-primary transition-colors" title="この行の下に空行を挿入">
                <Plus size={13} />
              </button>
              <button onClick={onDuplicate} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors" title="この行を複製">
                <Copy size={12} />
              </button>
              <button onClick={onDelete} className="p-1.5 text-zinc-400 hover:text-red-400 active:text-red-600 transition-colors" title="この行を削除">
                <Trash2 size={12} />
              </button>
            </div>
          </td>
    </tr>
  );
}

// React.memo: row / blocks / masters / 各種 collection が shallow 同一なら再レンダーをスキップ
// CueTable から渡される on* コールバックは CueRowSlot で useCallback 化されている前提
const CueRow = memo(CueRowImpl);
export default CueRow;
