import { ImageIcon } from "lucide-react";
import EntryImageButton from "./cells/EntryImageButton";
import StageDiagramCell from "./StageDiagramCell";
import { MicAssignmentMobilePanel, ValueBlockPanel, BlockPanel } from "./CueRowMobilePanels";
import BufferedInput from "./BufferedInput";

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
 *
 * ⚠️ 入力欄は必ず BufferedInput / BufferedTextarea を使う (素の
 * <input value onChange> / <textarea value onChange> で日本語を編集しない)。
 * collab では 1 打鍵ごとに applyDataUpdate → Y.Doc → snapshot → props と
 * 1 レンダー遅れて戻ってくるため、PC と同じ壊れ方の条件が揃っている
 * (client-qsheet/CLAUDE.md「入力欄は素の <input value onChange> で書かない」)。
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
          <BufferedInput
            value={row.label || ""}
            onCommit={(v) => patchRow({ label: v })}
            placeholder="例: オープニング"
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">尺 (秒・mm:ss など)</span>
          <BufferedInput
            value={String(row.duration || "")}
            onCommit={(v) => patchRow({ duration: v })}
            placeholder="例: 30 / 1:30"
            inputMode="numeric"
            className="mt-1"
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
          // セルの形は { image?: string } (トップレベル)。scenario 系の entries[0].image
          // とは違う持ち方 (05-editor-impl.md §2-1・§5-1)。既存の読み手
          // PreviewModal.tsx が cell.image をトップレベルで読むため、書き手も合わせる。
          // アップロードは PC (cells/slide.tsx) と同じく EntryImageButton をそのまま使う。
          // 削除は undefined を書く (空文字にしない。ydocDiff.ts がセル削除として扱う)。
          const cell = row.cells?.[blk.id] || {};
          const imageUrl: string | undefined = cell.image;
          const setImage = (url: string | null) => patchCell(blk, { image: url || undefined });
          return (
            <section key={blk.id} className="rounded-lg border border-border bg-card overflow-hidden">
              <header className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{blk.label}</h3>
              </header>
              <div className="p-2 space-y-2">
                {imageUrl ? (
                  <div className="relative inline-block w-fit">
                    <img
                      src={imageUrl}
                      alt=""
                      className="max-h-32 max-w-full rounded border border-border object-contain"
                    />
                    <button
                      onClick={() => setImage(null)}
                      className="min-h-tap min-w-tap absolute -top-2 -right-2 flex items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-destructive text-xs shadow-sm"
                      title="画像を削除"
                      aria-label="画像を削除"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-16 border border-dashed border-border rounded text-muted-foreground text-xs gap-1">
                    <ImageIcon size={14} />
                    スライド
                  </div>
                )}
                <div className="flex justify-center">
                  <EntryImageButton imageUrl={imageUrl} onChange={setImage} hideThumbnail />
                </div>
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

// MicAssignmentMobilePanel / ValueBlockPanel / BlockPanel / EntryEditor / LedXrEntry は
// CueRowMobilePanels.tsx に移設 (400行ルール)。
