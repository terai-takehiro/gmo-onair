/**
 * スマホ下端のタブ (docs/design/v4/_rules.md「3. スマホ」)
 *
 * **3つが基本** — ホーム / やること / 検索。画面ごとに増やさないこと
 * (増やすと親指の届く範囲に収まらず、押し間違いが増える)。
 *
 * ── 寸法の根拠 ──────────────────────────────────────────────
 *
 * タップ対象は**最低 44px** (iOS HIG)。ここは 1タブ = 高さ 56px にしてある。
 * 下端は `env(safe-area-inset-bottom)` を足す — iPhone のホームバーに
 * 重なると押せないタブができる。
 */
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../utils';
import { isCurrent } from './AppSideMenu';
import type { ShellMobileTab } from './types';

export interface MobileTabsProps {
  tabs: ShellMobileTab[];
  /** `action: 'menu'` のタブを押したとき */
  onOpenMenu: () => void;
}

export function MobileTabs({ tabs, onOpenMenu }: MobileTabsProps) {
  const { pathname } = useLocation();
  if (tabs.length === 0) return null;
  return (
    <nav
      aria-label="下タブ"
      className="z-30 flex shrink-0 border-t border-border bg-card lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map((tab) =>
        tab.action === 'menu' ? (
          <button
            key={tab.label}
            type="button"
            onClick={onOpenMenu}
            className="text-sub-sm flex h-14 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground"
          >
            <tab.icon className="h-5 w-5" aria-hidden="true" />
            {tab.label}
          </button>
        ) : (
          <Link
            key={tab.label}
            to={tab.to ?? '/'}
            aria-current={isCurrent(pathname, tab.to ?? '/', tab.end) ? 'page' : undefined}
            className={cn(
              'text-sub-sm flex h-14 flex-1 flex-col items-center justify-center gap-1',
              isCurrent(pathname, tab.to ?? '/', tab.end) ? 'font-bold text-primary' : 'text-muted-foreground',
            )}
          >
            <tab.icon className="h-5 w-5" aria-hidden="true" />
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  );
}
