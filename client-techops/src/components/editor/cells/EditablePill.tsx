import { useState, useRef } from "react";

// ─── EditablePill ───────────────────────────────────────
// 固定幅w-14、フォントサイズ11px、3文字超はscaleXで圧縮
//
// 段5 PR3 で CueRow.tsx から切り出した共有部品 (挙動は変えていない)。
// scenario (話者名) / video・audio・telop (ラベルID) の各セルから使う。
export default function EditablePill({
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
          className="w-14 h-5 flex-none text-[11px] font-bold text-center rounded-chip outline-none bg-muted text-muted-foreground placeholder:text-muted-foreground transition-all"
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
        className="w-14 h-5 flex-none rounded-chip border border-dashed border-border bg-transparent cursor-text hover:bg-accent transition-colors flex items-center justify-center text-[10px] text-muted-foreground"
        title="クリックで編集"
      >
        {placeholder}
      </span>
    );
  }

  return (
    <span
      onClick={startEditing}
      className={`w-14 h-5 rounded-chip ${color} flex-none cursor-pointer hover:opacity-80 transition-opacity overflow-hidden`}
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
