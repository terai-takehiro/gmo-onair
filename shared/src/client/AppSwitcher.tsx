/**
 * AppSwitcher — グローバルアプリ切り替えメニュー（フラットデザイン）
 * 全ブロックアプリのヘッダーに組み込み、どの画面からでも直接他アプリに遷移可能にする。
 * createPortal で document.body 直下にレンダリング → 親の overflow/transform/z-index 影響を完全回避
 *
 * **アプリの一覧はここに持たない。** `apps.ts` が唯一の正 (S1)。
 * 以前はここに `ONAIR_APPS` という独自の一覧があり、他の3か所と食い違っていた。
 *
 * **一覧の絞り込みも `apps.ts` の `visibleApps()` に委ねる**（権限 (`permissionModule`)・
 * `hidden`・`frozen` の判定を二重実装しない — `AppTopbar.tsx` と同じ判断軸）。
 * `role`/`permissions` を渡さないと権限付きアプリは（権限なし扱いで）出ない — 見せすぎより
 * 見えない方に倒す。**現在地 (`currentApp`) はハイライトして見せる設計**なので、
 * `visibleApps()` の `current` オプション（一覧から除外する方）は渡さない。
 * `comingSoon`（準備中）のアプリは従来どおり出す（無効タイルとして）。
 */
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { visibleApps } from "./apps";

interface AppSwitcherProps {
  currentApp?: string;
  /** ログイン中ユーザーのロール。`visibleApps()` の権限判定にそのまま渡す */
  role?: string;
  /** モジュール → アクセスレベル。`visibleApps()` の権限判定にそのまま渡す */
  permissions?: Record<string, string> | null;
}

export default function AppSwitcher({ currentApp, role, permissions }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const apps = visibleApps({ role, permissions, includeComingSoon: true, includeHome: true });

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 376));
      setPos({ top: rect.bottom + 8, left });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !buttonRef.current?.contains(t) &&
        !dropdownRef.current?.contains(t)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      className="fixed z-[99999] w-[360px] max-w-[calc(100vw-16px)] rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 animate-switcher-in"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="px-4 pt-4 pb-2">
        <img src="/logo-onair.svg" alt="GMO ONAiR" className="h-5 w-auto mb-0.5" />
        <p className="text-xs text-muted-foreground mt-0.5">アプリを切り替え</p>
      </div>

      <div className="grid grid-cols-3 gap-1 px-3 pb-3">
        {apps.map((app) => {
          const isCurrent = app.key === currentApp;
          const isDisabled = !!app.comingSoon;
          const isExternal = !!app.external;
          const Icon = app.icon;

          return (
            <a
              key={app.key}
              href={isDisabled ? undefined : app.path}
              {...(isExternal && !isDisabled ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={(e) => {
                if (isDisabled) { e.preventDefault(); return; }
                setOpen(false);
              }}
              className={`
                flex flex-col items-center gap-2 rounded-xl px-2 py-3.5 text-center transition-all
                ${isDisabled
                  ? "cursor-default opacity-30"
                  : isCurrent
                    ? "bg-primary/8 ring-1 ring-primary/20"
                    : "hover:bg-muted active:scale-95 cursor-pointer"
                }
              `}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl transition-transform"
                style={{ backgroundColor: `${app.color}14` }}
              >
                <Icon size={20} style={{ color: app.color }} strokeWidth={1.8} />
              </div>
              <span className={`text-[11px] font-medium leading-tight ${isCurrent ? "text-primary font-semibold" : "text-foreground"}`}>
                {app.label}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="flex h-10 w-10 items-center justify-center rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
        title="アプリ切替"
        aria-label="アプリ切替メニュー"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className="opacity-50">
          <rect x="1" y="1" width="5" height="5" rx="1.5" />
          <rect x="7.5" y="1" width="5" height="5" rx="1.5" />
          <rect x="14" y="1" width="5" height="5" rx="1.5" />
          <rect x="1" y="7.5" width="5" height="5" rx="1.5" />
          <rect x="7.5" y="7.5" width="5" height="5" rx="1.5" />
          <rect x="14" y="7.5" width="5" height="5" rx="1.5" />
          <rect x="1" y="14" width="5" height="5" rx="1.5" />
          <rect x="7.5" y="14" width="5" height="5" rx="1.5" />
          <rect x="14" y="14" width="5" height="5" rx="1.5" />
        </svg>
      </button>

      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
