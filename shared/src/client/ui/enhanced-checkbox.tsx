import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "../utils";

/**
 * EnhancedCheckbox — DADS Checkbox の indeterminate / 大型タップ領域対応版。
 *
 * 通常の Checkbox との違い:
 * - `checked={'indeterminate'}` 時にハイフンアイコン (全選択ヘッダ向け)
 * - h-5 w-5 (20px) はそのままで `aria-label` 必須化を緩和（label 併用前提）
 * - hover で primary/60 ボーダー
 *
 * 主な使用想定:
 * - データテーブルの全選択ヘッダ + 行選択 (shift+クリックの並列対応)
 * - シミュレーションダイアログの費用項目テーブル版
 */
interface EnhancedCheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'checked'> {
  checked?: boolean | 'indeterminate';
}

export const EnhancedCheckbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  EnhancedCheckboxProps
>(({ className, checked, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    checked={checked}
    className={cn(
      'peer h-5 w-5 shrink-0 rounded-md border-2 border-input bg-background',
      'transition-all duration-100',
      'hover:border-primary/60',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
      'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {checked === 'indeterminate' ? (
        <Minus className="h-4 w-4" aria-hidden="true" strokeWidth={3} />
      ) : (
        <Check className="h-4 w-4" aria-hidden="true" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
EnhancedCheckbox.displayName = 'EnhancedCheckbox';
