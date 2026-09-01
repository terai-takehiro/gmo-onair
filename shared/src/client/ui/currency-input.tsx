import * as React from "react";
import { cn } from "../utils";

interface CurrencyInputProps {
  value: number | string;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  /** `<label htmlFor>` と結びつけるための id（積み残し6・375px実機確認で発覚。
   * 無いと呼び出し側が id を渡しても効かず、ラベルをタップしても欄にフォーカスが移らない） */
  id?: string;
}

function formatWithCommas(val: string): string {
  const num = val.replace(/[^\d]/g, "");
  if (!num) return "";
  return Number(num).toLocaleString("ja-JP");
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className, disabled, placeholder, id }, ref) => {
    const [display, setDisplay] = React.useState(() =>
      value ? Number(value).toLocaleString("ja-JP") : ""
    );

    React.useEffect(() => {
      const numVal = typeof value === "string" ? Number(value) : value;
      if (!isNaN(numVal) && numVal !== 0) {
        setDisplay(numVal.toLocaleString("ja-JP"));
      } else if (numVal === 0) {
        setDisplay("0");
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d]/g, "");
      const num = raw ? Number(raw) : 0;
      setDisplay(raw ? formatWithCommas(raw) : "");
      onChange(num);
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
        <input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background pl-7 pr-3 py-2 text-sm font-number ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={display}
          onChange={handleChange}
          disabled={disabled}
          placeholder={placeholder}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
