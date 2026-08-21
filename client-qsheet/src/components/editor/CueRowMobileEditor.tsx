import { Input, Textarea } from "@gmo-onair/shared/src/client/ui";
import { ImageIcon } from "lucide-react";
import { HighlightPicker } from "./HighlightPicker";
import MicAssignmentCell from "./MicAssignmentCell";
import StageDiagramCell from "./StageDiagramCell";

interface Block {
  id: string;
  type: string;
  label: string;
  width?: string | number;
}

interface Row {
  id?: string;
  label?: string;
  duration?: string | number;
  cells?: Record<string, any>;
  [k: string]: any;
}

interface Props {
  row: Row;
  blocks: Block[];
  masters: any;
  stageTemplates?: any[];
  ledScenes?: any[];
  /** state 木全体を更新するための updater */
  updateState: (updater: (s: any) => any) => void;
  /** このローカル row の si (section index) と ri (row index)。row.id があればそちらを優先する */
  si: number;
  ri: number;
}

// LED/XR の Cue / トランジション選択肢 (CueRow.tsx の PC 版と同じ値)
const LED_CUE_OPTIONS = ["V明け", "Qワード", "卓D"] as const;
const LED_TRANSITION_OPTIONS = [
  { value: "F.I.", label: "フェードイン (F.I.)" },
  { value: "C.I.", label: "カットイン (C.I.)" },
] as const;

// {value} 形のセルを持つブロック種別 (PC の CueRow.tsx の既定枝と同じ)
const VALUE_BLOCK_TYPES = new Set(["remarks", "item", "lighting"]);

// ─── Helpers ────────────────────────────────────────────
function getEntries(cell: any): any[] {
  if (!cell) return [];
  if (typeof cell === "string") return cell ? [{ label: cell }] : [];
  if (Array.isArray(cell.entries)) return cell.entries;
  // PC が書いた {value} 形も読めるようにする (旧モバイルはここが空を返していた)
  if (typeof cell.value === "string" && cell.value) return [{ label: cell.value }];
  return [];
}

function defaultEntryFor(type: string): Record<string, any> {
  if (type === "scenario") return { name: "", html: "" };
  if (type === "led_xr") return { sceneId: "", cueType: "", cueCustom: "", transition: "", transitionCustom: "" };
  return { label: "" };
}

/**
 * モバイル / タブレット (lg 未満) で 1 行の全ブロックを縦スタック編集する UI。
 * 既存 CueRow と同じ updateState + JSONB 構造を維持し、
 * デスクトップで作成した内容と双方向で完全互換。
 *
 * ⚠️ セルへの書き込みは必ず非破壊マージ (patchCell)。以前は型を無視して
 * 常に { entries: [...] } でセルを丸ごと置き換えていたため、
 * stage_diagram の templateId/note や slide の image が、色を付けただけで
 * 消えていた (HighlightPicker も同じ経路を通っていたため)。
 */
export default function CueRowMobileEditor({
  row,
  blocks,
  masters,
  stageTemplates,
  ledScenes,
  updateState,
  si,
  ri,
}: Props) {
  // sections[?].rows[?] に対する patch。row.id があれば id で行を特定する
  // (無ければ従来どおり si/ri。CSV 取込直後など id が未確定な瞬間の保険)。
  const patchRow = (patch: Partial<Row>) => {
    updateState((s: any) => {
      const next = { ...s };
      next.sections = next.sections.map((sec: any, i: number) => {
        if (!Array.isArray(sec.rows)) return sec;
        const rows = sec.rows.map((r: Row, j: number) => {
          const matches = row.id ? r.id === row.id : i === si && j === ri;
          return matches ? { ...r, ...patch } : r;
        });
        return { ...sec, rows };
      });
      return next;
    });
  };

  // セルを非破壊にマージする (既存キーを保つ)。色を付けただけで
  // stage_diagram の templateId/note や slide の image を消さないための要。
  const patchCell = (blk: Block, patch: Record<string, any>) => {
    const cur = row.cells?.[blk.id] || {};
    patchRow({ cells: { ...row.cells, [blk.id]: { ...cur, ...patch } } });
  };

  // v2.8.155: 1 行 = 1 エントリに統一。常に entries[0] を読み書きする (entries 系のみ)。
  const patchEntry0 = (blk: Block, mut: (entry: any) => any) => {
    const cur = row.cells?.[blk.id] || {};
    const entries = Array.isArray(cur.entries) ? cur.entries : [];
    const nextEntry = mut(entries[0] || defaultEntryFor(blk.type));
    patchCell(blk, { entries: [nextEntry, ...entries.slice(1)] });
  };

  const updateEntryField = (blk: Block, key: string, value: any) => {
    patchEntry0(blk, (e) => ({ ...e, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {/* Row header: label + duration + highlight */}
      <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">行ラベル</span>
          <Input
            value={row.label || ""}
            onChange={(e) => patchRow({ label: e.target.value })}
            placeholder="例: オープニング"
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">尺 (秒・mm:ss など)</span>
          <Input
            value={String(row.duration || "")}
            onChange={(e) => patchRow({ duration: e.target.value })}
            placeholder="例: 30 / 1:30"
            inputMode="numeric"
            className="mt-1 "
          />
        </label>
      </div>

      {/* Per-block entry editors */}
      {blocks.map((blk) => {
        if (blk.type === "audio_mic") {
          return (
            <MicAssignmentMobilePanel
              key={blk.id}
              blk={blk}
              cell={row.cells?.[blk.id]}
              masters={masters}
              onChange={(val) => patchRow({ cells: { ...row.cells, [blk.id]: val } })}
            />
          );
        }

        if (blk.type === "stage_diagram") {
          return (
            <section key={blk.id} className="rounded-lg border border-border bg-card overflow-hidden">
              <header className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{blk.label}</h3>
              </header>
              {/* PC (CueRow.tsx) と全く同じセル部品を使う。onChange は cell を丸ごと
                  返すが、StageDiagramCell 自身が ...cell を保って返すので非破壊。 */}
              <StageDiagramCell
                cell={row.cells?.[blk.id]}
                stageTemplates={stageTemplates}
                onChange={(val) => patchRow({ cells: { ...row.cells, [blk.id]: val } })}
              />
            </section>
          );
        }

        if (blk.type === "slide") {
          // 編集 UI は 06 で追加予定 (このセルは image を持つが、書き込み経路がまだ無い)。
          // ここでは何も書き込まない (=消しようがない) プレースホルダのみ表示する。
          return (
            <section key={blk.id} className="rounded-lg border border-border bg-card overflow-hidden">
              <header className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{blk.label}</h3>
              </header>
              <div className="flex items-center justify-center h-16 m-2 border border-dashed border-border rounded text-muted-foreground text-xs gap-1">
                <ImageIcon size={14} />
                スライド
              </div>
            </section>
          );
        }

        if (VALUE_BLOCK_TYPES.has(blk.type)) {
          return (
            <ValueBlockPanel
              key={blk.id}
              blk={blk}
              cell={row.cells?.[blk.id]}
              onChangeCell={(patch) => patchCell(blk, patch)}
            />
          );
        }

        return (
          <BlockPanel
            key={blk.id}
            blk={blk}
            entry={getEntries(row.cells?.[blk.id])[0] || null}
            masters={masters}
            ledScenes={ledScenes}
            onChangeField={(key, value) => updateEntryField(blk, key, value)}
          />
        );
      })}
    </div>
  );
}

// ─── MicAssignmentMobilePanel ───────────────────────────
// audio_mic ブロックは entries 配列ではなく { assignments } 構造のため
// BlockPanel を経由せず MicAssignmentCell を直接表示する。
function MicAssignmentMobilePanel({
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

// ─── ValueBlockPanel: remarks / item / lighting ({value} 形) ──
function ValueBlockPanel({
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
        <Textarea
          value={value}
          onChange={(e) => onChangeCell({ value: e.target.value })}
          rows={3}
          placeholder={blk.label}
          aria-label={blk.label}
        />
      </div>
    </section>
  );
}

// ─── BlockPanel: 1 entry per block (v2.8.155 で「行 = エントリ」に統一) ──
function BlockPanel({
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
          <Input
            value={entry.name || ""}
            onChange={(e) => onChangeField("name", e.target.value)}
            placeholder="話し手 (例: 山田)"
            list="master-persons-mobile"
            aria-label="話し手"
          />
          <Textarea
            value={entry.html || ""}
            onChange={(e) => onChangeField("html", e.target.value)}
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
          <Input
            value={entry.label || ""}
            onChange={(e) => onChangeField("label", e.target.value)}
            placeholder={blk.label}
            list={
              ["video", "audio", "telop"].includes(blk.type)
                ? `master-${blk.type}-mobile`
                : undefined
            }
          />
          {entry.memo !== undefined && (
            <Textarea
              value={entry.memo || ""}
              onChange={(e) => onChangeField("memo", e.target.value)}
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

function LedXrEntry({
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
