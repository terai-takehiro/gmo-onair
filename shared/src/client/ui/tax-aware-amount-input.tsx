import * as React from "react";
import { cn } from "../utils";
import { Input } from "./input";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./dialog";
import { Label } from "./label";

// v2.8.105+: 税込/税抜ヘルパー付き金額入力。
// 通常の number Input + 右側に小さな「税」ボタン。
// クリックで「入力した金額は税込？税抜？」→ 税込なら 10% / 8% / 非課税 を選択 →
// 税抜金額を計算して onChange に渡す。

type TaxRate = "10" | "8" | "exempt" | "nontax";

// 非課税と不課税は別物 (enums.ts の TaxCategory と同じ考え方)。
// どちらも税率 0 なので換算結果は同じだが、選ぶ人の言葉に合わせて両方出す
// — 「不課税の支払いなのに非課税しか無い」と迷わせない。
const TAX_RATES: { value: TaxRate; label: string; rate: number }[] = [
  { value: "10", label: "10%課税", rate: 0.1 },
  { value: "8", label: "8%課税(軽減)", rate: 0.08 },
  { value: "exempt", label: "非課税", rate: 0 },
  { value: "nontax", label: "不課税", rate: 0 },
];

export interface TaxAwareAmountInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** 現在の (税抜) 金額 */
  value: number;
  /** 計算後の 税抜 金額を受け取る */
  onChange: (value: number) => void;
  /** ヘルパーボタンを非表示にする (default: false) */
  hideHelper?: boolean;
  /** 入力欄の className */
  inputClassName?: string;
  /** ラベル (例: 「単価」「金額」) — ダイアログのタイトルに使う */
  fieldLabel?: string;
}

export interface TaxHelperButtonProps {
  /** 計算後の税抜金額を受け取る */
  onResult: (excludedAmount: number) => void;
  /** ボタンサイズ (default: "icon") */
  size?: "sm" | "icon";
  /** ラベル (ダイアログのタイトルに使う) */
  fieldLabel?: string;
  /** 初期値 (税込として扱う金額のデフォルト) */
  defaultIncludedAmount?: number;
  /** 無効化 */
  disabled?: boolean;
  /** ボタン className */
  className?: string;
}

/** 単独で使える税込/税抜ヘルパーボタン。
 *  既存の `<Input>` や `<CurrencyInput>` の隣に配置して使う。
 *  クリック → ダイアログで税込金額 + 税率選択 → 税抜金額を `onResult` に返す。 */
export function TaxHelperButton({
  onResult,
  size = "icon",
  fieldLabel,
  defaultIncludedAmount,
  disabled,
  className,
}: TaxHelperButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<"ask" | "rate">("ask");
  const [includedAmount, setIncludedAmount] = React.useState<string>("");

  const openHelper = () => {
    setStep("ask");
    setIncludedAmount(
      defaultIncludedAmount && defaultIncludedAmount > 0 ? String(defaultIncludedAmount) : "",
    );
    setOpen(true);
  };
  const close = () => setOpen(false);

  const handleSelectExcluded = () => {
    const v = parseInt(includedAmount, 10);
    if (Number.isFinite(v) && v >= 0) onResult(v);
    close();
  };
  const handleSelectIncluded = () => setStep("rate");
  const handlePickRate = (rate: number) => {
    const inc = parseInt(includedAmount, 10);
    if (Number.isFinite(inc) && inc >= 0) {
      onResult(toExcluded(inc, rate));
    }
    close();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size === "sm" ? "sm" : "icon"}
        className={cn(
          size === "icon" ? "h-7 w-7" : "h-7 px-2",
          "shrink-0 text-amber-600 hover:bg-amber-50",
          className,
        )}
        onClick={openHelper}
        disabled={disabled}
        title="税込/税抜ヘルパー"
      >
        <span className="text-[11px] font-bold">税</span>
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{fieldLabel ? `${fieldLabel} の入力` : "金額の入力"}</DialogTitle>
          </DialogHeader>

          {step === "ask" && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">入力する金額</Label>
                <Input
                  type="number"
                  value={includedAmount}
                  onChange={(e) => setIncludedAmount(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground mt-1">
                  入力した金額は <strong>税込</strong> ですか？それとも <strong>税抜</strong> ですか？
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSelectExcluded}
                  disabled={!includedAmount}
                >
                  税抜きとして使う
                </Button>
                <Button
                  type="button"
                  onClick={handleSelectIncluded}
                  disabled={!includedAmount}
                >
                  税込 → 税抜計算
                </Button>
              </div>
              <div className="text-[11px] text-muted-foreground border-t pt-2">
                「税抜きとして使う」を選ぶと、入力した金額がそのまま税抜金額として使用されます。<br />
                「税込→税抜計算」を選ぶと、次の画面で税率 (10% / 8% / 非課税 / 不課税) を選んで税抜金額に換算します。
              </div>
            </div>
          )}

          {step === "rate" && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">税込金額</Label>
                <div className="text-lg font-bold tabular-nums">
                  ¥{Number(includedAmount || 0).toLocaleString("ja-JP")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  税率を選択すると、税抜金額に換算します (四捨五入)。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {TAX_RATES.map((tr) => {
                  const inc = parseInt(includedAmount, 10) || 0;
                  const exc = toExcluded(inc, tr.rate);
                  return (
                    <Button
                      key={tr.value}
                      type="button"
                      variant="outline"
                      className="justify-between h-auto py-3"
                      onClick={() => handlePickRate(tr.rate)}
                    >
                      <span className="font-bold">{tr.label}</span>
                      <span className="text-xs text-muted-foreground">
                        税抜:{" "}
                        <span className="font-bold text-foreground tabular-nums">
                          ¥{exc.toLocaleString("ja-JP")}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              キャンセル
            </Button>
            {step === "rate" && (
              <Button type="button" variant="outline" onClick={() => setStep("ask")}>
                戻る
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 税込 → 税抜 の換算 (四捨五入)。
 *  非課税は変化なし。 */
function toExcluded(includedAmount: number, rate: number): number {
  if (rate === 0) return includedAmount;
  return Math.round(includedAmount / (1 + rate));
}

export const TaxAwareAmountInput = React.forwardRef<HTMLInputElement, TaxAwareAmountInputProps>(
  (
    {
      value,
      onChange,
      hideHelper = false,
      inputClassName,
      fieldLabel,
      className,
      placeholder,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [step, setStep] = React.useState<"ask" | "rate">("ask");
    const [includedAmount, setIncludedAmount] = React.useState<string>("");

    const openHelper = () => {
      setStep("ask");
      setIncludedAmount(value > 0 ? String(value) : "");
      setOpen(true);
    };
    const close = () => setOpen(false);

    const handleSelectExcluded = () => {
      // 税抜きとして既に入力されている場合は何もしない。
      // ただし、ユーザーが「ヘルパー」経由で「税抜」を選んだ場合は、入力欄を
      // 「税抜入力モード」として明示的にコミット (値はそのまま)。
      close();
    };

    const handleSelectIncluded = () => {
      // 税込が選ばれたら、税率を聞く
      setStep("rate");
    };

    const handlePickRate = (rate: number) => {
      const includedNum = parseInt(includedAmount, 10);
      if (Number.isFinite(includedNum) && includedNum >= 0) {
        const excluded = toExcluded(includedNum, rate);
        onChange(excluded);
      }
      close();
    };

    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Input
          ref={ref}
          type="number"
          value={value || ""}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange(Number.isFinite(v) ? v : 0);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("flex-1", inputClassName)}
          {...rest}
        />
        {!hideHelper && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-amber-600 hover:bg-amber-50"
            onClick={openHelper}
            disabled={disabled}
            title="税込/税抜ヘルパー"
          >
            <span className="text-[11px] font-bold">税</span>
          </Button>
        )}

        <Dialog open={open} onOpenChange={(o) => !o && close()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {fieldLabel ? `${fieldLabel} の入力` : "金額の入力"}
              </DialogTitle>
            </DialogHeader>

            {step === "ask" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs">入力する金額</Label>
                  <Input
                    type="number"
                    value={includedAmount}
                    onChange={(e) => setIncludedAmount(e.target.value)}
                    placeholder="0"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    入力した金額は <strong>税込</strong> ですか？それとも <strong>税抜</strong> ですか？
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSelectExcluded}
                    disabled={!includedAmount}
                  >
                    税抜きとして使う
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSelectIncluded}
                    disabled={!includedAmount}
                  >
                    税込 → 税抜計算
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground border-t pt-2">
                  「税抜きとして使う」を選ぶと、入力した金額がそのまま税抜金額として使用されます。<br />
                  「税込→税抜計算」を選ぶと、次の画面で税率 (10% / 8% / 非課税 / 不課税) を選んで税抜金額に換算します。
                </div>
              </div>
            )}

            {step === "rate" && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs">税込金額</Label>
                  <div className="text-lg font-bold tabular-nums">
                    ¥{Number(includedAmount || 0).toLocaleString("ja-JP")}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    税率を選択すると、税抜金額に換算します (四捨五入)。
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {TAX_RATES.map((tr) => {
                    const inc = parseInt(includedAmount, 10) || 0;
                    const exc = toExcluded(inc, tr.rate);
                    return (
                      <Button
                        key={tr.value}
                        type="button"
                        variant="outline"
                        className="justify-between h-auto py-3"
                        onClick={() => handlePickRate(tr.rate)}
                      >
                        <span className="font-bold">{tr.label}</span>
                        <span className="text-xs text-muted-foreground">
                          税抜: <span className="font-bold text-foreground tabular-nums">
                            ¥{exc.toLocaleString("ja-JP")}
                          </span>
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                キャンセル
              </Button>
              {step === "rate" && (
                <Button type="button" variant="outline" onClick={() => setStep("ask")}>
                  戻る
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
);
TaxAwareAmountInput.displayName = "TaxAwareAmountInput";
