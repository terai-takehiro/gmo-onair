import { useState, useEffect, useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import { Num } from "@gmo-onair/shared/src/client/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface DiscountResult {
  description: string;
  amount: number; // 負の値
  quantity: number;
  unit_price: number;
}

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "item" | "global";
  /** mode='item' のとき: 値引き対象明細の項目名 */
  targetDescription?: string;
  /** 値引き計算のベース金額（mode='item'なら対象明細のamount、mode='global'なら正の項目合計） */
  baseAmount: number;
  onApply: (item: DiscountResult) => void;
}

export default function DiscountDialog({
  open,
  onOpenChange,
  mode,
  targetDescription,
  baseAmount,
  onApply,
}: DiscountDialogProps) {
  const [discountType, setDiscountType] = useState<"rate" | "fixed">("rate");
  const [rateInput, setRateInput] = useState<string>("10");
  const [fixedInput, setFixedInput] = useState<string>("0");
  const [reason, setReason] = useState<string>("");

  // ダイアログが開くたびに初期化
  useEffect(() => {
    if (open) {
      setDiscountType("rate");
      setRateInput("10");
      setFixedInput("0");
      setReason("");
    }
  }, [open]);

  const discountAmount = useMemo(() => {
    if (discountType === "rate") {
      const rate = parseFloat(rateInput) || 0;
      return Math.floor((baseAmount * rate) / 100);
    } else {
      return parseInt(fixedInput) || 0;
    }
  }, [discountType, rateInput, fixedInput, baseAmount]);

  const negativeAmount = -Math.abs(discountAmount);

  const previewDescription = useMemo(() => {
    if (reason.trim()) return reason.trim();
    if (mode === "item") {
      const base = targetDescription || "値引き";
      return discountType === "rate"
        ? `${base}　値引き(${rateInput}%)`
        : `${base}　値引き`;
    } else {
      return discountType === "rate"
        ? `全体値引き（${rateInput}%）`
        : "全体値引き";
    }
  }, [mode, targetDescription, discountType, rateInput, reason]);

  const handleApply = () => {
    if (discountAmount <= 0) {
      alert("値引き額が0です。率または金額を入力してください。");
      return;
    }
    onApply({
      description: previewDescription,
      amount: negativeAmount,
      quantity: 1,
      unit_price: negativeAmount,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "item" ? "項目値引きを追加" : "全体値引きを追加"}
          </DialogTitle>
          <DialogDescription>
            {mode === "item"
              ? `対象: ${targetDescription || "(未指定)"}（${formatCurrency(baseAmount)}）`
              : `現在の小計: ${formatCurrency(baseAmount)}（正の項目のみ）`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 値引きタイプ */}
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={discountType === "rate"}
                onChange={() => setDiscountType("rate")}
                className="h-4 w-4"
              />
              <span className="text-sm">率(%)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={discountType === "fixed"}
                onChange={() => setDiscountType("fixed")}
                className="h-4 w-4"
              />
              <span className="text-sm">固定額(¥)</span>
            </label>
          </div>

          {/* 入力欄 */}
          {discountType === "rate" ? (
            <div>
              <Label className="text-sm">割引率</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-sm">割引額（円）</Label>
              <Input
                type="number"
                min={0}
                value={fixedInput}
                onChange={(e) => setFixedInput(e.target.value)}
                placeholder="例: 100000"
              />
            </div>
          )}

          {/* 説明（任意） */}
          <div>
            <Label className="text-sm">表示する項目名（任意）</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={previewDescription}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              空欄の場合は「{previewDescription}」と表示されます
            </p>
          </div>

          {/* プレビュー */}
          <div className="rounded-md border bg-muted/50 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">値引き額</span>
              <span className="text-lg font-bold font-number text-amber-600">
                {formatCurrency(negativeAmount)}
              </span>
            </div>
            {discountType === "rate" && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>計算: <Num value={baseAmount} /> × {rateInput}%</span>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleApply} disabled={discountAmount <= 0}>
            値引きを追加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
