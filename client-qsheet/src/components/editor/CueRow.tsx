import { useState, useRef, useId } from "react";
import { ChevronUp, ChevronDown, Copy, Trash2, ImageIcon, ImagePlus, Loader2 } from "lucide-react";
import api from "@/lib/api";
import StageDiagramCell from "./StageDiagramCell";

// ─── Types ──────────────────────────────────────────────
interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
  widthPx?: number;
}

interface CueRowData {
  duration: string;
  cells: Record<string, any>;
  [key: string]: any;
}

interface CueRowProps {
  row: CueRowData;
  blocks: Block[];
  masters: any;
  stageTemplates?: any[];
  collapsedBlocks?: Set<string>;
  speakerColorMap: Record<string, string>;
  onChange: (updater: (r: CueRowData) => CueRowData) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  // v1.2.9: エントリ単位の削除（ゴミ箱経由）を親 (CueTable→EditorPage) で処理するためのコールバック
  onDeleteEntry?: (blockId: string, entryIdx: number, payload: any, meta: { sectionLabel?: string; rowLabel?: string }) => void;
}

// ─── EntryImageButton ───────────────────────────────────
// エントリごとの画像添付ボタン（小さいサムネ + アップロード UI）
function EntryImageButton({
  imageUrl,
  onChange,
}: {
  imageUrl?: string;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("ファイルサイズが5MBを超えています");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const res = await api.post("/qsheet/upload-image", {
        data: dataUrl,
        filename: file.name,
        mimeType: file.type,
      });
      onChange(res.data.data.url);
    } catch {
      alert("画像のアップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  };

  if (imageUrl) {
    return (
      <div className="relative flex-shrink-0 group/img" title="画像">
        <img
          src={imageUrl}
          alt=""
          className="h-6 w-6 rounded object-cover border border-zinc-200 dark:border-zinc-700"
        />
        <button
          onClick={() => onChange(null)}
          className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-white border border-zinc-300 text-zinc-500 hover:text-red-500 text-[10px] leading-none flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
          title="画像を削除"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="flex-shrink-0 w-5 h-5 rounded text-zinc-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors opacity-0 group-hover:opacity-100 mt-[1px] flex items-center justify-center"
        title="画像を添付"
        disabled={uploading}
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
          e.target.value = ""; // 同ファイルの再選択を許可
        }}
      />
    </>
  );
}

// ─── EditablePill ───────────────────────────────────────
// 固定幅w-14、フォントサイズ11px、3文字超はscaleXで圧縮
function EditablePill({
  value,
  color,
  placeholder,
  datalistId,
  datalistOptions,
  onChange,
}: {
  value: string;
  color: string;
  placeholder: string;
  datalistId: string;
  datalistOptions?: string[];
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  // IME composition 中かどうか追跡（日本語入力の最中に onChange が早まるのを防ぐ）
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const len = (value || "").length;
  const scale = len <= 3 ? 1 : Math.max(0.5, 3 / len);

  const startEditing = () => {
    // 編集開始時、現在の値を editValue にコピー（空なら空文字）
    // v1.2.8 までは setEditValue("") + 2 つの input 分岐で
    // 初回 1 文字が欠損する既知バグがあったため、ここで統一。
    setEditValue(value || "");
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const commit = () => {
    // IME composition 中の commit は禁止（Enter/blur で確定前の値が拾われるのを避ける）
    if (composingRef.current) return;
    if (editValue !== value) onChange(editValue);
    setEditing(false);
  };

  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          list={datalistId}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            // composition 確定時に値を取り込む
            setEditValue((e.target as HTMLInputElement).value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          autoFocus
          className="w-14 h-5 flex-none text-[11px] font-bold text-center rounded-full outline-none bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-400 transition-all"
          placeholder={placeholder}
        />
        <datalist id={datalistId}>
          {(datalistOptions || []).map((p, i) => (
            <option key={i} value={p} />
          ))}
        </datalist>
      </>
    );
  }

  // 非編集時: 値の有無にかかわらず常にクリック可能な pill
  if (!value) {
    return (
      <span
        onClick={startEditing}
        className="w-14 h-5 flex-none rounded-full border border-dashed border-zinc-300 dark:border-zinc-600 bg-transparent cursor-text hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center text-[10px] text-zinc-400 dark:text-zinc-500"
        title="クリックで編集"
      >
        {placeholder}
      </span>
    );
  }

  return (
    <span
      onClick={startEditing}
      className={`w-14 h-5 rounded-full ${color} flex-none cursor-pointer hover:opacity-80 transition-opacity overflow-hidden`}
      title="クリックで編集"
    >
      <span
        className="flex items-center justify-center w-full h-full text-white text-[11px] font-bold whitespace-nowrap"
        style={scale < 1 ? { transform: `scaleX(${scale})` } : undefined}
      >
        {value}
      </span>
    </span>
  );
}

// ─── Speaker Colors ─────────────────────────────────────
const SPEAKER_COLORS = [
  "bg-slate-700", "bg-teal-700", "bg-purple-700", "bg-pink-700", "bg-amber-700",
  "bg-green-700", "bg-blue-700", "bg-red-800", "bg-indigo-700", "bg-orange-700",
];
const PILL_COLORS: Record<string, string> = { video: "bg-blue-700", audio: "bg-rose-700", telop: "bg-purple-700" };

// ─── CueRow ─────────────────────────────────────────────
export default function CueRow({
  row,
  blocks,
  masters,
  stageTemplates,
  collapsedBlocks,
  speakerColorMap,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDeleteEntry,
}: CueRowProps) {
  const rowUid = useId();

  const updateCell = (blockId: string, newCell: any) => {
    onChange((r) => ({ ...r, cells: { ...r.cells, [blockId]: newCell } }));
  };

  // シナリオのエントリ数を基準にサブ行を生成
  const scenarioBlock = blocks.find((b) => b.type === "scenario");
  const scenarioEntries: any[] = scenarioBlock ? (row.cells?.[scenarioBlock.id]?.entries || []) : [];
  const entryCount = Math.max(scenarioEntries.length, 1);

  const getEntry = (blk: Block, ei: number) => {
    const cell = row.cells?.[blk.id] || {};
    if (blk.type === "scenario") return (cell.entries || [])[ei] || null;
    if (["video", "audio", "telop"].includes(blk.type)) return (cell.entries || [])[ei] || null;
    return null;
  };

  const updateEntry = (blk: Block, ei: number, field: string, value: any) => {
    const cell = { ...(row.cells?.[blk.id] || {}) };
    if (!cell.entries) cell.entries = [];
    while (cell.entries.length <= ei) {
      cell.entries.push(blk.type === "scenario" ? { name: "", html: "", isQWord: false } : { label: "", memo: "" });
    }
    cell.entries[ei] = { ...cell.entries[ei], [field]: value };
    updateCell(blk.id, cell);
  };

  // エントリ単位の削除（ゴミ箱経由）
  // 親コンポーネント (EditorPage) が doc.data.trash に退避する
  const deleteEntry = (blk: Block, ei: number, sectionLabel?: string) => {
    const cell = row.cells?.[blk.id] || {};
    const entry = (cell.entries || [])[ei];
    if (!entry) return;
    // 親コールバックでゴミ箱へ退避（未指定なら退避せず単に削除のみ）
    if (onDeleteEntry) {
      onDeleteEntry(blk.id, ei, entry, { sectionLabel, rowLabel: row.label });
    }
    // 行ローカルでも entries から除去
    onChange((r) => {
      const cells = { ...(r.cells || {}) };
      const c = { ...(cells[blk.id] || {}) };
      c.entries = (c.entries || []).filter((_: any, i: number) => i !== ei);
      cells[blk.id] = c;
      return { ...r, cells };
    });
  };

  // 全列に同時にエントリを追加
  const addEntryToAllBlocks = () => {
    onChange((r) => {
      const newCells = { ...r.cells };
      blocks.forEach((blk) => {
        const cell = newCells[blk.id] || {};
        if (blk.type === "scenario") {
          newCells[blk.id] = { ...cell, entries: [...(cell.entries || []), { name: "", html: "", isQWord: false }] };
        } else if (["video", "audio", "telop"].includes(blk.type)) {
          newCells[blk.id] = { ...cell, entries: [...(cell.entries || []), { label: "", memo: "" }] };
        }
      });
      return { ...r, cells: newCells };
    });
  };

  return (
    <>
      {Array.from({ length: entryCount }).map((_, ei) => (
        <tr
          key={ei}
          className={`group transition-colors duration-150 hover:bg-blue-50/40 dark:hover:bg-blue-950/10 ${
            ei === entryCount - 1 ? "border-b border-zinc-100/80 dark:border-zinc-800/60" : ""
          }`}
        >
          {blocks.map((blk) => {
            if (collapsedBlocks?.has(blk.id)) {
              return <td key={blk.id} className="border-r border-zinc-100/60 dark:border-zinc-800/40" />;
            }
            const en = getEntry(blk, ei);

            // ── Scenario cell ──
            if (blk.type === "scenario") {
              const color = en?.name ? (speakerColorMap[en.name] || SPEAKER_COLORS[0]) : "bg-zinc-400";
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden break-words align-top">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <button
                      onClick={() => updateEntry(blk, ei, "isQWord", !en?.isQWord)}
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
                      datalistId={`p-${rowUid}-${blk.id}-${ei}`}
                      datalistOptions={masters?.persons}
                      onChange={(v) => updateEntry(blk, ei, "name", v)}
                    />
                    {en?.isQWord && <span className="flex-shrink-0 text-red-500 font-bold text-[13px] leading-[20px]">Q→</span>}
                    <textarea
                      value={en?.html?.replace(/<[^>]*>/g, "") || ""}
                      onChange={(e) => updateEntry(blk, ei, "html", e.target.value)}
                      rows={1}
                      className="text-[13px] bg-transparent border-none outline-none resize-none overflow-hidden min-w-0 w-0"
                      style={{ flex: "1 1 0", overflowWrap: "break-word", lineHeight: "20px" }}
                      placeholder={en?.isQWord ? "Qワード..." : "テキスト..."}
                      onInput={(e) => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = "auto";
                        t.style.height = t.scrollHeight + "px";
                      }}
                      ref={(el) => {
                        if (el) {
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }
                      }}
                    />
                    <EntryImageButton
                      imageUrl={en?.image}
                      onChange={(url) => updateEntry(blk, ei, "image", url || undefined)}
                    />
                    {en && (scenarioEntries.length > 1) && (
                      <button
                        onClick={() => deleteEntry(blk, ei)}
                        className="flex-shrink-0 w-4 h-4 rounded-full text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100 mt-[2px] text-[10px] leading-none flex items-center justify-center"
                        title="このエントリを削除（ゴミ箱へ）"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
              );
            }

            // ── Video / Audio / Telop cells (paired: pill + memo) ──
            if (["video", "audio", "telop"].includes(blk.type)) {
              const pillColor = PILL_COLORS[blk.type] || "bg-zinc-600";
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <EditablePill
                      value={en?.label || ""}
                      color={en?.label ? pillColor : "bg-zinc-400"}
                      placeholder="ID"
                      datalistId={`${blk.type}-${rowUid}-${blk.id}-${ei}`}
                      datalistOptions={masters?.[blk.type]}
                      onChange={(v) => updateEntry(blk, ei, "label", v)}
                    />
                    <input
                      value={en?.memo || ""}
                      onChange={(e) => updateEntry(blk, ei, "memo", e.target.value)}
                      className="text-[12px] bg-transparent border-none outline-none min-w-0"
                      style={{ flex: "1 1 0", lineHeight: "20px" }}
                      placeholder="メモ..."
                    />
                    <EntryImageButton
                      imageUrl={en?.image}
                      onChange={(url) => updateEntry(blk, ei, "image", url || undefined)}
                    />
                    {en && (en.label || en.memo || en.image) && (
                      <button
                        onClick={() => deleteEntry(blk, ei)}
                        className="flex-shrink-0 w-4 h-4 rounded-full text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100 mt-[2px] text-[10px] leading-none flex items-center justify-center"
                        title="このエントリを削除（ゴミ箱へ）"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </td>
              );
            }

            // ── Stage diagram cell ──
            if (blk.type === "stage_diagram") {
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
                  {ei === 0 && (
                    <StageDiagramCell
                      cell={row.cells?.[blk.id]}
                      stageTemplates={stageTemplates}
                      onChange={(val) => updateCell(blk.id, val)}
                    />
                  )}
                </td>
              );
            }

            // ── Slide cell (image drop zone) ──
            if (blk.type === "slide") {
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
                  {ei === 0 && (
                    <div className="flex items-center justify-center h-16 border border-dashed border-zinc-200 dark:border-zinc-700 rounded text-zinc-300 dark:text-zinc-600 text-xs">
                      <ImageIcon size={14} className="mr-1" />
                      スライド
                    </div>
                  )}
                </td>
              );
            }

            // ── Remarks / other cells ──
            return (
              <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
                {ei === 0 && (
                  <textarea
                    value={(row.cells?.[blk.id] || {}).value || ""}
                    onChange={(e) => updateCell(blk.id, { ...(row.cells?.[blk.id] || {}), value: e.target.value })}
                    className="w-full min-h-[20px] text-[12px] bg-transparent border-none outline-none resize-none"
                    style={{ lineHeight: "20px" }}
                    placeholder="メモ..."
                  />
                )}
              </td>
            );
          })}

          {/* 操作ボタン — 最初のサブ行のみ (モバイル常時表示) */}
          {ei === 0 && (
            <td rowSpan={entryCount} className="px-0.5 align-top w-9 border-b border-zinc-100/80 dark:border-zinc-800/60">
              <div className="flex flex-col items-center gap-0.5 pt-1 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200">
                <button onClick={onMoveUp} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors">
                  <ChevronUp size={14} />
                </button>
                <button onClick={onMoveDown} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors">
                  <ChevronDown size={14} />
                </button>
                <button onClick={onDuplicate} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors">
                  <Copy size={12} />
                </button>
                <button onClick={onDelete} className="p-1.5 text-zinc-400 hover:text-red-400 active:text-red-600 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </td>
          )}
        </tr>
      ))}
      {/* ＋ エントリ追加行 */}
      <tr className="border-b border-zinc-50 dark:border-zinc-900 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors">
        <td colSpan={blocks.length + 1}>
          <button
            onClick={addEntryToAllBlocks}
            className="w-full text-[11px] text-zinc-300 dark:text-zinc-700 hover:text-blue-500 py-1 transition-colors duration-150"
          >
            ＋ エントリを追加
          </button>
        </td>
      </tr>
    </>
  );
}
