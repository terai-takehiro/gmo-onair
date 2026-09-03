import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../utils";

const labelVariants = cva(
  // **`leading-none`（line-height:1）にしない。** 長いラベル（例:「回の単価（任意・確定売上）」）が
  // 狭い幅・大きめの文字サイズ設定で2行に折り返されると、行間がゼロになって文字が重なり読めなくなる
  // （実機・375px 幅で再現。1行のときの見た目はほぼ変わらない）
  "text-sm font-medium leading-tight text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
