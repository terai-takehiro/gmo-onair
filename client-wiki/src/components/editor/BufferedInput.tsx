/**
 * 日本語入力を壊さない1行の入力欄（題名）
 *
 * 見た目は素の `<input>` と同じで、値は変換が確定してから `onCommit` で外へ出ます。
 * 理由は `lib/useBufferedValue.ts` の冒頭。**生の `<input value={…} onChange={…}>` で
 * 文字列を編集しないこと**（制作技術支援と同じ約束。`npm run verify:ime` が見ています）。
 */
import { useBufferedValue } from '@/lib/useBufferedValue';

type Props = {
  value: string;
  onCommit: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

export default function BufferedInput({ value, onCommit, ...rest }: Props) {
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
