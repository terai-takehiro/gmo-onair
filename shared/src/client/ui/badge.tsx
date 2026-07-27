import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

/**
 * Badge — DADS-aligned (デジタル庁 DS Tag / Label component)
 * - Rounded-full pill shape for status indicators
 * - Semantic variants: default (brand), secondary, destructive, success, warning, info, outline
 * - `color` prop override: inline style with contrasting foreground
 */
/*
 * ── 高さは padding で作らない (デザイン README「寸法」) ────────────────
 *
 * `py-0.5` のように余白で高さを作ると、**中の文字サイズが1段違うだけで
 * バッジの高さが変わる**。表の行に2種類のバッジが並ぶと底が揃わない。
 * だから **22px (小) / 26px (中) の2段に固定**し、中身は中央に置く。
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 text-xs font-semibold leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      size: {
        sm: "h-badge-sm",   /* 22px */
        md: "h-badge-md",   /* 26px */
      },
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
        info: "border-transparent bg-info text-info-foreground",
        outline: "text-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  color?: string;
}

function Badge({ className, variant, size, color, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant, size }), className)}
      style={color ? { backgroundColor: color, color: "#fff", borderColor: color } : undefined}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
