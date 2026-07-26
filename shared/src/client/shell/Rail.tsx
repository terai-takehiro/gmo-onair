// shared/src/client/shell/Rail.tsx — 共通レール (6項目 + 設定)
//
// PC (lg 以上): 左端の 88px 固定列。
// スマホ (lg 未満): 画面下端の固定タブバー。片手で全部届く。
//
// react-router に依存しない (shared は router 非依存)。
// アプリ内遷移にしたい場合は renderLink で NavLink を注入する。

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../utils';
import { activeRailKey, type RailItem } from './railItems';

export interface RailLinkArgs {
  href: string;
  className: string;
  children: ReactNode;
  'aria-current'?: 'page';
  'aria-label'?: string;
  title?: string;
  onClick?: () => void;
}

/** アプリ側が react-router の NavLink 等を注入するためのフック */
export type RailLinkRenderer = (args: RailLinkArgs) => ReactNode;

const defaultRenderLink: RailLinkRenderer = ({ children, className, ...rest }) => (
  <a className={className} {...rest}>
    {children}
  </a>
);

export interface RailProps {
  items: RailItem[];
  /** 現在のパス (アクティブ判定用) */
  currentPath: string;
  /** 項目キー → 件数。0 と未指定はバッジを出さない */
  badges?: Record<string, number>;
  renderLink?: RailLinkRenderer;
  /** 遷移時に呼ぶ (モバイルの二次ナビを閉じる等) */
  onNavigate?: () => void;
  /** スマホの下タブ「さがす」を押したとき (⌘K を開く)。渡さなければタブを出さない */
  onSearch?: () => void;
}

function Badge({ count }: { count: number }) {
  const label = count > 99 ? '99+' : String(count);
  return (
    <span
      className="absolute -right-1.5 -top-1 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[11px] font-bold leading-[18px] text-destructive-foreground"
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

export default function Rail({ items, currentPath, badges, renderLink, onNavigate, onSearch }: RailProps) {
  const link = renderLink ?? defaultRenderLink;
  const activeKey = activeRailKey(currentPath, items);

  const top = items.filter((i) => i.position !== 'bottom');
  const bottom = items.filter((i) => i.position === 'bottom');
  // 下タブに出す項目。RAIL_ITEMS は 4 つに mobile を立てているので通常はそちらが使われる。
  // items を自前で組んだ呼び出し側 (mobile 指定なし) では従来どおり全項目を出す。
  const flagged = items.filter((i) => i.mobile);
  const mobileItems = flagged.length > 0 ? flagged : [...top, ...bottom];

  const renderItem = (item: RailItem, layout: 'column' | 'bar') => {
    const isActive = item.key === activeKey;
    const count = badges?.[item.key] ?? 0;
    const shape =
      layout === 'column'
        ? 'w-full flex-col gap-1 px-1 py-2.5'
        : 'flex-1 flex-col gap-0.5 px-1 py-1.5';

    return (
      <div key={item.key} className={layout === 'bar' ? 'flex flex-1 justify-center' : 'w-full'}>
        {link({
          href: item.href,
          onClick: onNavigate,
          'aria-current': isActive ? 'page' : undefined,
          title: count > 0 ? `${item.label} (${count}件)` : item.label,
          className: cn(
            'group relative flex items-center justify-center rounded-control text-[12px] font-bold leading-none transition-colors',
            'min-h-[52px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            shape,
            isActive
              ? 'bg-accent text-primary'
              : 'text-secondary-foreground hover:bg-secondary hover:text-foreground',
          ),
          children: (
            <>
              <span className="relative flex items-center justify-center">
                <item.Icon
                  className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-current')}
                  aria-hidden="true"
                  strokeWidth={isActive ? 2.4 : 2}
                />
                {count > 0 && <Badge count={count} />}
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
            </>
          ),
        })}
      </div>
    );
  };

  return (
    <>
      {/* PC — 左端の縦レール */}
      <nav
        aria-label="メインナビゲーション"
        className="hidden w-[88px] shrink-0 flex-col border-r border-border bg-card lg:flex"
      >
        <div className="flex flex-1 flex-col gap-1 p-2">{top.map((i) => renderItem(i, 'column'))}</div>
        {bottom.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-divider p-2">
            {bottom.map((i) => renderItem(i, 'column'))}
          </div>
        )}
      </nav>

      {/*
        スマホ — 下端のタブバー (§4.19 / デザイン 19a)。
        7項目を 375px に並べると 1つ 53px でラベルが潰れるので、**現場で使う4つ + さがす**に絞る。
        絞った分 (お客様・お金・設定) は さがす から辿れる (⌘K は全メニューを持っている)。
      */}
      <nav
        aria-label="下タブ"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {mobileItems.map((i) => renderItem(i, 'bar'))}
        {onSearch && (
          <div className="flex flex-1 justify-center">
            <button
              type="button"
              onClick={onSearch}
              className={cn(
                'group relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5',
                'min-h-[52px] text-[12px] font-bold leading-none text-secondary-foreground transition-colors',
                'hover:bg-secondary hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
              aria-label="さがす"
            >
              <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">さがす</span>
            </button>
          </div>
        )}
      </nav>
    </>
  );
}
