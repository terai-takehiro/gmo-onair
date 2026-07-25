// shared/src/client/shell — 全アプリ共通のレイアウトシェル
export { default as AppShell, type AppShellProps } from './AppShell';
export { default as TopBar, type TopBarProps, type TopBarUser } from './TopBar';
export { default as Rail, type RailProps, type RailLinkRenderer, type RailLinkArgs } from './Rail';
export {
  default as SecondaryNavList,
  type SecondaryNavListProps,
  type SecondaryNavItem,
} from './SecondaryNavList';
export {
  RAIL_ITEMS,
  resolveRailItems,
  activeRailKey,
  type RailItem,
  type ResolveRailOptions,
} from './railItems';
