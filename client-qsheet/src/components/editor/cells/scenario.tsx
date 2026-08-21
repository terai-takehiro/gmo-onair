import EditablePill from "./EditablePill";
import EntryImageButton from "./EntryImageButton";
import BufferedTextarea from "./BufferedTextarea";
import { HighlightPicker } from "../HighlightPicker";
import type { Block } from "./types";

// 段5 PR3 で CueRow.tsx (旧 :412-476) から切り出した。挙動・見た目は変えていない。
const SPEAKER_COLORS = [
  "bg-slate-700", "bg-teal-700", "bg-purple-700", "bg-pink-700", "bg-amber-700",
  "bg-green-700", "bg-blue-700", "bg-red-800", "bg-indigo-700", "bg-orange-700",
];

interface ScenarioCellProps {
  blk: Block;
  cellKey?: string;
  rowUid: string;
  /** row.cells[blk.id].entries[0] (無ければ null) */
  entry: any;
  masters: any;
  speakerColorMap: Record<string, string>;
  updateEntry: (blk: Block, field: string, value: any) => void;
}

export default function ScenarioCell({
  blk,
  cellKey,
  rowUid,
  entry: en,
  masters,
  speakerColorMap,
  updateEntry,
}: ScenarioCellProps) {
  const color = en?.name ? (speakerColorMap[en.name] || SPEAKER_COLORS[0]) : "bg-zinc-400";
  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden break-words align-top">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-start gap-1.5 min-w-0">
          <button
            onClick={() => updateEntry(blk, "isQWord", !en?.isQWord)}
            className={`flex-shrink-0 w-5 h-5 rounded text-[11px] font-bold leading-none flex items-center justify-center transition-all mt-[1px] ${
              en?.isQWord
                ? "bg-red-500 text-white shadow-sm"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            }`}
            title="Qワード切替"
          >
            Q
          </button>
          <EditablePill
            value={en?.name || ""}
            color={color}
            placeholder="名前"
            datalistId={`p-${rowUid}-${blk.id}`}
            datalistOptions={masters?.persons}
            onChange={(v) => updateEntry(blk, "name", v)}
          />
          {en?.isQWord && <span className="flex-shrink-0 text-red-500 font-bold text-[13px] leading-[20px]">Q→</span>}
          <BufferedTextarea
            autosize
            value={en?.html?.replace(/<[^>]*>/g, "") || ""}
            onCommit={(v) => updateEntry(blk, "html", v)}
            rows={1}
            className="text-[13px] bg-transparent border-none outline-none resize-none overflow-hidden min-w-0 w-0"
            style={{ flex: "1 1 0", overflowWrap: "break-word", lineHeight: "20px" }}
            placeholder={en?.isQWord ? "Qワード..." : "テキスト..."}
          />
          <EntryImageButton
            imageUrl={en?.image}
            onChange={(url) => updateEntry(blk, "image", url || undefined)}
            hideThumbnail
          />
          <HighlightPicker
            value={en?.highlight}
            onChange={(c) => updateEntry(blk, "highlight", c || undefined)}
          />
        </div>
        {en?.image && (
          <div className="relative inline-block w-fit ml-7 group/img">
            <img
              src={en.image}
              alt=""
              className="max-h-40 max-w-full rounded border border-zinc-200 dark:border-zinc-700 object-contain"
            />
            <button
              onClick={() => updateEntry(blk, "image", undefined)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-zinc-300 text-zinc-500 hover:text-red-500 text-xs leading-none flex items-center justify-center shadow-sm opacity-0 group-hover/img:opacity-100 transition-opacity"
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
