import EditablePill from "./EditablePill";
import EntryImageButton from "./EntryImageButton";
import BufferedInput from "../BufferedInput";
import type { Block } from "./types";

// 段5 PR3 で CueRow.tsx (旧 :479-525) から切り出した。挙動・見た目は変えていない。
//
// video / audio / telop の3型は「ラベルピル + メモ + 画像」で全く同じ UI
// (05-editor-impl.md §2 の表でも1行にまとめられている)。3ファイルに分けても
// 中身が丸ごと重複するだけなので、この1ファイルに集約している
// (CueRow.tsx 側の分岐条件 `["video","audio","telop"].includes(blk.type)` は変えていない)。
//
// 3型を見分けるためだけの色 (状態の色ではない) なので cat-1〜8 (見分けの色) から選ぶ
// (CLAUDE.md / shared/CLAUDE.md の色トークン方針)。
const PILL_COLORS: Record<string, string> = { video: "bg-cat-2", audio: "bg-cat-6", telop: "bg-cat-7" };

interface MediaCellProps {
  blk: Block;
  cellKey?: string;
  rowUid: string;
  /** row.cells[blk.id].entries[0] (無ければ null) */
  entry: any;
  masters: any;
  updateEntry: (blk: Block, field: string, value: any) => void;
}

export default function MediaCell({ blk, cellKey, rowUid, entry: en, masters, updateEntry }: MediaCellProps) {
  const pillColor = PILL_COLORS[blk.type] || "bg-muted-foreground";
  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-border-faint overflow-hidden align-top">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-start gap-1.5 min-w-0">
          <EditablePill
            value={en?.label || ""}
            color={en?.label ? pillColor : "bg-muted-foreground"}
            placeholder="ID"
            datalistId={`${blk.type}-${rowUid}-${blk.id}`}
            datalistOptions={masters?.[blk.type]}
            onChange={(v) => updateEntry(blk, "label", v)}
          />
          <BufferedInput
            value={en?.memo || ""}
            onCommit={(v) => updateEntry(blk, "memo", v)}
            className="text-[12px] bg-transparent border-none outline-none min-w-0"
            style={{ flex: "1 1 0", lineHeight: "20px" }}
            placeholder="メモ..."
          />
          <EntryImageButton
            imageUrl={en?.image}
            onChange={(url) => updateEntry(blk, "image", url || undefined)}
            hideThumbnail
          />
        </div>
        {en?.image && (
          <div className="relative inline-block w-fit group/img">
            <img
              src={en.image}
              alt=""
              className="max-h-40 max-w-full rounded-control border border-border object-contain"
            />
            <button
              onClick={() => updateEntry(blk, "image", undefined)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-card border border-border text-muted-foreground hover:text-destructive text-xs leading-none flex items-center justify-center shadow-sm opacity-0 group-hover/img:opacity-100 transition-opacity"
              title="画像を削除"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </td>
  );
}
