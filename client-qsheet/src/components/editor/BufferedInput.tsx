// IME (日本語入力) を壊さない 1 行入力欄。
// 見た目は素の <input> と同じ (クラス・placeholder 等はそのまま渡る)。
// 値は変換が確定してから onCommit で外へ出る (理由は lib/useBufferedValue.ts)。
import { useBufferedValue } from "@/lib/useBufferedValue";

export default function BufferedInput({
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
