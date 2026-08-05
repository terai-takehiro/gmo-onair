/**
 * 上辺バー — 高さ **64px** (docs/design/v4/mockups/AppTopbar.dc.html)
 *
 * 左から: ロゴ ／ 区切り ／ **アプリ切替ボタン** ／ パンくず … 検索 ／ 補助 ／ 本人
 *
 * ── 旧ヘッダーとの違い ──────────────────────────────────────
 *
 * 旧 `SharedHeader` はアプリ切替が**9個の点のアイコン**だけで、いまどのアプリに
 * いるのかがヘッダーから読み取れませんでした (アプリ名は左メニューの中にあった)。
 * v4 は**アプリ名の入ったボタン**そのものが切替になり、押すと一覧が開きます。
 *
 * ── 凍結4アプリは一覧に出さない ────────────────────────────
 *
 * `visibleApps()` の既定 (`includeFrozen: false`) をそのまま使います。URL は
 * 生きているので、ブックマーク・配布済みQR・OBS の出力URL は今までどおり動きます。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Menu, Search, LogOut, ArrowLeftRight, HelpCircle, History, Plug, Home } from 'lucide-react';
import { cn } from '../utils';
import { APP_BY_KEY, visibleApps } from '../apps';
import type { ShellAccess, ShellUser } from './types';

const ROLE_LABEL: Record<string, string> = {
  system_admin: 'システム管理者',
  staff: 'スタッフ',
};

export interface AppTopbarProps extends ShellAccess {
  appKey: string;
  appLabel: string;
  crumb?: ReactNode;
  searchSlot?: ReactNode;
  user: ShellUser | null;
  onLogout: () => void;
  onSwitchUser?: () => void;
  /** スマホのハンバーガー。渡さないと出ない (左メニューが無い画面) */
  onToggleMenu?: () => void;
  onOpenManual?: () => void;
  onOpenVersionHistory?: () => void;
  onOpenMcpInfo?: () => void;
}

/** 押すと閉じる系のドロップダウンで使う「外側を押したら閉じる」 */
function useDismiss(open: boolean, close: () => void, ...refs: Array<React.RefObject<HTMLElement>>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // `refs` は毎回新しい配列になるので依存に入れない (入れると毎描画で貼り直す)。
    // 中身の ref オブジェクト自体は変わらないので、これで正しく動く。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);
}

export function AppTopbar({
  appKey,
  appLabel,
  crumb,
  searchSlot,
  user,
  onLogout,
  onSwitchUser,
  onToggleMenu,
  onOpenManual,
  onOpenVersionHistory,
  onOpenMcpInfo,
  role,
  permissions,
}: AppTopbarProps) {
  const [swOpen, setSwOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const swRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  useDismiss(swOpen, () => setSwOpen(false), swRef);
  useDismiss(userOpen, () => setUserOpen(false), userRef);

  const app = APP_BY_KEY[appKey];
  const AppIcon = app?.icon;
  const apps = visibleApps({ current: appKey, role, permissions });
  const base = typeof import.meta !== 'undefined' ? (import.meta.env?.BASE_URL ?? '/') : '/';

  return (
    <header data-shell-topbar className="flex h-16 shrink-0 items-center gap-3.5 border-b border-border bg-card px-4 sm:px-6">
      {/* スマホの左メニュー呼び出し。タップ領域 44px を確保する */}
      {onToggleMenu && (
        <button
          type="button"
          onClick={onToggleMenu}
          className="min-h-tap min-w-tap -ml-2 flex items-center justify-center rounded-control text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="メニューを開く"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <a href="/" className="hidden shrink-0 items-center sm:flex" title="ONAiR トップページへ">
        <img src={`${base}logo-onair.svg`} alt="GMO ONAiR" className="h-5 w-auto" />
      </a>
      <span className="hidden h-[22px] w-px bg-border sm:block" aria-hidden="true" />

      {/* ── アプリ切替 (アプリ名がそのままボタン) ────────────────── */}
      <div ref={swRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setSwOpen((v) => !v)}
          aria-expanded={swOpen}
          aria-haspopup="menu"
          className="text-list min-h-tap flex h-11 items-center gap-2.5 whitespace-nowrap rounded-control-lg border border-primary-border bg-primary-surface-weak px-3 text-primary hover:bg-primary-surface lg:h-10 lg:min-h-0"
        >
          {AppIcon && (
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-control bg-primary-surface">
              <AppIcon className="h-3.5 w-3.5" />
            </span>
          )}
          {appLabel}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>

        {swOpen && (
          <div
            role="menu"
            className="absolute left-0 top-[46px] z-[60] w-[min(600px,calc(100vw-2rem))] rounded-card border border-border bg-card p-4 shadow-2xl shadow-black/10"
          >
            <p className="text-th mb-2 text-muted-foreground">アプリを切り替え</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {apps.map((a) => (
                <a
                  key={a.key}
                  href={a.external ?? a.path}
                  {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => setSwOpen(false)}
                  className="flex items-center gap-2.5 rounded-control-lg border border-border bg-card p-2.5 hover:border-primary-border-strong"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control-md"
                    style={{ backgroundColor: `${a.color}1a` }}
                  >
                    <a.icon className="h-4 w-4" style={{ color: a.color }} />
                  </span>
                  <span className="text-list truncate">{a.label}</span>
                </a>
              ))}
            </div>
            <a
              href="/"
              className="text-list mt-3 flex items-center gap-2.5 border-t border-border-faint pt-3 text-primary"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              トップページへ戻る
            </a>
          </div>
        )}
      </div>

      {crumb && <span className="text-sub hidden truncate text-muted-foreground md:block">／ {crumb}</span>}

      <div className="flex-1" />

      {searchSlot}

      {/* ── 補助 (マニュアル / 版の履歴 / MCP) ────────────────────── */}
      <div className="hidden items-center gap-0.5 sm:flex">
        {onOpenManual && <IconButton onClick={onOpenManual} label="利用マニュアル" icon={HelpCircle} />}
        {onOpenVersionHistory && <IconButton onClick={onOpenVersionHistory} label="バージョン履歴" icon={History} />}
        {onOpenMcpInfo && <IconButton onClick={onOpenMcpInfo} label="MCP コネクタ" icon={Plug} />}
      </div>

      {/* ── 本人 ─────────────────────────────────────────────── */}
      {user && (
        <div ref={userRef} className="relative shrink-0">
          {/*
            丸は 32px (モックの値) だが、**押せる範囲は 44px** にする
            (docs/design/v4/_rules.md「3. スマホ」= タップ対象は最低 44px)。
            見た目を大きくすると上辺バーの 64px に収まらないので、
            当たり判定だけ広げる形にしてある。
          */}
          <button
            type="button"
            onClick={() => setUserOpen((v) => !v)}
            aria-expanded={userOpen}
            aria-haspopup="menu"
            aria-label={`${user.name} のメニュー`}
            className="min-h-tap min-w-tap flex items-center justify-center"
          >
            <span className="text-list flex h-8 w-8 items-center justify-center rounded-chip bg-primary-surface text-primary">
              {user.name.trim().charAt(0) || '?'}
            </span>
          </button>
          {userOpen &&
            createPortal(
              <div
                role="menu"
                className="fixed right-4 top-14 z-[9999] w-60 rounded-card border border-border bg-card p-1.5 shadow-2xl shadow-black/10"
              >
                <div className="border-b border-border-faint px-3 pb-2 pt-1.5">
                  <p className="text-list truncate">{user.name}</p>
                  <p className="text-sub-sm truncate text-muted-foreground">
                    {ROLE_LABEL[user.role] ?? user.role}
                    {user.email ? ` ・ ${user.email}` : ''}
                  </p>
                </div>
                <div className="pt-1 sm:hidden">
                  {onOpenManual && <MenuRow onClick={() => { setUserOpen(false); onOpenManual(); }} icon={HelpCircle}>利用マニュアル</MenuRow>}
                  {onOpenVersionHistory && <MenuRow onClick={() => { setUserOpen(false); onOpenVersionHistory(); }} icon={History}>バージョン履歴</MenuRow>}
                  {onOpenMcpInfo && <MenuRow onClick={() => { setUserOpen(false); onOpenMcpInfo(); }} icon={Plug}>MCP コネクタ</MenuRow>}
                </div>
                {onSwitchUser && (
                  <MenuRow onClick={() => { setUserOpen(false); onSwitchUser(); }} icon={ArrowLeftRight}>ユーザー切替</MenuRow>
                )}
                <MenuRow onClick={() => { setUserOpen(false); onLogout(); }} icon={LogOut} danger>ログアウト</MenuRow>
              </div>,
              document.body,
            )}
        </div>
      )}
    </header>
  );
}

function IconButton({ onClick, label, icon: Icon }: { onClick: () => void; label: string; icon: typeof Search }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="min-h-tap min-w-tap flex items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function MenuRow({
  onClick,
  icon: Icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: typeof Search;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-list min-h-tap flex w-full items-center gap-2.5 rounded-control px-3 text-left hover:bg-muted',
        danger ? 'text-destructive' : 'text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}
