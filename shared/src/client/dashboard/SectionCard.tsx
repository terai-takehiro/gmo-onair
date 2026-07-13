import * as React from "react";
import { cn } from "../utils";

/**
 * SectionCard — ダッシュボード上のセクション見出し + 本体
 * デジタル庁ダッシュボードガイドブック「情報階層」に沿い、
 * 全体 → 部分へ段階的にデータを表示するためのコンテナ。
 *
 * Props:
 *   - title        : セクションタイトル (h2 レベル相当)
 *   - description  : セクションの目的を1-2文で
 *   - icon         : タイトル左のアイコン
 *   - actions      : 右端のボタン/リンク (「詳細を見る」等)
 *   - footnote     : 下部の脚注 (データソース等)
 *   - padding      : default | none | compact
 */
export interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  footnote?: React.ReactNode;
  padding?: "default" | "none" | "compact";
  children: React.ReactNode;
}

const paddingClasses = {
  default: "p-4 sm:p-6",
  compact: "p-3 sm:p-4",
  none: "",
} as const;

export function SectionCard({
  title,
  description,
  icon,
  actions,
  footnote,
  padding = "default",
  className,
  children,
  ...rest
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground",
        className
      )}
      {...rest}
    >
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:px-6 sm:py-4">
        <div className="min-w-0 flex-1">
          <h2 className="heading-section flex items-center gap-2 text-base sm:text-lg text-foreground">
            {icon ? <span className="text-primary [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">{icon}</span> : null}
            <span className="truncate">{title}</span>
          </h2>
          {description ? (
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className={paddingClasses[padding]}>{children}</div>
      {footnote ? (
        <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground sm:px-6">
          {footnote}
        </footer>
      ) : null}
    </section>
  );
}
