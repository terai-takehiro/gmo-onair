/**
 * SharedHeader — 全ブロックアプリ共通ヘッダー
 * - shadcn/ui 非依存（lucide-react + Tailwind のみ）
 * - ユーザードロップダウンを createPortal で body 直下にレンダリング
 * - スタイルを自己注入（各アプリの index.css 修正不要）
 * - モバイル完全対応: 44px タップ領域、truncate、レスポンシブ表示切替
 */
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Menu, LogOut, ChevronDown, ArrowLeftRight, HelpCircle, History, Plug } from "lucide-react";
import AppSwitcher from "./AppSwitcher";

// ─── スタイル自己注入（初回のみ） ────────────────────────────────────────────
let _injected = false;
function injectSharedHeaderStyles() {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes _sh-menu-in {
      from { opacity: 0; transform: scale(.95) translateY(-6px); }
      to   { opacity: 1; transform: scale(1)   translateY(0);    }
    }
    ._sh-menu-in { animation: _sh-menu-in .15s ease-out; }
  `;
  document.head.appendChild(s);
}

// ─── 型定義 ──────────────────────────────────────────────────────────────────
export interface SharedHeaderUser {
  name: string;
  role: string;
  email?: string;
}

interface SharedHeaderProps {
  /** ONAIR_APPS.id (AppSwitcher のハイライトに使用) */
  currentApp: string;
  /** ヘッダーに表示するアプリ名 */
  appLabel: string;
  /** パンくずの追加セグメント（計時LIVE の番組名など）sm 以上で表示 */
  subLabel?: string;
  currentUser: SharedHeaderUser | null;
  onLogout: () => void;
  /** 渡すとモバイル用ハンバーガーボタンを表示 */
  onToggleSidebar?: () => void;
  /** 渡すとドロップダウンに「ユーザー切替」を表示 */
  onSwitchUser?: () => void;
  /** ヘッダー中央スロット（検索バーなど） */
  centerContent?: React.ReactNode;
  /** 渡すと「利用マニュアル」ボタン（?アイコン）をユーザーメニューの左に表示 */
  onOpenManual?: () => void;
  /** 渡すと「バージョン履歴」ボタン（時計アイコン）をユーザーメニューの左に表示 */
  onOpenVersionHistory?: () => void;
  /** 渡すと「MCP コネクタ」ボタン（プラグアイコン）をユーザーメニューの左に表示 */
  onOpenMcpInfo?: () => void;
}

// ─── ロールラベル ─────────────────────────────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
};
const ROLE_COLOR: Record<string, string> = {
  system_admin: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  staff: "bg-muted text-muted-foreground",
};

// ─── コンポーネント ───────────────────────────────────────────────────────────
export default function SharedHeader({
  currentApp,
  appLabel,
  subLabel,
  currentUser,
  onLogout,
  onToggleSidebar,
  onSwitchUser,
  centerContent,
  onOpenManual,
  onOpenVersionHistory,
  onOpenMcpInfo,
}: SharedHeaderProps) {
  useEffect(() => injectSharedHeaderStyles(), []);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setOpen(true);
  };

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  const initials = currentUser?.name?.charAt(0)?.toUpperCase() ?? "?";

  // ─── ドロップダウン（portal）─────────────────────────────────────────────
  const dropdown = open && currentUser ? (
    <div
      ref={menuRef}
      className="_sh-menu-in fixed z-[99998] min-w-[220px] rounded-xl border border-border bg-card shadow-2xl shadow-black/10"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* ユーザー情報 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm select-none">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{currentUser.name}</p>
          {currentUser.email && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{currentUser.email}</p>
          )}
          <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLOR[currentUser.role] ?? ROLE_COLOR.staff}`}>
            {ROLE_LABEL[currentUser.role] ?? currentUser.role}
          </span>
        </div>
      </div>

      {/* アクション */}
      <div className="p-1.5 space-y-0.5">
        {/* モバイル: ヘッダーに常時置けないボタンをメニューに集約 (sm 未満のみ) */}
        {onOpenManual && (
          <button
            onClick={() => { setOpen(false); onOpenManual(); }}
            className="sm:hidden flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-accent active:scale-[.98] transition-all"
            style={{ touchAction: "manipulation" }}
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground shrink-0" />
            利用マニュアル
          </button>
        )}
        {onOpenVersionHistory && (
          <button
            onClick={() => { setOpen(false); onOpenVersionHistory(); }}
            className="sm:hidden flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-accent active:scale-[.98] transition-all"
            style={{ touchAction: "manipulation" }}
          >
            <History className="h-4 w-4 text-muted-foreground shrink-0" />
            バージョン履歴
          </button>
        )}
        {onOpenMcpInfo && (
          <button
            onClick={() => { setOpen(false); onOpenMcpInfo(); }}
            className="sm:hidden flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-accent active:scale-[.98] transition-all"
            style={{ touchAction: "manipulation" }}
          >
            <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
            MCP コネクタ
          </button>
        )}
        {onSwitchUser && (
          <button
            onClick={() => { setOpen(false); onSwitchUser(); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-accent active:scale-[.98] transition-all"
            style={{ touchAction: "manipulation" }}
          >
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground shrink-0" />
            ユーザー切替
          </button>
        )}
        <button
          onClick={() => { setOpen(false); onLogout(); }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-foreground hover:bg-accent active:scale-[.98] transition-all"
          style={{ touchAction: "manipulation" }}
        >
          <LogOut className="h-4 w-4 text-muted-foreground shrink-0" />
          ログアウト
        </button>
      </div>
    </div>
  ) : null;

  // ─── ヘッダー本体 ────────────────────────────────────────────────────────
  return (
    <header className="shrink-0 border-b border-border bg-card relative z-30" style={{ paddingTop: "env(safe-area-inset-top)" }}>
    <div className="flex h-14 items-center gap-1 sm:gap-1.5 px-2 sm:px-4">

      {/* AppSwitcher */}
      <AppSwitcher currentApp={currentApp} />

      {/* ハンバーガー（モバイル・サイドバーあり時のみ） */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
          aria-label="メニューを開閉"
          style={{ touchAction: "manipulation" }}
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* パンくず */}
      <nav className="flex items-center gap-1 min-w-0 flex-1 text-sm overflow-hidden">
        <a
          href="/"
          className="hover:opacity-80 active:opacity-60 transition-opacity shrink-0 flex items-center"
          style={{ touchAction: "manipulation" }}
          aria-label="GMO ONAiR ホーム"
        >
          <img src="/logo-onair.svg" alt="GMO ONAiR" className="h-5 w-auto" />
        </a>
        <span className="text-muted-foreground/30 shrink-0 select-none">/</span>
        <span className="font-semibold text-foreground truncate shrink-1">{appLabel}</span>
        {subLabel && (
          <>
            <span className="text-muted-foreground/30 shrink-0 select-none hidden sm:inline">/</span>
            <span className="text-xs text-muted-foreground truncate hidden sm:inline">{subLabel}</span>
          </>
        )}
      </nav>

      {/* 中央スロット（検索など） */}
      {centerContent}

      {/* MCP コネクタ */}
      {onOpenMcpInfo && (
        <button
          onClick={onOpenMcpInfo}
          className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
          aria-label="MCP コネクタ情報を開く"
          title="MCP コネクタ"
          style={{ touchAction: "manipulation" }}
        >
          <Plug className="h-5 w-5 text-muted-foreground" />
        </button>
      )}

      {/* バージョン履歴 */}
      {onOpenVersionHistory && (
        <button
          onClick={onOpenVersionHistory}
          className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
          aria-label="バージョン履歴を開く"
          title="バージョン履歴"
          style={{ touchAction: "manipulation" }}
        >
          <History className="h-5 w-5 text-muted-foreground" />
        </button>
      )}

      {/* 利用マニュアル */}
      {onOpenManual && (
        <button
          onClick={onOpenManual}
          className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
          aria-label="利用マニュアルを開く"
          title="利用マニュアル"
          style={{ touchAction: "manipulation" }}
        >
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
        </button>
      )}

      {/* ユーザーボタン */}
      {currentUser && (
        <button
          ref={btnRef}
          onClick={handleOpen}
          className="flex items-center gap-1 sm:gap-1.5 rounded-xl px-1.5 sm:px-2.5 py-1.5 min-h-[44px] min-w-[44px] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all shrink-0"
          aria-label="ユーザーメニュー"
          aria-expanded={open}
          style={{ touchAction: "manipulation" }}
        >
          {/* アバター */}
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold select-none">
            {initials}
          </div>
          {/* 名前（sm以上） */}
          <span className="hidden sm:inline text-sm font-medium max-w-[96px] truncate leading-none">
            {currentUser.name}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
    </header>
  );
}
