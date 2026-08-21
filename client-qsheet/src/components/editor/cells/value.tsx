import BufferedTextarea from "./BufferedTextarea";
import type { Block, CueRowData } from "./types";

// 段5 PR3 で CueRow.tsx (旧 :666-677 の既定分岐) から切り出した。挙動・見た目は変えていない。
//
// remarks (備考) / item (小道具) / lighting (照明) の3型は `{ value: string }` の
// 同じ形・同じ UI (05-editor-impl.md §2 の表でも1行にまとめられている)。
// CueRow.tsx の分岐では「上のどれにも当てはまらない型」の既定 (default) 枝として
// この形になっているため、ここでも汎用の ValueCell として1ファイルに集約している。
interface ValueCellProps {
  blk: Block;
  cellKey?: string;
  row: CueRowData;
  updateCell: (blockId: string, newCell: any) => void;
}

export default function ValueCell({ blk, cellKey, row, updateCell }: ValueCellProps) {
  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
      <BufferedTextarea
        value={(row.cells?.[blk.id] || {}).value || ""}
        onCommit={(v) => updateCell(blk.id, { ...(row.cells?.[blk.id] || {}), value: v })}
        className="w-full min-h-[20px] text-[12px] bg-transparent border-none outline-none resize-none"
        style={{ lineHeight: "20px" }}
        placeholder="メモ..."
      />
    </td>
  );
}
