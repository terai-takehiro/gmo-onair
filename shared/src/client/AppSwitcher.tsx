/**
 * AppSwitcher — グローバルアプリ切り替えメニュー（Googleワッフル風）
 * 全ブロックアプリのヘッダーに組み込み、どの画面からでも直接他アプリに遷移可能にする。
 */
import { useState, useRef, useEffect } from "react";

/** アプリ定義 */
interface AppDef {
  id: string;
  label: string;
  description: string;
  emoji: string;
  color: string; // Tailwind bg class
  basePath: string;
  status: "active" | "coming_soon";
}

export const ONAIR_APPS: AppDef[] = [
  { id: "home",        label: "ホーム",             description: "ダッシュボード",                emoji: "🏠", color: "bg-slate-600",   basePath: "/",              status: "active" },
  { id: "sales",       label: "案件管理",           description: "案件・顧客・見積",              emoji: "📁", color: "bg-blue-600",    basePath: "/sales",         status: "active" },
  { id: "budget",      label: "予算管理",           description: "売上・仕入・損益",              emoji: "💰", color: "bg-emerald-600", basePath: "/budget",        status: "active" },
  { id: "studio",      label: "スタジオ予約",       description: "カレンダー・ブッキング",        emoji: "🎬", color: "bg-violet-600",  basePath: "/studio",        status: "active" },
  { id: "qsheet",      label: "Qシート",            description: "台本・OnAir・ランダウン",       emoji: "📋", color: "bg-rose-600",    basePath: "/qsheet",        status: "active" },
  { id: "equipment",   label: "機材管理",           description: "機材台帳・貸出・メンテ",        emoji: "📦", color: "bg-amber-600",   basePath: "/equipment",     status: "active" },
  { id: "interactive", label: "インタラクティブ",   description: "スタンプ・リアルタイム演出",    emoji: "✨", color: "bg-pink-600",    basePath: "/interactive",   status: "active" },
  { id: "techsheet",   label: "技術資料",           description: "カメラ・映像・音声仕様書",      emoji: "🔧", color: "bg-cyan-600",    basePath: "/techsheet",     status: "active" },
  { id: "assign",      label: "制作支援",           description: "スケジュール・スタッフ配置",    emoji: "👥", color: "bg-orange-500",  basePath: "/prodsheet",     status: "coming_soon" },
];

interface AppSwitcherProps {
  /** 現在のアプリID（ハイライト用） */
  currentApp?: string;
}

export default function AppSwitcher({ currentApp }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Waffle button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg transition-all hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
        title="アプリ切替"
        aria-label="アプリ切替メニュー"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" className="opacity-60">
          <circle cx="3" cy="3" r="2" />
          <circle cx="9" cy="3" r="2" />
          <circle cx="15" cy="3" r="2" />
          <circle cx="3" cy="9" r="2" />
          <circle cx="9" cy="9" r="2" />
          <circle cx="15" cy="9" r="2" />
          <circle cx="3" cy="15" r="2" />
          <circle cx="9" cy="15" r="2" />
          <circle cx="15" cy="15" r="2" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-2 z-[200] w-[calc(100vw-2rem)] sm:w-[340px] max-w-[340px] rounded-2xl border border-border bg-card shadow-2xl shadow-black/10 animate-switcher-in">
          {/* Header */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[13px] font-bold text-foreground tracking-wide">GMO ONAiR</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">アプリを切り替え</p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-3 gap-1 px-3 pb-3">
            {ONAIR_APPS.map((app, i) => {
              const isCurrent = app.id === currentApp;
              const isDisabled = app.status === "coming_soon";

              return (
                <a
                  key={app.id}
                  href={isDisabled ? undefined : app.basePath}
                  onClick={(e) => {
                    if (isDisabled) { e.preventDefault(); return; }
                    setOpen(false);
                  }}
                  className={`
                    flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center transition-all
                    ${isDisabled
                      ? "cursor-default opacity-40"
                      : isCurrent
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : "hover:bg-muted active:scale-95 cursor-pointer"
                    }
                  `}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <span className="text-2xl leading-none">{app.emoji}</span>
                  <span className={`text-[11px] font-semibold leading-tight ${isCurrent ? "text-primary" : "text-foreground"}`}>
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
