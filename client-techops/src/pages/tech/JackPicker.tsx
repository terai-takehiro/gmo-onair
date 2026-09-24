// 技術資料 ②映像パッチ — パッチ番号の候補（設計: docs/design/v4/tech-docs.md §6②「パッチ番号が絞られる」）。
// 選んだ機材に立ち上がっているパッチ番号だけを出す。空きが先で、この資料の別の行が
// 既に使っている番号には「使用中」の印を付けて選べなくする。
// 増設機材の側はパッチ番号を持たないので、ここは端子名（`PGM OUT`）の自由入力になる。
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import { notifyInfo } from "@/lib/notify";
import type { JackChoice } from "./patchDerive";
import { FloatingPanel, usePopoverDismiss } from "./patchPopover";

interface Props {
  /** いま入っているパッチ番号（増設機材のときは端子名） */
  jackText: string;
  jackId: string | null;
  isExtra: boolean;
  deviceName: string;
  choices: JackChoice[];
  disabled: boolean;
  side: "from" | "to";
  onPick: (choice: JackChoice) => void;
  onClear: () => void;
  onCommitText: (value: string) => void;
}

export function JackPicker({
  jackText, jackId, isExtra, deviceName, choices, disabled, side, onPick, onClear, onCommitText,
}: Props) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss([boxRef, panelRef], open, () => setOpen(false));

  const label = side === "from" ? "送りのパッチ番号" : "受けのパッチ番号";

  // 増設機材はパッチ番号を持たない（§4-3）。端子の名前だけを自由入力で受ける
  if (isExtra) {
    return (
      <BufferedInput
        value={jackText}
        onCommit={onCommitText}
        disabled={disabled}
        aria-label={side === "from" ? "送りの端子名" : "受けの端子名"}
        placeholder="—"
        className="num h-8 w-full min-w-0 rounded-control border border-border-faint bg-background px-1.5 text-center text-badge text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
      />
    );
  }

  if (!deviceName.trim()) {
    return <span className="num block w-full text-center text-sub text-muted-foreground">—</span>;
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`num flex h-8 w-full items-center justify-center rounded-control border text-badge disabled:opacity-70 ${
          open ? "border-primary bg-background" : "border-border bg-muted hover:border-primary-border"
        } ${jackText ? "text-foreground" : "text-muted-foreground"}`}
      >
        {jackText || "—"}
      </button>
      {open && (
        <FloatingPanel anchorRef={boxRef} panelRef={panelRef} align="right" width={288}>
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-faint bg-surface-subtle px-3">
            <span className="min-w-0 flex-1 truncate text-th text-foreground">{deviceName}</span>
            <span className="num shrink-0 text-sub-sm text-muted-foreground">{choices.length}ch</span>
          </div>
          <div className="max-h-80 min-h-0 flex-1 overflow-y-auto">
            {choices.length === 0 && (
              <p className="px-3 py-3 text-sub text-muted-foreground">
                この機材にはパッチ番号がありません。パッチ盤で転記してください。
              </p>
            )}
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  if (c.busy) {
                    notifyInfo(`${c.no} は使用中です`, {
                      description: `${c.busyBy || "この資料の別の行"}が使っています。先にその行から外してください。`,
                    });
                    return;
                  }
                  onPick(c);
                  setOpen(false);
                }}
                className={`flex h-11 w-full items-center gap-2 border-b border-border-faint px-3 text-left last:border-b-0 hover:bg-primary-surface-weak ${
                  c.id === jackId ? "bg-primary-surface-weak" : ""
                }`}
              >
                <span
                  className={`num flex h-6 w-14 shrink-0 items-center justify-center rounded-badge text-badge ${
                    c.busy ? "bg-surface-subtle text-muted-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {c.no}
                </span>
                <span className={`min-w-0 flex-1 truncate text-sub ${c.busy ? "text-muted-foreground" : "text-foreground"}`}>
                  {c.label || c.panelName}
                </span>
                {c.busy && (
                  <span className="shrink-0 rounded-badge bg-muted px-1.5 py-0.5 text-badge text-muted-foreground">使用中</span>
                )}
                {c.id === jackId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-sub-sm text-muted-foreground">空いているパッチ番号を先に表示しています</span>
            {jackId && (
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); }}
                className="h-8 shrink-0 rounded-control border border-border px-2 text-sub font-bold text-foreground hover:bg-muted/30"
              >
                パッチ番号を削除
              </button>
            )}
          </div>
        </FloatingPanel>
      )}
    </div>
  );
}
