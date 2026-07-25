// shared/src/client/shell/SecondaryNavList.tsx — 二次ナビの共通リスト
//
// 現場アプリ (Qシート・機材・技術資料・計時LIVE・リアルタイムCG・日常業務) は
// メニューの形が同じなので、項目の配列を渡すだけで描けるようにした。
// これまで 6 アプリで同一の <aside> + nav をコピペしていた分をここに集約する。

import type { ElementType, ReactNode } from 'react';
import { cn } from '../utils';
import type { RailLinkRenderer } from './Rail';

export interface SecondaryNavItem {
  label: string;
  href: string;
  Icon: ElementType;
  /** 完全一致のときだけアクティブにする (アプリのトップなど) */
  exact?: boolean;
  /** 見出し。この項目の上にグループ名を出す */
  groupTitle?: string;
}

export interface SecondaryNavListProps {
  items: SecondaryNavItem[];
  currentPath: string;
  renderLink?: RailLinkRenderer;
  /** リストの下に足す任意の要素 (「新規作成」ボタンなど) */
  footer?: ReactNode;
}

const defaultRenderLink: RailLinkRenderer = ({ children, className, ...rest }) => (
  <a className={className} {...rest}>
    {children}
  </a>
);

function isActive(item: SecondaryNavItem, currentPath: string): boolean {
  if (item.exact) return currentPath === item.href;
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}

export default function SecondaryNavList({
  items,
  currentPath,
  renderLink,
  footer,
}: SecondaryNavListProps) {
  const link = renderLink ?? defaultRenderLink;

  return (
    <nav className="space-y-1 p-3">
      {items.map((item) => {
        const active = isActive(item, currentPath);
        return (
          <div key={item.href}>
            {item.groupTitle && (
              <p className="mb-1 mt-3 px-3 text-[12px] font-bold tracking-wide text-muted-foreground first:mt-0">
                {item.groupTitle}
              </p>
            )}
            {link({
              href: item.href,
              'aria-current': active ? 'page' : undefined,
              className: cn(
                'flex items-center gap-2.5 rounded-control px-3 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-accent text-primary'
                  : 'text-secondary-foreground hover:bg-secondary hover:text-foreground',
              ),
              children: (
                <>
                  <item.Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                </>
              ),
            })}
          </div>
        );
      })}
      {footer ? <div className="pt-2">{footer}</div> : null}
    </nav>
  );
}
