// 自由ブロック「文字」の中身（段B）。選択中はダブルクリックで編集モードに入り、
// BufferedTextarea をブロックと同じ大きさで重ねて表示する。blur（IME確定込み）で
// 確定するので、独自の確定処理は持たない（`useBufferedValue` の commit がそのまま効く）。
// 大きさ・太さ・色は `style`（BlockInspector が書く）、そろえは `content.align`。
import { useState, type CSSProperties, type KeyboardEvent } from "react";
import BufferedTextarea from "@/components/editor/cells/BufferedTextarea";
import type { ManualTextContent } from "@gmo-onair/shared/src/opsmanual/types";
import { manualBlockCssStyle } from "../manualBlockStyle";

interface Props {
  content: ManualTextContent;
  style: Record<string, string | number>;
  selected: boolean;
  onCommit: (content: ManualTextContent) => void;
}

export default function TextBlockContent({ content, style, selected, onCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const textStyle: CSSProperties = {
    // `style` はケバブケースの CSS プロパティ名（BlockInspector.tsx の patchStyle）。
    // 素通しすると font-size/font-weight が効かないため変換する（manualBlockStyle.ts）
    ...manualBlockCssStyle(style),
    textAlign: content.align ?? "left",
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
  };

  if (editing) {
    return (
      // onBlur は子の blur が親まで伝わる (React 17+ の focus/blur は bubble する)
      // ので、ここで編集モードを抜ける。値そのものは BufferedTextarea が blur で確定する。
      // onPointerDown で伝播を止めないと、カーソル位置あわせのクリックがブロックの
      // 「つかんで動かす」に化ける（ManualBlockView の pointerdown はブロックの
      // 移動ドラッグを兼ねる）。
      <div className="h-full w-full" onBlur={() => setEditing(false)} onPointerDown={(e) => e.stopPropagation()}>
        <BufferedTextarea
          value={content.text}
          onCommit={(v) => onCommit({ ...content, text: v })}
          onKeyDown={handleKeyDown}
          autoFocus
          className="h-full w-full resize-none border-0 bg-transparent p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={textStyle}
        />
      </div>
    );
  }

  return (
    <div
      className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1"
      style={textStyle}
      onDoubleClick={() => { if (selected) setEditing(true); }}
    >
      {content.text || (selected ? <span className="text-muted-foreground">（ダブルクリックで文字を入力）</span> : null)}
    </div>
  );
}
