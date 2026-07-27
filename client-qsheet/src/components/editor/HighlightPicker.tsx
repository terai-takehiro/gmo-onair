import { useState } from "react";
import { Palette, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@gmo-onair/shared/src/client/ui";

// ─── Highlight colors (faint pastels suited for print) ──────
// 全エントリで共通。null/undefined はハイライトなし。
export const HIGHLIGHT_COLORS: { value: string; label: string }[] = [
  { value: "#fef3c7", label: "黄" }, // yellow-100
  { value: "#dcfce7", label: "緑" }, // green-100
  { value: "#dbeafe", label: "青" }, // blue-100
  { value: "#fce7f3", label: "桃" }, // pink-100
  { value: "#ede9fe", label: "紫" }, // purple-100
  { value: "#ffedd5", label: "橙" }, // orange-100
];

/**
 * エントリの背景ハイライト色を選択するピッカー。
 *
 * 旧実装の `absolute right-0 top-6` 固定ポップアップは、
 * ビューポート右端で見切れ・モバイルで右に逃げる等の問題があったため、
 * 中央モーダル (shared Dialog のコンパクト variant) に置換。
 * Radix Dialog の自動 focus trap / Esc クローズ / portal で
 * 画面外問題を構造的に解決する。
 */
export function HighlightPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const select = (color: string | null) => {
    onChange(color);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`w-5 h-5 rounded flex items-center justify-center transition-colors mt-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
          value
            ? "border border-border"
            : "text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100"
        }`}
        style={value ? { backgroundColor: value } : undefined}
        title="行のハイライト色"
        aria-label={value ? "ハイライト色を変更" : "ハイライト色を設定"}
      >
        {!value && <Palette size={12} aria-hidden />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-xs p-4"
          onClick={(e) => e.stopPropagation()}
          aria-describedby={undefined}
        >
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-sm">ハイライト色</DialogTitle>
            <p className="text-xs text-muted-foreground">
              印刷でも読みやすい淡色から選択
            </p>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 mt-3">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => select(c.value)}
                className={`size-9 rounded-md border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  value === c.value
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border"
                }`}
                style={{ backgroundColor: c.value }}
                title={c.label}
                aria-label={c.label}
                aria-pressed={value === c.value}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => select(null)}
            className="h-ctl-3 mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="ハイライトをクリア"
          >
            <X size={12} aria-hidden />
            クリア
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
