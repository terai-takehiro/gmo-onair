import MicAssignmentCell from "../MicAssignmentCell";
import type { Block, CueRowData } from "./types";

// 段5 PR3 で CueRow.tsx (旧 :528-550) から切り出した。挙動・見た目は変えていない。
// マイク香盤 (audio_mic) 列。実体は MicAssignmentCell.tsx で、ここは <td> ラッパー。
interface AudioMicCellProps {
  blk: Block;
  cellKey?: string;
  row: CueRowData;
  masters: any;
  updateCell: (blockId: string, newCell: any) => void;
  findPrevAudioMicAssignments?: (blockId: string) => any[] | null;
}

export default function AudioMicCell({
  blk,
  cellKey,
  row,
  masters,
  updateCell,
  findPrevAudioMicAssignments,
}: AudioMicCellProps) {
  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
      <MicAssignmentCell
        cell={row.cells?.[blk.id]}
        channels={masters?.micChannels || []}
        persons={masters?.persons || []}
        micTypes={masters?.micTypes || []}
        onChange={(val) => updateCell(blk.id, val)}
        onInheritFromPrev={
          findPrevAudioMicAssignments
            ? () => {
                const prev = findPrevAudioMicAssignments(blk.id);
                if (prev) {
                  updateCell(blk.id, { assignments: prev.map((a: any) => ({ ...a })) });
                }
              }
            : undefined
        }
      />
    </td>
  );
}
