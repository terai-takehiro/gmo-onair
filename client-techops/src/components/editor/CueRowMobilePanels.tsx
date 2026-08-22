import BufferedInput from "./BufferedInput";
import BufferedTextarea from "./cells/BufferedTextarea";
import { HighlightPicker } from "./HighlightPicker";
import MicAssignmentCell from "./MicAssignmentCell";

// CueRowMobileEditor.tsx から抽出したパネル群
// (マイク香盤 / LED・XR / {value}形の備考等 / 1entryブロックの汎用編集)。
// 400行ルールで分割 (2026-08 段0の非破壊化リライトで CueRowMobileEditor.tsx が
// 400行を超えたため。段5 PR5 で BlockPanel / EntryEditor / ValueBlockPanel を追加移設)。
//
// ⚠️ 入力欄は必ず BufferedInput / BufferedTextarea を使う (素の
// <input value onChange> / <textarea value onChange> で日本語を編集しない。
// 理由は CueRowMobileEditor.tsx のコメントと client-techops/CLAUDE.md を参照)。

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

// select は素の <select onChange> のままでよい (変換 = composition が起きないため
// IME で壊れない。ただしタップ領域は 44px を確保する)。
const SELECT_CLASS =
  "min-h-tap w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-md outline-none focus:border-primary";

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
        className={SELECT_CLASS}
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
        className={SELECT_CLASS}
        aria-label="Cue"
      >
        <option value="">Cue</option>
        {LED_CUE_OPTIONS.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
        <option value="custom">任意入力…</option>
      </select>
      {entry.cueType === "custom" && (
        <BufferedInput
          value={entry.cueCustom || ""}
          onCommit={(v) => onChangeField("cueCustom", v)}
          placeholder="Cue (任意)"
          aria-label="Cue (任意入力)"
        />
      )}
      <select
        value={entry.transition || ""}
        onChange={(e) => onChangeField("transition", e.target.value || undefined)}
        className={SELECT_CLASS}
        aria-label="トランジション"
      >
        <option value="">効果</option>
        {LED_TRANSITION_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
        <option value="custom">任意入力…</option>
      </select>
      {entry.transition === "custom" && (
        <BufferedInput
          value={entry.transitionCustom || ""}
          onCommit={(v) => onChangeField("transitionCustom", v)}
          placeholder="効果 (任意)"
          aria-label="トランジション (任意入力)"
        />
      )}
    </>
  );
}

// ─── ValueBlockPanel: remarks / item / lighting ({value} 形) ──
export function ValueBlockPanel({
  blk,
  cell,
  onChangeCell,
}: {
  blk: Block;
  cell: any;
  onChangeCell: (patch: Record<string, any>) => void;
}) {
  const value = typeof cell === "string" ? cell : typeof cell?.value === "string" ? cell.value : "";
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {blk.label}
        </h3>
        <HighlightPicker
          value={cell?.highlight}
          onChange={(c) => onChangeCell({ highlight: c || undefined })}
        />
      </header>
      <div className="p-2">
        <BufferedTextarea
          value={value}
          onCommit={(v) => onChangeCell({ value: v })}
          rows={3}
          placeholder={blk.label}
          aria-label={blk.label}
        />
      </div>
    </section>
  );
}

// ─── BlockPanel: 1 entry per block (v2.8.155 で「行 = エントリ」に統一) ──
export function BlockPanel({
  blk,
  entry,
  masters,
  ledScenes,
  onChangeField,
}: {
  blk: Block;
  entry: any | null;
  masters: any;
  ledScenes?: any[];
  onChangeField: (key: string, value: any) => void;
}) {
  const en = entry || {};
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {blk.label}
        </h3>
        <HighlightPicker
          value={en.highlight}
          onChange={(c) => onChangeField("highlight", c || undefined)}
        />
      </header>

      <div className="p-2 space-y-2">
        <EntryEditor
          blk={blk}
          entry={en}
          masters={masters}
          ledScenes={ledScenes}
          onChangeField={onChangeField}
        />
      </div>
    </section>
  );
}

// ─── EntryEditor: 1 entry = 1 card ──────────────────────
function EntryEditor({
  blk,
  entry,
  masters,
  ledScenes,
  onChangeField,
}: {
  blk: Block;
  entry: any;
  masters: any;
  ledScenes?: any[];
  onChangeField: (key: string, value: any) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2 space-y-2">
      {/* Body — branch by block type */}
      {blk.type === "scenario" ? (
        <>
          <BufferedInput
            value={entry.name || ""}
            onCommit={(v) => onChangeField("name", v)}
            placeholder="話し手 (例: 山田)"
            list="master-persons-mobile"
            aria-label="話し手"
          />
          <BufferedTextarea
            value={entry.html || ""}
            onCommit={(v) => onChangeField("html", v)}
            rows={3}
            placeholder="セリフ・進行内容..."
            aria-label="セリフ・進行内容"
          />
          {(masters?.persons as string[] | undefined) && (
            <datalist id="master-persons-mobile">
              {(masters.persons as string[]).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </>
      ) : blk.type === "led_xr" ? (
        <LedXrEntry entry={entry} ledScenes={ledScenes} onChangeField={onChangeField} />
      ) : (
        <>
          <BufferedInput
            value={entry.label || ""}
            onCommit={(v) => onChangeField("label", v)}
            placeholder={blk.label}
            list={
              ["video", "audio", "telop"].includes(blk.type)
                ? `master-${blk.type}-mobile`
                : undefined
            }
          />
          {entry.memo !== undefined && (
            <BufferedTextarea
              value={entry.memo || ""}
              onCommit={(v) => onChangeField("memo", v)}
              rows={2}
              placeholder="メモ"
            />
          )}
        </>
      )}

      {/* Master datalists for video/audio/telop */}
      {["video", "audio", "telop"].includes(blk.type) && masters?.[blk.type] && (
        <datalist id={`master-${blk.type}-mobile`}>
          {(masters[blk.type] as string[]).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      )}
    </div>
  );
}
