import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "../utils";

/**
 * KpiCard — 主要指標の定型カード
 * デジタル庁ダッシュボードガイドブック準拠:
 *   - 「違いに気づける」: 値を大きく、トレンド記号(↑↓→)で変化を可視化
 *   - 「目的に則する」: 1カード = 1指標、サブ指標は最大1つまで
 *   - アクセシビリティ: role=group, aria-labelledby, ニュートラル中心の配色
 *
 * Props:
 *   - label       : 指標名 (「売上」「粗利率」等)
 *   - value       : メイン値 (文字列またはReactノード。既にフォーマット済み)
 *   - unit        : 単位 (「円」「件」「%」等)
 *   - icon        : 先頭アイコン
 *   - trend       : 前期比等 ("+12%", "-3件" 等。マイナス記号付きで direction 自動判定)
 *   - trendLabel  : 比較対象ラベル ("前月比", "前年同期比")
 *   - emphasis    : `default` | `success` | `warning` | `negative` — 値の色で強調
 *   - footnote    : 脚注 (「社内API調べ」等)
 *   - onClick     : タップでドリルダウンする時に利用
 */
type Emphasis = "default" | "success" | "warning" | "negative" | "info";
type TrendDirection = "up" | "down" | "flat";

export interface KpiCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onClick"> {
  label: string;
  value: React.ReactNode;
  unit?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: string;
  trendLabel?: string;
  trendDirection?: TrendDirection;
  trendSemantics?: "positive" | "negative" | "neutral"; /* ↑=good or ↑=bad */
  emphasis?: Emphasis;
  footnote?: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  size?: "sm" | "md" | "lg";
}

const emphasisClasses: Record<Emphasis, string> = {
  default:  "text-foreground",
  success:  "text-success",
  warning:  "text-warning-strong",
  negative: "text-destructive",
  info:     "text-info",
};

function detectDirection(trend: string): TrendDirection {
  if (!trend) return "flat";
  const first = trend.trim().charAt(0);
  if (first === "+" || trend.startsWith("↑")) return "up";
  if (first === "-" || first === "−" || trend.startsWith("↓")) return "down";
  return "flat";
}

function trendClass(dir: TrendDirection, semantics: KpiCardProps["trendSemantics"] = "positive"): string {
  if (dir === "flat") return "text-muted-foreground";
  const isGood = (dir === "up" && semantics === "positive") || (dir === "down" && semantics === "negative");
  if (semantics === "neutral") return "text-muted-foreground";
  return isGood ? "text-success" : "text-destructive";
}

/** 文字列値の末尾が「万」「億」「兆」等の和数単位なら小さく描画する。
 *  例: "¥2,380万" → ¥2,380 (大) + 万 (小) */
function renderValue(value: React.ReactNode): React.ReactNode {
  if (typeof value !== "string") return value;
  const m = value.match(/^(.*?)([万億兆]+)$/);
  if (!m) return value;
  const [, head, suffix] = m;
  return (
    <>
      {head}
      <span className="text-[0.55em] font-medium ml-0.5 align-baseline">{suffix}</span>
    </>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  icon,
  trend,
  trendLabel,
  trendDirection,
  trendSemantics = "positive",
  emphasis = "default",
  footnote,
  onClick,
  loading = false,
  size = "md",
  className,
  ...rest
}: KpiCardProps) {
  const labelId = React.useId();
  const direction = trendDirection ?? (trend ? detectDirection(trend) : "flat");

  const valueSizeClass = size === "lg" ? "text-3xl sm:text-4xl" : size === "sm" ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl";

  const TrendIcon = direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus;
  const TrendColor = trendClass(direction, trendSemantics);

  const Root = onClick ? "button" : "div";

  return (
    <Root
      role="group"
      aria-labelledby={labelId}
      onClick={onClick as any}
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-lg border border-border bg-card p-4 text-left transition-colors",
        onClick && "hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer",
        className
      )}
      {...(rest as any)}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon ? <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icon}</span> : null}
        <span id={labelId}>{label}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        {loading ? (
          <span className="h-8 w-24 animate-pulse rounded bg-muted" aria-hidden="true" />
        ) : (
          <span className={cn("font-number whitespace-nowrap font-bold tracking-tight tabular-nums", valueSizeClass, emphasisClasses[emphasis])}>
            {renderValue(value)}
          </span>
        )}
        {unit ? (
          <span className="text-sm font-medium text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      {trend ? (
        <div className="flex items-center gap-1.5 text-xs">
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", TrendColor)}>
            <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {trend}
          </span>
          {trendLabel ? <span className="text-muted-foreground">{trendLabel}</span> : null}
        </div>
      ) : null}
      {footnote ? (
        <p className="text-xs text-muted-foreground" aria-label="脚注">{footnote}</p>
      ) : null}
    </Root>
  );
}
