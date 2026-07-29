// shared/src/client/states — 全画面共通の4つの状態 (§2.4)
//
//   空       EmptyState / NoSearchResults
//   読み込み Delayed + SkeletonRows / SkeletonCard / SkeletonKpi
//   エラー   ErrorPanel (+ humanizeError)
//   知らないURL NotFoundPanel
//   権限なし NoPermissionPanel
//
// 画面ごとに自作しない。ここに無い状態が必要になったらここに足す。

export { EmptyState, NoSearchResults, type EmptyStateProps, type NoSearchResultsProps } from './EmptyState';
export {
  Delayed,
  SkeletonRows,
  SkeletonCard,
  SkeletonKpi,
  type SkeletonRowsProps,
  type SkeletonCardProps,
} from './Skeleton';
export { ErrorPanel, humanizeError, type ErrorPanelProps, type HumanCause } from './ErrorPanel';
export { NotFoundPanel, type NotFoundPanelProps } from './NotFoundPanel';
export {
  NoPermissionPanel,
  MODULE_LABELS,
  LEVEL_LABELS,
  type NoPermissionPanelProps,
} from './NoPermissionPanel';
