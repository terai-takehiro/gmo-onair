// スケジュール表専用の複数行 IME セーフ入力欄。
// `CueRow.tsx` 内の同名コンポーネントと同じ作り（`useBufferedValue` を使う）。
// 備考欄など、素の <textarea> を使うと日本語変換が壊れる欄に使う。
import { useBufferedValue } from "@/lib/useBufferedValue";

export default function BufferedTextarea({
  value,
  onCommit,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const buf = useBufferedValue(value, onCommit);
  return (
    <textarea
      {...rest}
      value={buf.val}
      onChange={(e) => buf.onChange(e.target.value)}
      onFocus={buf.onFocus}
      onBlur={buf.onBlur}
      onCompositionStart={buf.onCompositionStart}
      onCompositionEnd={(e) => buf.onCompositionEnd((e.target as HTMLTextAreaElement).value)}
    />
  );
}
