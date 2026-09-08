// 見出し右端の「…」メニュー。14-schedule-v2-plan.md §4-2 (b)
//
// このアプリ（と shared）にはドロップダウンメニューの部品が無い（Radix の
// dropdown-menu は依存に入っていない）ので、依存を増やさずに小さく作る。
// 外側クリック・Esc で閉じる。項目は 44px 以上（スマホでも押せる）。
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MoreMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface Props {
  items: MoreMenuItem[];
  /** ボタンの読み上げ名。既定「その他の操作」 */
  label?: string;
  className?: string;
}

export default function MoreMenu({ items, label = "その他の操作", className }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-tap"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[200px] rounded-card border border-border bg-card p-1 shadow-md"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect(); }}
              className="flex w-full min-h-tap items-center gap-2 rounded-control-lg px-3 text-left text-sub text-foreground hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent"
            >
              {item.icon && <span className="shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
