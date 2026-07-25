// shared/src/client/shell/AppShell.tsx — 全ブロックアプリ共通のレイアウトシェル
//
//   <TopBar>   ロゴ / パンくず / ⌘K / 通知ベル / ⋯ / ユーザー   高さ64px
//   <Rail>     6項目 + 設定 (PC=左88px / スマホ=下タブ)
//   <Main>     max-width なし
//
// 二次ナビ (secondaryNav) は各アプリ固有のメニュー用スロット。
// 案件管理は ⌘K が入る Phase 3 まで既存メニューをここに置いて到達性を保ち、
// 現場アプリ (機材・Qシート等) はこのスロットが本来の居場所。

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils';
import Rail, { type RailLinkRenderer } from './Rail';
import { resolveRailItems } from './railItems';
import TopBar, { type TopBarUser } from './TopBar';
import ManualModal from '../manual/ManualModal';
import VersionHistoryModal from '../versionHistory/VersionHistoryModal';
import McpInfoModal from '../mcpInfo/McpInfoModal';
import CommandPalette from '../commandPalette/CommandPalette';
import type { PaletteHit } from '../commandPalette/types';
import type { ManualContent } from '../manual/types';

export interface AppShellProps {
  currentUser: TopBarUser | null;
  onLogout: () => void;
  onSwitchUser?: () => void;
  /** レールの権限フィルタに使う */
  role?: string;
  permissions?: Record<string, string>;
  /** 現在のパス (レールのアクティブ判定) */
  currentPath: string;
  /** レール項目キー → 件数 */
  railBadges?: Record<string, number>;
  /** アプリ内遷移にするためのリンク実装 (react-router の NavLink 等) */
  renderLink?: RailLinkRenderer;
  /** パンくず (案件名・顧客名など) */
  breadcrumb?: ReactNode;
  /** このアプリ固有のメニュー */
  secondaryNav?: ReactNode;
  /** 二次ナビの見出し (アプリ名) */
  secondaryNavLabel?: string;
  /** ⌘K の左に置く任意スロット (移行期の既存グローバル検索) */
  centerContent?: ReactNode;
  /**
   * ⌘K。渡すと上辺にボタンが出て ⌘K / Ctrl+K でも開く。
   *   onRun  行き先を開く (アプリ内遷移かフルリロードかは各アプリが決める)
   *   search 案件・お客様の検索 (既存 GET /search)。省略すると3グループ目を出さない
   */
  commandPalette?: {
    onRun: (path: string) => void;
    search?: (q: string) => Promise<PaletteHit[]>;
  };
  onOpenNotifications?: () => void;
  notificationCount?: number;
  /** 渡すと ⋯ に「利用マニュアル」が出る */
  manualContent?: ManualContent;
  productLabel?: string;
  /**
   * main に共通の余白 (26px/32px) を付ける。
   * 既定は false — 既存画面が自前で余白を持っているため、
   * 刷新済みの画面から順に true にしていく (二重余白を避ける)。
   */
  padMain?: boolean;
  children: ReactNode;
}

export default function AppShell({
  currentUser,
  onLogout,
  onSwitchUser,
  role,
  permissions,
  currentPath,
  railBadges,
  renderLink,
  breadcrumb,
  secondaryNav,
  secondaryNavLabel,
  centerContent,
  commandPalette,
  onOpenNotifications,
  notificationCount,
  manualContent,
  productLabel = 'GMO ONAiR',
  padMain = false,
  children,
}: AppShellProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K。入力中でも開けるようにする (探すのは常に最短距離で)
  useEffect(() => {
    if (!commandPalette) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commandPalette]);

  const railItems = resolveRailItems({ role, permissions });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <TopBar
        currentUser={currentUser}
        onLogout={onLogout}
        onSwitchUser={onSwitchUser}
        breadcrumb={breadcrumb}
        onToggleSecondaryNav={secondaryNav ? () => setNavOpen((v) => !v) : undefined}
        centerContent={centerContent}
        onOpenCommandPalette={commandPalette ? () => setPaletteOpen(true) : undefined}
        onOpenNotifications={onOpenNotifications}
        notificationCount={notificationCount}
        onOpenManual={manualContent ? () => setManualOpen(true) : undefined}
        onOpenVersionHistory={() => setVersionOpen(true)}
        onOpenMcpInfo={() => setMcpOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <Rail
          items={railItems}
          currentPath={currentPath}
          badges={railBadges}
          renderLink={renderLink}
          onNavigate={() => setNavOpen(false)}
        />

        {secondaryNav && (
          <>
            {/* モバイルのドロワー背景 */}
            {navOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                onClick={() => setNavOpen(false)}
                aria-hidden="true"
              />
            )}
            <aside
              aria-label={secondaryNavLabel ? `${secondaryNavLabel} のメニュー` : 'サブメニュー'}
              className={cn(
                'fixed inset-y-0 left-0 z-50 flex w-[76vw] max-w-[300px] flex-col border-r border-border bg-card transition-transform',
                'lg:static lg:z-auto lg:w-[220px] lg:max-w-none lg:translate-x-0',
                navOpen ? 'translate-x-0' : '-translate-x-full',
              )}
            >
              <div className="flex h-14 items-center gap-2 border-b border-divider px-3 lg:hidden">
                <span className="truncate text-sm font-bold">{secondaryNavLabel ?? 'メニュー'}</span>
                <button
                  type="button"
                  onClick={() => setNavOpen(false)}
                  className="ml-auto flex h-10 w-10 items-center justify-center rounded-control hover:bg-secondary"
                  aria-label="メニューを閉じる"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto" onClick={() => setNavOpen(false)}>
                {secondaryNav}
              </div>
            </aside>
          </>
        )}

        <main
          className={cn(
            'min-w-0 flex-1 overflow-y-auto',
            // スマホは下タブに隠れないよう底上げ
            'pb-[calc(58px+env(safe-area-inset-bottom))] lg:pb-0',
            padMain && 'px-4 py-4 sm:px-8 sm:py-[26px]',
          )}
        >
          {children}
        </main>
      </div>

      {manualContent && (
        <ManualModal open={manualOpen} onOpenChange={setManualOpen} content={manualContent} />
      )}
      <VersionHistoryModal open={versionOpen} onOpenChange={setVersionOpen} productLabel={productLabel} />
      <McpInfoModal open={mcpOpen} onOpenChange={setMcpOpen} />
      {commandPalette && (
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          access={{ role, permissions }}
          onRun={commandPalette.onRun}
          search={commandPalette.search}
        />
      )}
    </div>
  );
}
