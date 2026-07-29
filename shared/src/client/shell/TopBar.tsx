// shared/src/client/shell/TopBar.tsx — 全アプリ共通の上辺 (高さ64px)
//
// 構成: ロゴ / パンくず / ⌘K / 通知ベル / ⋯ / ユーザー
// ヘッダー右のボタン (MCP・バージョン履歴・利用マニュアル) は「⋯」に畳む。
// AppSwitcher (3×13グリッド) は廃止 — アプリの行き先はレールと ⌘K に集約した。

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LogOut, Map as MapIcon, Menu, MoreHorizontal, Search, ArrowLeftRight, HelpCircle, History, Plug } from 'lucide-react';
import { cn } from '../utils';

export interface TopBarUser {
  name: string;
  role: string;
  email?: string;
}

const ROLE_LABEL: Record<string, string> = {
  system_admin: 'システム管理者',
  staff: 'スタッフ',
};

export interface TopBarProps {
  currentUser: TopBarUser | null;
  onLogout: () => void;
  onSwitchUser?: () => void;
  /** パンくず。案件名や顧客名を出す (GLS番号は従属表示) */
  breadcrumb?: ReactNode;
  /** 二次ナビをモバイルで開閉する (渡すとハンバーガーを出す) */
  onToggleSecondaryNav?: () => void;
  /**
   * ⌘K の左に置く任意スロット。
   * 移行期に既存のグローバル検索を残すために使う (Phase 3 で ⌘K に統合して外す)。
   */
  centerContent?: ReactNode;
  /** 渡すと ⌘K ボタンを出す (Phase 3 でコマンドパレットを配線) */
  onOpenCommandPalette?: () => void;
  /** 通知ベル (Phase 9)。AppShell が組み立てたものを差し込む */
  notificationSlot?: ReactNode;
  onOpenManual?: () => void;
  onOpenVersionHistory?: () => void;
  onOpenMcpInfo?: () => void;
  /**
   * 全体マップ (v3.1.0)。
   *
   * **どのアプリからでも同じ1枚に行ける**ことがこの項目の役目。
   * 現場アプリ (Qシート・機材…) に居ると、いま見えているメニューは
   * そのアプリのものだけなので、「他に何があるか」を知る手立てが無かった。
   */
  onOpenSiteMap?: () => void;
}

interface MenuItemDef {
  label: string;
  Icon: typeof LogOut;
  onSelect: () => void;
}

function useDropdown() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, pos, btnRef, menuRef, show };
}

function DropdownPanel({
  panelRef,
  pos,
  children,
  className,
}: {
  panelRef: React.RefObject<HTMLDivElement>;
  pos: { top: number; right: number };
  children: ReactNode;
  className?: string;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className={cn(
        'animate-fade-in fixed z-[99998] min-w-[224px] rounded-lg border border-border bg-popover shadow-2xl shadow-black/10',
        className,
      )}
      style={{ top: pos.top, right: pos.right }}
    >
      {children}
    </div>,
    document.body,
  );
}

function MenuRow({ label, Icon, onSelect }: MenuItemDef) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-secondary"
      style={{ touchAction: 'manipulation' }}
    >
      <Icon className="h-4 w-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
      {label}
    </button>
  );
}

export default function TopBar({
  currentUser,
  onLogout,
  onSwitchUser,
  breadcrumb,
  onToggleSecondaryNav,
  centerContent,
  onOpenCommandPalette,
  notificationSlot,
  onOpenManual,
  onOpenVersionHistory,
  onOpenMcpInfo,
  onOpenSiteMap,
}: TopBarProps) {
  const user = useDropdown();
  const more = useDropdown();

  const moreItems: MenuItemDef[] = [];
  // 先頭に置く。「どこに何があるか」は説明書より先に要る
  if (onOpenSiteMap) moreItems.push({ label: '全体マップ', Icon: MapIcon, onSelect: () => { more.setOpen(false); onOpenSiteMap(); } });
  if (onOpenManual) moreItems.push({ label: '利用マニュアル', Icon: HelpCircle, onSelect: () => { more.setOpen(false); onOpenManual(); } });
  if (onOpenVersionHistory) moreItems.push({ label: 'バージョン履歴', Icon: History, onSelect: () => { more.setOpen(false); onOpenVersionHistory(); } });
  if (onOpenMcpInfo) moreItems.push({ label: 'MCP コネクタ', Icon: Plug, onSelect: () => { more.setOpen(false); onOpenMcpInfo(); } });

  const initials = currentUser?.name?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <header
      className="relative z-30 flex h-16 shrink-0 items-center gap-1.5 border-b border-border bg-card px-3 sm:gap-2 sm:px-5"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* 二次ナビのハンバーガー (モバイル) */}
      {onToggleSecondaryNav && (
        <button
          type="button"
          onClick={onToggleSecondaryNav}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-secondary lg:hidden"
          aria-label="このアプリのメニューを開閉"
          style={{ touchAction: 'manipulation' }}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* ロゴ */}
      <a
        href="/today"
        className="flex shrink-0 items-center rounded-control px-1 py-1 transition-opacity hover:opacity-80"
        aria-label="GMO ONAiR の今日の画面へ"
      >
        <img src="/logo-onair.svg" alt="GMO ONAiR" className="h-4 w-auto max-w-[100px] sm:h-5 sm:max-w-none" />
      </a>

      {/* パンくず — モバイルは下タブが現在地を示すので出さない (さがす場所に幅を譲る) */}
      <div className="hidden min-w-0 shrink items-center gap-1.5 overflow-hidden text-sm sm:flex">
        {breadcrumb ? (
          <>
            <span className="shrink-0 select-none text-border" aria-hidden="true">
              /
            </span>
            <div className="min-w-0 truncate">{breadcrumb}</div>
          </>
        ) : null}
      </div>

      {/* さがす場所は上辺の中央 (デザイン 3a)。⌘K の入口を兼ねる */}
      {onOpenCommandPalette ? (
        <div className="mx-auto min-w-[128px] max-w-lg flex-1 px-0 sm:px-2">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="flex h-10 w-full items-center gap-2 rounded-control border border-input bg-background px-3 text-left text-secondary-foreground transition-colors hover:bg-secondary"
            aria-label="案件・顧客・機能をさがす"
            style={{ touchAction: 'manipulation' }}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[13px]">案件・顧客・機能をさがす</span>
            <kbd className="hidden shrink-0 rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-bold sm:inline">
              ⌘K
            </kbd>
          </button>
        </div>
      ) : centerContent ? (
        <div className="mx-auto hidden min-w-0 max-w-lg flex-1 px-2 sm:block">{centerContent}</div>
      ) : (
        <div className="flex-1" />
      )}

      {/* 通知ベル — 溜まる場所 (§4.15) */}
      {notificationSlot}

      {/* ⋯ (マニュアル / バージョン履歴 / MCP) */}
      {moreItems.length > 0 && (
        <>
          <button
            type="button"
            ref={more.btnRef}
            onClick={more.open ? () => more.setOpen(false) : more.show}
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-control transition-colors hover:bg-secondary sm:flex"
            aria-label="その他のメニュー"
            aria-expanded={more.open}
            aria-haspopup="menu"
            style={{ touchAction: 'manipulation' }}
          >
            <MoreHorizontal className="h-5 w-5 text-secondary-foreground" aria-hidden="true" />
          </button>
          {more.open && (
            <DropdownPanel panelRef={more.menuRef} pos={more.pos}>
              <div className="space-y-0.5 p-1.5">
                {moreItems.map((item) => (
                  <MenuRow key={item.label} {...item} />
                ))}
              </div>
            </DropdownPanel>
          )}
        </>
      )}

      {/* ユーザー */}
      {currentUser && (
        <>
          <button
            type="button"
            ref={user.btnRef}
            onClick={user.open ? () => user.setOpen(false) : user.show}
            className="flex min-h-tap shrink-0 items-center gap-1.5 rounded-control px-1.5 py-1.5 transition-colors hover:bg-secondary sm:px-2.5"
            aria-label="ユーザーメニュー"
            aria-expanded={user.open}
            aria-haspopup="menu"
            style={{ touchAction: 'manipulation' }}
          >
            <span className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
              {initials}
            </span>
            <span className="hidden max-w-[104px] truncate text-[13px] font-bold leading-none sm:inline">
              {currentUser.name}
            </span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 shrink-0 text-secondary-foreground transition-transform', user.open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          {user.open && (
            <DropdownPanel panelRef={user.menuRef} pos={user.pos}>
              <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-accent text-sm font-bold text-primary">
                  {initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold leading-tight">{currentUser.name}</p>
                  {currentUser.email && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{currentUser.email}</p>
                  )}
                  <span className="mt-1 inline-block rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-bold text-secondary-foreground">
                    {ROLE_LABEL[currentUser.role] ?? currentUser.role}
                  </span>
                </div>
              </div>
              {/* モバイルは ⋯ をここに畳む (上辺に並べると 375px で入らない) */}
              {moreItems.length > 0 && (
                <div className="space-y-0.5 border-b border-divider p-1.5 sm:hidden">
                  {moreItems.map((item) => (
                    <MenuRow
                      key={item.label}
                      {...item}
                      onSelect={() => {
                        user.setOpen(false);
                        item.onSelect();
                      }}
                    />
                  ))}
                </div>
              )}
              <div className="space-y-0.5 p-1.5">
                {onSwitchUser && (
                  <MenuRow
                    label="ユーザー切替"
                    Icon={ArrowLeftRight}
                    onSelect={() => {
                      user.setOpen(false);
                      onSwitchUser();
                    }}
                  />
                )}
                <MenuRow
                  label="ログアウト"
                  Icon={LogOut}
                  onSelect={() => {
                    user.setOpen(false);
                    onLogout();
                  }}
                />
              </div>
            </DropdownPanel>
          )}
        </>
      )}
    </header>
  );
}
