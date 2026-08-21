import BufferedInput from "../BufferedInput";
import type { Block, CueRowData, LedScene } from "./types";

// 段5 PR3 で CueRow.tsx (旧 :578-664) から切り出した。挙動・見た目は変えていない。
const LED_CUE_OPTIONS = ["V明け", "Qワード", "卓D"] as const;
const LED_TRANSITION_OPTIONS = [
  { value: "F.I.", label: "フェードイン (F.I.)" },
  { value: "C.I.", label: "カットイン (C.I.)" },
] as const;

interface LedXrCellProps {
  blk: Block;
  cellKey?: string;
  row: CueRowData;
  ledScenes?: LedScene[];
  updateCell: (blockId: string, newCell: any) => void;
}

export default function LedXrCell({ blk, cellKey, row, ledScenes, updateCell }: LedXrCellProps) {
  const cell = row.cells?.[blk.id] || {};
  const ledEntry = (cell.entries || [])[0] || {};
  const scene = ledScenes?.find((s) => s.id === ledEntry.sceneId);
  const updateLed = (field: string, value: any) => {
    const newCell = { ...cell };
    const entries = Array.isArray(newCell.entries) ? [...newCell.entries] : [];
    if (entries.length === 0) entries.push({});
    entries[0] = { ...entries[0], [field]: value };
    newCell.entries = entries;
    updateCell(blk.id, newCell);
  };
  return (
    <td data-collab-cell={cellKey} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
      <div className="flex flex-col gap-1 min-w-0">
        <select
          value={ledEntry.sceneId || ""}
          onChange={(e) => updateLed("sceneId", e.target.value || undefined)}
          className="w-full px-1.5 py-1 text-[11px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded outline-none focus:border-violet-400"
        >
          <option value="">-- シーン選択 --</option>
          {(ledScenes || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {scene && (
          <div className="grid grid-cols-2 gap-1">
            <div className="rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 min-w-0" title={`壁: ${scene.wall || "(未設定)"}`}>
              <div className="text-[8px] font-bold uppercase tracking-wider text-primary/80">壁</div>
              <div className="text-[10px] font-medium text-foreground truncate">{scene.wall || "—"}</div>
            </div>
            <div className="rounded border border-warning/30 bg-warning/5 px-1.5 py-0.5 min-w-0" title={`床: ${scene.floor || "(未設定)"}`}>
              <div className="text-[8px] font-bold uppercase tracking-wider text-warning/90">床</div>
              <div className="text-[10px] font-medium text-foreground truncate">{scene.floor || "—"}</div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <select
            value={ledEntry.cueType || ""}
            onChange={(e) => updateLed("cueType", e.target.value || undefined)}
            className="flex-1 px-1.5 py-1 text-[11px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded outline-none focus:border-violet-400"
            title="Cue"
          >
            <option value="">Cue</option>
            {LED_CUE_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="custom">任意入力…</option>
          </select>
          {ledEntry.cueType === "custom" && (
            <BufferedInput
              value={ledEntry.cueCustom || ""}
              onCommit={(v) => updateLed("cueCustom", v)}
              placeholder="Cue (任意)"
              className="flex-1 px-1.5 py-1 text-[11px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded outline-none focus:border-violet-400"
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          <select
            value={ledEntry.transition || ""}
            onChange={(e) => updateLed("transition", e.target.value || undefined)}
            className="flex-1 px-1.5 py-1 text-[11px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded outline-none focus:border-violet-400"
            title="トランジション"
          >
            <option value="">効果</option>
            {LED_TRANSITION_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
            <option value="custom">任意入力…</option>
          </select>
          {ledEntry.transition === "custom" && (
            <BufferedInput
              value={ledEntry.transitionCustom || ""}
              onCommit={(v) => updateLed("transitionCustom", v)}
              placeholder="効果 (任意)"
              className="flex-1 px-1.5 py-1 text-[11px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded outline-none focus:border-violet-400"
            />
          )}
        </div>
      </div>
    </td>
  );
}
