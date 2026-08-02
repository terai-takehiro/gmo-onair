import { memo, useState, useRef, useId, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown, Copy, Trash2, ImageIcon, ImagePlus, Loader2, Plus, Check } from "lucide-react";
import api from "@/lib/api";
import StageDiagramCell from "./StageDiagramCell";
import { HighlightPicker } from "./HighlightPicker";
import MicAssignmentCell from "./MicAssignmentCell";

// ─── Buffered text inputs ───────────────────────────────
// 入力中はローカル state に保持し、blur / IME 確定 / 短いデバウンスでのみグローバル
// state へ commit する。これにより「1 打鍵ごとに巨大なドキュメント全体が再レンダー
// されて入力がもたつく」問題を解消する (出演者名フィールドと同じ buffer 方式)。
const COMMIT_DELAY = 500;

function useBufferedValue(value: string, onCommit: (v: string) => void) {
  const [val, setVal] = useState(value);
  const valRef = useRef(value);
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);
  const onCommitRef = useRef(onCommit);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  onCommitRef.current = onCommit;

  // フォーカスしていないときだけ外部からの値変更を取り込む (入力中のカーソル飛びを防ぐ)
  useEffect(() => {
    if (!focusedRef.current && value !== valRef.current) {
      committedRef.current = value;
      valRef.current = value;
      setVal(value);
    }
  }, [value]);

  const commit = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (composingRef.current) return;
    if (valRef.current !== committedRef.current) {
      committedRef.current = valRef.current;
      onCommitRef.current(valRef.current);
    }
  }, []);

  // アンマウント時 (行削除等) に未 commit を flush
  useEffect(() => () => { commit(); }, [commit]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, COMMIT_DELAY);
  }, [commit]);

  const onChange = useCallback((v: string) => {
    valRef.current = v;
    setVal(v);
    if (!composingRef.current) schedule();
  }, [schedule]);

  const onFocus = useCallback(() => { focusedRef.current = true; }, []);
  const onBlur = useCallback(() => { focusedRef.current = false; commit(); }, [commit]);
  const onCompositionStart = useCallback(() => { composingRef.current = true; }, []);
  const onCompositionEnd = useCallback((v: string) => {
    composingRef.current = false;
    valRef.current = v;
    setVal(v);
    schedule();
  }, [schedule]);

  return { val, onChange, onFocus, onBlur, onCompositionStart, onCompositionEnd };
}

function BufferedTextarea({
  value,
  onCommit,
  autosize,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  autosize?: boolean;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const buf = useBufferedValue(value, onCommit);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autosize && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [buf.val, autosize]);
  return (
    <textarea
      {...rest}
      ref={ref}
      value={buf.val}
      onChange={(e) => buf.onChange(e.target.value)}
      onFocus={buf.onFocus}
      onBlur={buf.onBlur}
      onCompositionStart={buf.onCompositionStart}
      onCompositionEnd={(e) => buf.onCompositionEnd((e.target as HTMLTextAreaElement).value)}
    />
  );
}

function BufferedInput({
  value,
  onCommit,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const buf = useBufferedValue(value, onCommit);
  return (
    <input
      {...rest}
      value={buf.val}
      onChange={(e) => buf.onChange(e.target.value)}
      onFocus={buf.onFocus}
      onBlur={buf.onBlur}
      onCompositionStart={buf.onCompositionStart}
      onCompositionEnd={(e) => buf.onCompositionEnd((e.target as HTMLInputElement).value)}
    />
  );
}

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

interface LedScene {
  id: string;
  name: string;
  wall: string;
  floor: string;
}

interface CueRowProps {
  row: CueRowData;
  blocks: Block[];
  masters: any;
  stageTemplates?: any[];
  ledScenes?: LedScene[];
  collapsedBlocks?: Set<string>;
  speakerColorMap: Record<string, string>;
  /** マイク香盤「前cue継承」用 — 直前の audio_mic セルの assignments を返す */
  findPrevAudioMicAssignments?: (blockId: string) => any[] | null;
  onChange: (updater: (r: CueRowData) => CueRowData) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  /** この行の直下に空行を挿入 (途中に行を追加) */
  onInsertBelow?: () => void;
  /** 行の複数選択 (グループ ドラッグ移動用) */
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
  // v1.2.9: エントリ単位の削除（ゴミ箱経由）を親 (CueTable→EditorPage) で処理するためのコールバック
  onDeleteEntry?: (blockId: string, entryIdx: number, payload: any, meta: { sectionLabel?: string; rowLabel?: string }) => void;
  // v2.8.32: 行 DnD 用 (HTML5 native drag&drop)
  isRowDragged?: boolean;
  isRowDropTarget?: boolean;
  onRowDragStart?: (e: React.DragEvent) => void;
  onRowDragOver?: (e: React.DragEvent) => void;
  onRowDragLeave?: (e: React.DragEvent) => void;
  onRowDrop?: (e: React.DragEvent) => void;
  onRowDragEnd?: (e: React.DragEvent) => void;
}

// ─── LED/XR cue & transition options ────────────────────
const LED_CUE_OPTIONS = ["V明け", "Qワード", "卓D"] as const;
const LED_TRANSITION_OPTIONS = [
  { value: "F.I.", label: "フェードイン (F.I.)" },
  { value: "C.I.", label: "カットイン (C.I.)" },
] as const;

// ─── EntryImageButton ───────────────────────────────────
// エントリごとの画像添付ボタン。
// hideThumbnail=true のときは画像が設定されていてもサムネを出さず、
// 「変更」ボタンとして機能する（実プレビューは親側で大きく表示する）。
function EntryImageButton({
  imageUrl,
  onChange,
  hideThumbnail = false,
}: {
  imageUrl?: string;
  onChange: (url: string | null) => void;
  hideThumbnail?: boolean;
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

  if (imageUrl && !hideThumbnail) {
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

  const hasImage = !!imageUrl;
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className={`flex-shrink-0 w-5 h-5 rounded transition-colors mt-[1px] flex items-center justify-center ${
          hasImage
            ? "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            : "text-zinc-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 opacity-0 group-hover:opacity-100"
        }`}
        title={hasImage ? "画像を変更" : "画像を添付"}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 size={12} className="animate-spin" />
        ) : hasImage ? (
          <ImageIcon size={12} />
        ) : (
          <ImagePlus size={12} />
        )}
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
function CueRowImpl({
  row,
  blocks,
  masters,
  stageTemplates,
  ledScenes,
  collapsedBlocks,
  speakerColorMap,
  findPrevAudioMicAssignments,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onInsertBelow,
  isSelected,
  onToggleSelect,
  onDeleteEntry,
  isRowDragged,
  isRowDropTarget,
  onRowDragStart,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  onRowDragEnd,
}: CueRowProps) {
  const rowUid = useId();
  const dragHandlers = onRowDragStart
    ? {
        draggable: true,
        onDragStart: onRowDragStart,
        onDragOver: onRowDragOver,
        onDragLeave: onRowDragLeave,
        onDrop: onRowDrop,
        onDragEnd: onRowDragEnd,
      }
    : {};
  const dragClass = `${onRowDragStart ? "cursor-grab active:cursor-grabbing" : ""} ${isRowDragged ? "opacity-40" : ""} ${isRowDropTarget ? "outline outline-2 outline-primary outline-offset-[-2px]" : ""}`;

  // onDeleteEntry は v2.8.155 で「行 = エントリ」に統一されたため未使用。
  // 過去版との互換のため Props に残置 (CueTable から渡るが内部では使わない)。
  void onDeleteEntry;

  const updateCell = (blockId: string, newCell: any) => {
    onChange((r) => ({ ...r, cells: { ...r.cells, [blockId]: newCell } }));
  };

  // 同時共同編集 (Phase 3): セルにライブカーソル用の識別子を付ける (row.id は文書内で一意)。
  const rowId = (row as any).id as string | undefined;
  const cellKey = (blockId: string) => (rowId ? `${rowId}|${blockId}` : undefined);

  // v2.8.155: 1 行 = 1 エントリに統一。常に entries[0] を読み書きする。
  const getEntry = (blk: Block) => {
    const cell = row.cells?.[blk.id] || {};
    if (blk.type === "scenario" || ["video", "audio", "telop"].includes(blk.type)) {
      return (cell.entries || [])[0] || null;
    }
    return null;
  };

  const updateEntry = (blk: Block, field: string, value: any) => {
    const cell = { ...(row.cells?.[blk.id] || {}) };
    const entries = Array.isArray(cell.entries) ? [...cell.entries] : [];
    if (entries.length === 0) {
      entries.push(blk.type === "scenario" ? { name: "", html: "", isQWord: false } : { label: "", memo: "" });
    }
    entries[0] = { ...entries[0], [field]: value };
    cell.entries = entries;
    updateCell(blk.id, cell);
  };

  // シナリオセルの highlight (行全体の背景色) を取得
  const scenarioBlock = blocks.find((b) => b.type === "scenario");
  const scenarioEntry: any = scenarioBlock ? (row.cells?.[scenarioBlock.id]?.entries || [])[0] : null;
  const rowHighlight = (scenarioEntry?.highlight as string | undefined) || undefined;

  return (
    <tr
      {...dragHandlers}
      className={`group transition-colors duration-150 hover:bg-blue-50/40 dark:hover:bg-blue-950/10 border-b border-zinc-100/80 dark:border-zinc-800/60 ${isSelected ? "ring-2 ring-inset ring-primary/60 bg-primary/5" : ""} ${dragClass}`}
      style={rowHighlight ? { backgroundColor: rowHighlight } : undefined}
    >
          {blocks.map((blk) => {
            if (collapsedBlocks?.has(blk.id)) {
              return <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="border-r border-zinc-100/60 dark:border-zinc-800/40" />;
            }
            const en = getEntry(blk);

            // ── Scenario cell ──
            if (blk.type === "scenario") {
              const color = en?.name ? (speakerColorMap[en.name] || SPEAKER_COLORS[0]) : "bg-zinc-400";
              return (
                <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden break-words align-top">
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

            // ── Video / Audio / Telop cells (paired: pill + memo) ──
            if (["video", "audio", "telop"].includes(blk.type)) {
              const pillColor = PILL_COLORS[blk.type] || "bg-zinc-600";
              return (
                <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <EditablePill
                        value={en?.label || ""}
                        color={en?.label ? pillColor : "bg-zinc-400"}
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

            // ── Audio mic (マイク香盤) cell ──
            if (blk.type === "audio_mic") {
              return (
                <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
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

            // ── Stage diagram cell ──
            if (blk.type === "stage_diagram") {
              return (
                <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
                  <StageDiagramCell
                    cell={row.cells?.[blk.id]}
                    stageTemplates={stageTemplates}
                    onChange={(val) => updateCell(blk.id, val)}
                  />
                </td>
              );
            }

            // ── Slide cell (image drop zone) ──
            if (blk.type === "slide") {
              return (
                <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
                  <div className="flex items-center justify-center h-16 border border-dashed border-zinc-200 dark:border-zinc-700 rounded text-zinc-300 dark:text-zinc-600 text-xs">
                    <ImageIcon size={14} className="mr-1" />
                    スライド
                  </div>
                </td>
              );
            }

            // ── LED/XR cell ──
            if (blk.type === "led_xr") {
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
                <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
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
                        <input
                          value={ledEntry.cueCustom || ""}
                          onChange={(e) => updateLed("cueCustom", e.target.value)}
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
                        <input
                          value={ledEntry.transitionCustom || ""}
                          onChange={(e) => updateLed("transitionCustom", e.target.value)}
                          placeholder="効果 (任意)"
                          className="flex-1 px-1.5 py-1 text-[11px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded outline-none focus:border-violet-400"
                        />
                      )}
                    </div>
                  </div>
                </td>
              );
            }

            // ── Remarks / other cells ──
            return (
              <td key={blk.id} data-collab-cell={cellKey(blk.id)} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
                <BufferedTextarea
                  value={(row.cells?.[blk.id] || {}).value || ""}
                  onCommit={(v) => updateCell(blk.id, { ...(row.cells?.[blk.id] || {}), value: v })}
                  className="w-full min-h-[20px] text-[12px] bg-transparent border-none outline-none resize-none"
                  style={{ lineHeight: "20px" }}
                  placeholder="メモ..."
                />
              </td>
            );
          })}

          {/* 操作ボタン (モバイル常時表示) */}
          <td className="px-0.5 align-top w-9 border-b border-zinc-100/80 dark:border-zinc-800/60">
            <div className="flex flex-col items-center gap-0.5 pt-1">
              {onToggleSelect && (
                <button
                  onClick={onToggleSelect}
                  className={`size-5 rounded border flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground opacity-100"
                      : "border-zinc-300 dark:border-zinc-600 text-transparent opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
                  }`}
                  title="行を選択 (まとめて移動 / Shift+クリックで範囲選択)"
                  aria-pressed={isSelected}
                  aria-label="行を選択"
                >
                  <Check size={12} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-col items-center gap-0.5 pt-0.5 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200">
              <button onClick={onMoveUp} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors">
                <ChevronUp size={14} />
              </button>
              <button onClick={onMoveDown} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors">
                <ChevronDown size={14} />
              </button>
              <button onClick={onInsertBelow} className="p-1.5 text-zinc-400 hover:text-primary active:text-primary transition-colors" title="この行の下に空行を挿入">
                <Plus size={13} />
              </button>
              <button onClick={onDuplicate} className="p-1.5 text-zinc-400 hover:text-zinc-600 active:text-zinc-800 transition-colors" title="この行を複製">
                <Copy size={12} />
              </button>
              <button onClick={onDelete} className="p-1.5 text-zinc-400 hover:text-red-400 active:text-red-600 transition-colors" title="この行を削除">
                <Trash2 size={12} />
              </button>
            </div>
          </td>
    </tr>
  );
}

// React.memo: row / blocks / masters / 各種 collection が shallow 同一なら再レンダーをスキップ
// CueTable から渡される on* コールバックは CueRowSlot で useCallback 化されている前提
const CueRow = memo(CueRowImpl);
export default CueRow;
