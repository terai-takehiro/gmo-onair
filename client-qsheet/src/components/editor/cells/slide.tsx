import { ImageIcon } from "lucide-react";
import type { Block } from "./types";

// 段5 PR3 で CueRow.tsx (旧 :566-575) から切り出した。挙動・見た目は変えていない。
// この時点では書き込み経路が無い表示のみのプレースホルダ (05-editor-impl.md §2-1)。
// 編集 UI は PR4 でここに追加する。
interface SlideCellProps {
  blk: Block;
  cellKey?: string;
}

export default function SlideCell({ cellKey }: SlideCellProps) {
  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
      <div className="flex items-center justify-center h-16 border border-dashed border-zinc-200 dark:border-zinc-700 rounded text-zinc-300 dark:text-zinc-600 text-xs">
        <ImageIcon size={14} className="mr-1" />
        スライド
      </div>
    </td>
  );
}
