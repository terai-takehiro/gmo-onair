import * as React from "react";
import { Inbox } from "lucide-react";
import { cn } from "../utils";

/**
 * EmptyState — データなし時の表示
 * デジタル庁ダッシュボードガイドブック: 空の状態でも情報の意味を伝え、
 * 利用者が次に取るべきアクションを示す。
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title = "データがありません",
  description,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-4 py-10 text-center",
        className
      )}
      role="status"
      {...rest}
    >
      <div className="text-muted-foreground [&>svg]:h-8 [&>svg]:w-8" aria-hidden="true">
        {icon ?? <Inbox />}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-md text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
