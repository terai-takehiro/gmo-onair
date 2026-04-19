/**
 * AppSwitcher — グローバルアプリ切り替えメニュー（フラットデザイン）
 * 全ブロックアプリのヘッダーに組み込み、どの画面からでも直接他アプリに遷移可能にする。
 * ドロップダウンは fixed 配置（AppShell の overflow-hidden に clip されないようにするため）
 */
import { useState, useRef, useEffect } from "react";
import {
  Home,
  FolderKanban,
  PiggyBank,
  Calendar,
  FileText,
  Package,
  Sparkles,
  Wrench,
  Users,
  type LucideIcon,
} from "lucide-react";

/** アプリ定義 */
interface AppDef {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  basePath: string;
  status: "active" | "coming_soon";
}

export const ONAIR_APPS: AppDef[] = [
  { id: "home",        label: "ホーム",           icon: Home,          color: "#475569", basePath: "/",            status: "active" },
  { id: "sales",       label: "案件管理",         icon: FolderKanban,  color: "#2563eb", basePath: "/sales",       status: "active" },
  { id: "budget",      label: "予算管理",         icon: PiggyBank,     color: "#059669", basePath: "/budget",      status: "active" },
  { id: "studio",      label: "スタジオ",         icon: Calendar,      color: "#7c3aed", basePath: "/studio",      status: "active" },
  { id: "qsheet",      label: "Qシート",          icon: FileText,      color: "#e11d48", basePath: "/qsheet",      status: "active" },
  { id: "equipment",   label: "機材管理",         icon: Package,       color: "#d97706", basePath: "/equipment",   status: "active" },
  { id: "interactive", label: "インタラクティブ", icon: Sparkles,      color: "#db2777", basePath: "/interactive", status: "active" },
  { id: "techsheet",   label: "技術資料",         icon: Wrench,        color: "#0891b2", basePath: "/techsheet",   status: "active" },
  { id: "assign",      label: "制作支援",         icon: Users,         color: "#ea580c", basePath: "/prodsheet",   status: "coming_soon" },
];

interface AppSwitcherProps {
  currentApp?: string;
}

export default function AppSwitcher({ currentApp }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

      {open && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] w-[360px] max-w-[calc(100vw-16px)] rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 animate-switcher-in"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-4 pt-4 pb-2">
            <p className="text-sm font-bold text-foreground">GMO ONAiR</p>
            <p className="text-xs text-muted-foreground mt-0.5">アプリを切り替え</p>
          </div>

          <div className="grid grid-cols-3 gap-1 px-3 pb-3">
            {ONAIR_APPS.map((app) => {
              const isCurrent = app.id === currentApp;
              const isDisabled = app.status === "coming_soon";
              const Icon = app.icon;

              return (
                <a
                  key={app.id}
                  href={isDisabled ? undefined : app.basePath}
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
      )}
    </div>
  );
}
