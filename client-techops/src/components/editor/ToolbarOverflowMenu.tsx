// 編集画面ヘッダーの「…」（あふれたボタンの入れ物）。
//
// 1280px 幅では二次アクション（ゴミ箱・CSV・印刷・AI・音声共有）まで1行に並べると
// 本番系の起動ボタン（ランダウン／プロンプター／ON AIR）が本文幅の外へ押し出され、
// ページごと横スクロールしないと押せなかった。二次アクションをここへ畳む。
//
// ⚠️ **閉じている間もパネルを DOM に残す。** 中に置く部品（`AiEditorTools`）は
// ボタンと**ダイアログを同じ木に**持っており、閉じるたびに外すと
// ダイアログが開いた瞬間に消える。`display:none` にするだけなら、
// ダイアログ本体は Portal で `<body>` 側に出るので普通に開く。
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

/** メニューの中の1行。ヘッダーの小さいボタンとは別の（44px の）当たり判定にする */
export const toolbarMenuItemClass =
  "flex w-full min-h-tap items-center gap-2.5 rounded-control-md px-2.5 text-left text-xs text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function ToolbarOverflowMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="その他の操作"
        title="その他の操作"
        className="flex min-h-tap items-center justify-center rounded-control-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[32px] lg:min-w-[32px]"
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      <div
        role="menu"
        onClick={() => setOpen(false)}
        className={
          open
            ? "absolute right-0 top-full z-50 mt-1 w-56 space-y-0.5 rounded-control-md border border-border bg-card p-1 shadow-lg"
            : "hidden"
        }
      >
        {children}
      </div>
    </div>
  );
}
