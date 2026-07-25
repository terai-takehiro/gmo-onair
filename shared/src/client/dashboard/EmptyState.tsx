import * as React from "react";
import { EmptyState as BaseEmptyState } from "../states/EmptyState";

/**
 * EmptyState (dashboard 互換ラッパー)
 *
 * 実装は shared/src/client/states/EmptyState.tsx に一本化した。
 * 新しい画面は `states` から直接 import すること。
 *
 * ここに残しているのは既存 29 画面の呼び出しを壊さないため。
 * title は本来必須 (「データがありません」で終わらせない — §2.4) なので、
 * 既定値に頼っている箇所を見つけたら対象ごとの文に書き換える。
 */
export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
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
}: EmptyStateProps) {
  return (
    <BaseEmptyState
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
