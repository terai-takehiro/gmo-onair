import { Input } from "@gmo-onair/shared/src/client/ui";
import MicAssignmentCell from "./MicAssignmentCell";

// CueRowMobileEditor.tsx から抽出したパネル群 (マイク香盤 / LED・XR)。
// 400行ルールで分割 (2026-08 段0の非破壊化リライトで CueRowMobileEditor.tsx が
// 400行を超えたため)。

interface Block {
  id: string;
  type: string;
  label: string;
  width?: string | number;
}

// LED/XR の Cue / トランジション選択肢 (CueRow.tsx の PC 版と同じ値)
const LED_CUE_OPTIONS = ["V明け", "Qワード", "卓D"] as const;
const LED_TRANSITION_OPTIONS = [
  { value: "F.I.", label: "フェードイン (F.I.)" },
  { value: "C.I.", label: "カットイン (C.I.)" },
] as const;

export function MicAssignmentMobilePanel({
  blk,
  cell,
  masters,
  onChange,
}: {
  blk: Block;
  cell: any;
  masters: any;
  onChange: (val: any) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {blk.label}
        </h3>
        <span className="text-[10px] text-muted-foreground">マイク香盤</span>
      </header>
      <div className="p-2 overflow-x-auto">
        <MicAssignmentCell
          cell={cell}
          channels={masters?.micChannels || []}
          persons={masters?.persons || []}
          micTypes={masters?.micTypes || []}
          onChange={onChange}
        />
      </div>
    </section>
  );
}

export function LedXrEntry({
  entry,
  ledScenes,
  onChangeField,
}: {
  entry: any;
  ledScenes?: any[];
  onChangeField: (key: string, value: any) => void;
}) {
  const scene = (ledScenes || []).find((s: any) => s.id === entry.sceneId);
  return (
    <>
      <select
        value={entry.sceneId || ""}
        onChange={(e) => onChangeField("sceneId", e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:border-primary"
        aria-label="LED/XR シーン"
      >
        <option value="">未選択</option>
        {(ledScenes || []).map((s: any) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {scene && (
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-md border border-primary/20 bg-primary/5 p-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-primary/80 mb-0.5">壁</div>
            <div className="text-xs font-medium text-foreground truncate">{scene.wall || "—"}</div>
          </div>
          <div className="rounded-md border border-warning/30 bg-warning/5 p-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-warning/90 mb-0.5">床</div>
            <div className="text-xs font-medium text-foreground truncate">{scene.floor || "—"}</div>
          </div>
        </div>
      )}
      {/* Cue — PC (CueRow.tsx) と同じ選択肢 + 任意入力。旧モバイルは自由文の cue を
          書いていたため PC の <select> と一致せず空表示になっていた (D5)。 */}
      <select
        value={entry.cueType || ""}
        onChange={(e) => onChangeField("cueType", e.target.value || undefined)}
        className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:border-primary"
        aria-label="Cue"
      >
        <option value="">Cue</option>
        {LED_CUE_OPTIONS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
        <option value="custom">任意入力…</option>
      </select>
      {entry.cueType === "custom" && (
        <Input
          value={entry.cueCustom || ""}
          onChange={(e) => onChangeField("cueCustom", e.target.value)}
          placeholder="Cue (任意)"
          aria-label="Cue (任意入力)"
        />
      )}
      <select
        value={entry.transition || ""}
        onChange={(e) => onChangeField("transition", e.target.value || undefined)}
        className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:border-primary"
        aria-label="トランジション"
      >
        <option value="">効果</option>
        {LED_TRANSITION_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
        <option value="custom">任意入力…</option>
      </select>
      {entry.transition === "custom" && (
        <Input
          value={entry.transitionCustom || ""}
          onChange={(e) => onChangeField("transitionCustom", e.target.value)}
          placeholder="効果 (任意)"
          aria-label="トランジション (任意入力)"
        />
      )}
    </>
  );
}
