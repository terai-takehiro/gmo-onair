// Client-shared exports — used by all sub-app clients
export { cn } from './utils';
export { queryClient } from './queryClient';
export { useUiStore, type UiState } from './uiStore';
export { createApi, type ApiConfig } from './createApi';
export { createAuthHook, type AuthHookConfig } from './createAuthHook';

// レイアウトシェル (TopBar + レール + Main)
export {
  AppShell,
  TopBar,
  Rail,
  RAIL_ITEMS,
  resolveRailItems,
  activeRailKey,
  type AppShellProps,
  type TopBarProps,
  type TopBarUser,
  type RailProps,
  type RailItem,
  type RailLinkRenderer,
  type RailLinkArgs,
} from './shell';

// 全画面共通の4つの状態
export {
  EmptyState,
  NoSearchResults,
  Delayed,
  SkeletonRows,
  SkeletonCard,
  SkeletonKpi,
  ErrorPanel,
  humanizeError,
  NoPermissionPanel,
  MODULE_LABELS,
  LEVEL_LABELS,
} from './states';
