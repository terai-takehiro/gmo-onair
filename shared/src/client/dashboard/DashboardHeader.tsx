import * as React from "react";
import { cn } from "../utils";
import { PageTitle } from "../ui/numbers";

/**
 * DashboardHeader — ページ最上部の見出しエリア
 * デジタル庁ダッシュボードガイドブック「情報階層」: タイトル最優先、次に期間/フィルタ、最後にアクション。
 *
 * Props:
 *   - title       : ダッシュボード名（必須）
 *   - description : 1-2文の目的説明 (任意)
 *   - period      : 期間表示 ("2026年4月" 等) または <select>
 *   - controls    : 右端に配置するアクション (refresh, period toggle 等)
 *   - lastUpdated : データ鮮度表示 ("最終更新: YYYY/MM/DD HH:mm")
 */
export interface DashboardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  period?: React.ReactNode;
  controls?: React.ReactNode;
  lastUpdated?: React.ReactNode;
}

export function DashboardHeader({
  title,
  description,
  period,
  controls,
  lastUpdated,
  className,
  ...rest
}: DashboardHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)} {...rest}>
      <div className="min-w-0 flex-1">
        {/*
          見出しは `PageTitle` に寄せる (v2.9.297)。ここは `sm:text-2xl`、
          `PageTitle` は `lg:text-2xl` だったため、**同じ画面で見出しが2段になる**
          ことがあった (v2.9.288 で `/finance/import` で実際に起きていた)。
        */}
        <PageTitle>{title}</PageTitle>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
        {period ? (
          <p className="mt-2 text-sm font-medium text-foreground" aria-label="集計期間">
            {period}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lastUpdated ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {lastUpdated}
          </span>
        ) : null}
        {controls}
      </div>
    </header>
  );
}
