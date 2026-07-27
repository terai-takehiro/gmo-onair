import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

/**
 * Button — DADS-aligned (デジタル庁 DS v2.13 Button component)
 * - focus-visible: 2px ring + 2px offset (WCAG 2.2 AA)
 * - Minimum hit target: 40px default, 44px for lg (mobile-first AAA)
 * - Variants follow DADS: Solid / Secondary (Ghost) / Outline / Link / Destructive
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-control text-sm font-medium transition-[background-color,color,box-shadow,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-800 active:bg-primary-900",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        outline: "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
        link: "text-primary underline-offset-4 hover:underline focus-visible:ring-offset-0",
        success: "bg-success text-success-foreground hover:bg-success/90",
      },
      /*
       * 高さは **32 / 36 / 40 / 44 / 48px の5種だけ**（デザイン README「寸法」）。
       * 30・34・38・42・46px のような中間の値を作らない — 作ると同じ意味の
       * ボタンが画面ごとに1〜2px 違い、並べたときに底が揃わなくなる。
       */
      size: {
        xs: "h-ctl-1 rounded-control px-2.5 text-xs",  /* 32px — 表の行の中 */
        sm: "h-ctl-2 rounded-control px-3",            /* 36px */
        default: "h-ctl-3 px-4",                       /* 40px */
        lg: "h-ctl-4 rounded-control px-6",            /* 44px — タップ領域の下限 */
        xl: "h-ctl-5 rounded-control px-8 text-base",  /* 48px — 主要な操作 */
        icon: "h-ctl-3 w-10",
        "icon-sm": "h-ctl-2 w-9",
        "icon-xs": "h-ctl-1 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
