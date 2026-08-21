import StageDiagramCell from "../StageDiagramCell";
import type { Block, CueRowData } from "./types";

// 段5 PR3 で CueRow.tsx (旧 :553-563) から切り出した。挙動・見た目は変えていない。
// 立ち位置図 (stage_diagram) 列。実体は StageDiagramCell.tsx で、ここは <td> ラッパー。
interface StageDiagramTdProps {
  blk: Block;
  cellKey?: string;
  row: CueRowData;
  stageTemplates?: any[];
  updateCell: (blockId: string, newCell: any) => void;
}

export default function StageDiagramTd({ blk, cellKey, row, stageTemplates, updateCell }: StageDiagramTdProps) {
  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
      <StageDiagramCell
        cell={row.cells?.[blk.id]}
        stageTemplates={stageTemplates}
        onChange={(val) => updateCell(blk.id, val)}
      />
    </td>
  );
}
