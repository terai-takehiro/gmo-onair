/**
 * 案件作成の項目1つ（見出し ＋ 中身 ＋ 補足）
 *
 * **PC とスマホで同じもの**を使います。`full` を渡すと2列のときに横いっぱい。
 * 1列（390px）のときは `sm:col-span-2` が効かないので何もしません。
 */
import { Label } from '@/components/ui/label';

export function Field({
  label, hint, required, full, htmlFor, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? 'sm:col-span-2' : undefined}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-note mt-1 text-muted-foreground">{hint}</p>}
    </div>
  );
}
