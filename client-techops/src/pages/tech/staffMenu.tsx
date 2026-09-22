// 行の右端の「…」で開く小さな操作の並び（③の表の行・⑥の人の行で共通）。
// 共通シェルにこの形の部品が無いため、この2画面だけで使う最小の実装を置いている。
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RowMenu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="min-h-tap min-w-tap"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div
          className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-card border border-border bg-card py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}

export function RowMenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex min-h-tap w-full items-center gap-2 px-3 text-left text-sub hover:bg-accent",
        danger ? "text-destructive" : "text-foreground",
      ].join(" ")}
    >
      <span className="shrink-0" aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}
