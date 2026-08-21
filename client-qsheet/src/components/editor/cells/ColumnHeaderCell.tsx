import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import BufferedInput from "../BufferedInput";

// 段5 PR7 で CueTable.tsx から切り出した表頭セル (列の並べ替え・折りたたみ・幅リサイズ・
// 列ラベル編集)。挙動は変えていない — CueTable.tsx が 400 行の記録済みラチェット
// (scripts/check-file-size.mjs) を超えて増えるのを避けるための純粋な移動。
// ドラッグ系ハンドラは CueTable 側で useCallback 化して渡す (CueRowSlot と同じ形)。

interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
  widthPx?: number;
}

export interface ColumnHeaderCellProps {
  blk: Block;
  bi: number;
  Icon?: LucideIcon;
  isCollapsed?: boolean;
  isDragged: boolean;
  isDragTarget: boolean;
  onToggleCollapse?: (blockId: string) => void;
  /** 列 (ブロック) のラベル変更。05-editor-impl.md §2-2 / §10-C: 従来は表示のみだった */
  updateBlockLabel: (blockId: string, label: string) => void;
  startResize: (e: React.MouseEvent, blk: Block) => void;
  onDragStartBlock: (e: React.DragEvent, blk: Block) => void;
  onDragOverBlock: (e: React.DragEvent, bi: number) => void;
  onDragLeaveBlock: () => void;
  onDropBlock: (e: React.DragEvent, bi: number) => void;
  onDragEndBlock: () => void;
}

export default function ColumnHeaderCell({
  blk,
  bi,
  Icon,
  isCollapsed,
  isDragged,
  isDragTarget,
  onToggleCollapse,
  updateBlockLabel,
  startResize,
  onDragStartBlock,
  onDragOverBlock,
  onDragLeaveBlock,
  onDropBlock,
  onDragEndBlock,
}: ColumnHeaderCellProps) {
  return (
    <th
      draggable
      onDragStart={(e) => onDragStartBlock(e, blk)}
      onDragOver={(e) => onDragOverBlock(e, bi)}
      onDragLeave={onDragLeaveBlock}
      onDrop={(e) => onDropBlock(e, bi)}
      onDragEnd={onDragEndBlock}
      className={`px-2 py-2 text-left border-b border-border/60 relative group/th cursor-grab select-none transition-all ${
        isDragged ? "opacity-40" : ""
      } ${isDragTarget ? "border-l-2 border-l-primary" : ""}`}
    >
      {isCollapsed ? (
        <div className="flex items-center justify-center h-full">
          <button onClick={() => onToggleCollapse?.(blk.id)} className="p-0.5 hover:bg-accent rounded-control transition-colors">
            <ChevronRight size={10} />
          </button>
          <span className="text-xs whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>{blk.label}</span>
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 min-w-0 w-full">
          <button onClick={() => onToggleCollapse?.(blk.id)} className="flex-none p-0.5 hover:bg-accent rounded-control transition-colors opacity-0 group-hover/th:opacity-100">
            <ChevronDown size={10} />
          </button>
          {Icon && <Icon size={12} className="flex-none opacity-50" />}
          {/* 列 (ブロック) のラベル変更 UI。従来は blk.label を表示するだけだった
              (05-editor-impl.md §2-2「ラベル変更 UI が存在しない」§10-C)。
              列ヘッダー自体が draggable (列の並べ替え) なので、ロール名の入力欄
              (通常ロールヘッダーの <input>) と同じく、入力欄をその内側にそのまま置く形にしている。 */}
          <BufferedInput
            value={blk.label}
            onCommit={(v) => updateBlockLabel(blk.id, v)}
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={(e) => e.stopPropagation()}
            draggable={false}
            className="min-w-0 flex-1 bg-transparent border-none outline-none rounded-control px-1 -mx-1 uppercase tracking-wider text-th text-muted-foreground truncate focus:bg-accent focus:text-foreground transition-colors"
            placeholder="列名"
            aria-label={`「${blk.label}」列の名前を編集`}
            title="クリックで列名を編集"
          />
        </span>
      )}
      {/* Resize handle */}
      {!isCollapsed && (
        <div
          draggable={false}
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:bg-primary transition-opacity"
          onMouseDown={(e) => startResize(e, blk)}
        />
      )}
    </th>
  );
}
