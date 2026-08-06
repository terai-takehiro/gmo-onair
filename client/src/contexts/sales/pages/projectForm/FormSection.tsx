/**
 * 案件フォームの枠 (v4)
 *
 * 節ごとに `<Card>` を書くと、見出しの大きさ・余白・角丸が節ごとにばらつきます
 * （分割前は `text-base` の見出しと `rounded-lg` / `rounded-xl` が混ざっていました）。
 * ここ1か所で決めます。案件詳細の概要タブと同じ形です。
 */
import type { ReactNode } from 'react';

export function FormSection({
  title, description, action, children,
}: {
  title: string;
  /** 節の説明。**「何のためにここを埋めるか」だけ**を1行で */
  description?: ReactNode;
  /** 見出しの右に置く操作 */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-3">
        <h2 className="text-cardtitle min-w-0 flex-1">{title}</h2>
        {action}
      </div>
      <div className="space-y-4 px-4 py-4">
        {description && <p className="text-note text-muted-foreground">{description}</p>}
        {children}
      </div>
    </section>
  );
}

/** 入力欄1つ分。ラベルと説明・エラーの位置を揃える */
export function Field({
  label, hint, error, htmlFor, children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="text-sub mb-1 block text-secondary-foreground"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-note mt-1 text-muted-foreground">{hint}</p>}
      {error && <p className="text-note mt-1 text-destructive">{error}</p>}
    </div>
  );
}
