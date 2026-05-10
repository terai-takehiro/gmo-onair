import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Input, Textarea, Button } from "@gmo-onair/shared/src/client/ui";
import { HighlightPicker } from "./HighlightPicker";
import MicAssignmentCell from "./MicAssignmentCell";

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
  ledScenes?: any[];
  /** state 木全体を更新するための updater */
  updateState: (updater: (s: any) => any) => void;
  /** このローカル row の si (section index) と ri (row index) */
  si: number;
  ri: number;
}

// ─── Helpers ────────────────────────────────────────────
function getEntries(cell: any): any[] {
  if (!cell) return [];
  if (typeof cell === "string") return cell ? [{ label: cell }] : [];
  return Array.isArray(cell.entries) ? cell.entries : [];
}

function setEntries(_blkType: string, entries: any[]): any {
  return { entries };
}

/**
 * モバイル / タブレット (lg 未満) で 1 行の全ブロックを縦スタック編集する UI。
 * 既存 CueRow と同じ updateState + JSONB 構造を維持し、
 * デスクトップで作成した内容と双方向で完全互換。
 */
export default function CueRowMobileEditor({
  row,
  blocks,
  masters,
  ledScenes,
  updateState,
  si,
  ri,
}: Props) {
  // sections[si].rows[ri] に対する patch
  const patchRow = (patch: Partial<Row>) => {
    updateState((s: any) => {
      const next = { ...s };
      next.sections = next.sections.map((sec: any, i: number) =>
        i !== si
          ? sec
          : { ...sec, rows: sec.rows.map((r: Row, j: number) => (j === ri ? { ...r, ...patch } : r)) }
      );
      return next;
    });
  };

  const patchEntries = (blk: Block, mut: (entries: any[]) => any[]) => {
    const cur = getEntries(row.cells?.[blk.id]);
    const next = mut(cur);
    patchRow({
      cells: { ...row.cells, [blk.id]: setEntries(blk.type, next) },
    });
  };

  const addEntry = (blk: Block) => {
    const tmpl =
      blk.type === "scenario"
        ? { name: "", html: "" }
        : blk.type === "led_xr"
        ? { sceneId: "", cue: "", transition: "" }
        : { label: "" };
    patchEntries(blk, (es) => [...es, tmpl]);
  };

  const removeEntry = (blk: Block, ei: number) => {
    patchEntries(blk, (es) => es.filter((_, i) => i !== ei));
  };

  const moveEntry = (blk: Block, ei: number, dir: -1 | 1) => {
    patchEntries(blk, (es) => {
      const next = [...es];
      const target = ei + dir;
      if (target < 0 || target >= next.length) return es;
      [next[ei], next[target]] = [next[target], next[ei]];
      return next;
    });
  };

  const updateEntryField = (blk: Block, ei: number, key: string, value: any) => {
    patchEntries(blk, (es) => es.map((e, i) => (i === ei ? { ...e, [key]: value } : e)));
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
              onChange={(val) =>
                patchRow({
                  cells: { ...row.cells, [blk.id]: val },
                })
              }
            />
          );
        }
        return (
          <BlockPanel
            key={blk.id}
            blk={blk}
            entries={getEntries(row.cells?.[blk.id])}
            masters={masters}
            ledScenes={ledScenes}
            onAdd={() => addEntry(blk)}
            onRemove={(ei) => removeEntry(blk, ei)}
            onMove={(ei, dir) => moveEntry(blk, ei, dir)}
            onChangeField={(ei, key, value) => updateEntryField(blk, ei, key, value)}
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

// ─── BlockPanel: per-block list of entries ──────────────
function BlockPanel({
  blk,
  entries,
  masters,
  ledScenes,
  onAdd,
  onRemove,
  onMove,
  onChangeField,
}: {
  blk: Block;
  entries: any[];
  masters: any;
  ledScenes?: any[];
  onAdd: () => void;
  onRemove: (ei: number) => void;
  onMove: (ei: number, dir: -1 | 1) => void;
  onChangeField: (ei: number, key: string, value: any) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          {blk.label}
        </h3>
        <Button variant="ghost" size="sm" onClick={onAdd} aria-label={`${blk.label}を追加`}>
          <Plus className="size-3.5" aria-hidden />
          <span className="ml-1 text-xs">追加</span>
        </Button>
      </header>

      <div className="p-2 space-y-2">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-3 text-center">
            未入力
          </p>
        ) : (
          entries.map((en, ei) => (
            <EntryEditor
              key={ei}
              blk={blk}
              entry={en}
              ei={ei}
              total={entries.length}
              masters={masters}
              ledScenes={ledScenes}
              onRemove={() => onRemove(ei)}
              onMove={(dir) => onMove(ei, dir)}
              onChangeField={(key, value) => onChangeField(ei, key, value)}
            />
          ))
        )}
      </div>
    </section>
  );
}

// ─── EntryEditor: 1 entry = 1 card ──────────────────────
function EntryEditor({
  blk,
  entry,
  ei,
  total,
  masters,
  ledScenes,
  onRemove,
  onMove,
  onChangeField,
}: {
  blk: Block;
  entry: any;
  ei: number;
  total: number;
  masters: any;
  ledScenes?: any[];
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onChangeField: (key: string, value: any) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2 space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">#{ei + 1}</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={ei === 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="上へ"
          >
            <ChevronUp className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={ei === total - 1}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="下へ"
          >
            <ChevronDown className="size-3.5" aria-hidden />
          </button>
          <HighlightPicker
            value={entry.highlight}
            onChange={(c) => onChangeField("highlight", c || undefined)}
          />
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="削除"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

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
      <Input
        value={entry.cue || ""}
        onChange={(e) => onChangeField("cue", e.target.value)}
        placeholder="Cue (例: V明け / Qワード / 卓D)"
      />
      <Input
        value={entry.transition || ""}
        onChange={(e) => onChangeField("transition", e.target.value)}
        placeholder="トランジション (例: F.I. / C.I.)"
      />
    </>
  );
}
