import { useRef, useEffect } from "react";
import { useBufferedValue } from "@/lib/useBufferedValue";

// ─── Buffered textarea ──────────────────────────────────
// 入力中はローカル state に保持し、blur / IME 確定 / 短いデバウンスでのみグローバル
// state へ commit する。**これが無いと日本語の変換中の文字が消える** ほか、
// 「1 打鍵ごとに巨大なドキュメント全体が再レンダーされて入力がもたつく」問題も起きる。
//
// 段5 PR3 で CueRow.tsx から切り出した共有部品 (挙動は変えていない)。
// scenario / remarks・item・lighting (value 形) の各セルから使う。
export default function BufferedTextarea({
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
