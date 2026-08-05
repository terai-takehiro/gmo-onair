/**
 * shared/src/client/states — 画面の「中身が無いとき」の5通りを1か所にする
 *
 *   空          `EmptyState` / `NoSearchResults`
 *   読み込み中   `Delayed` + `SkeletonRows` / `SkeletonCard` / `SkeletonKpi`
 *   エラー      `ErrorPanel` (+ `humanizeError`)
 *   知らない URL `NotFoundPanel`
 *   権限なし     `NoPermissionPanel`
 *
 * **画面ごとに自作しない。** ここに無い状態が必要になったらここに足す。
 *
 * ── なぜ共通部品にするか (v4 着手時に数えた) ──────────────────
 *
 *   ・**読み込み中が `animate-spin` の手書きで 197 か所** (client 126 / 機材 46 /
 *     日常業務 25)。全画面が真っ白になる画面と、骨格が残る画面が混在している
 *   ・**知らない URL の扱いがアプリごとに3通り**。計時LIVE・リアルタイムCG・
 *     日常業務は `path="*"` が無く**真っ白**になる (「壊れた」のか
 *     「読み込み中」なのか区別が付かない)
 *   ・**権限なしは白紙かブラウザ標準のダイアログ**。何の権限が要るのか出ない
 *
 * ── `EmptyState` は既存のものを使う (P3 の判断) ──────────────
 *
 * `shared/src/client/dashboard/EmptyState.tsx` が**すでに 29 ファイルで使われている**
 * (うち4ファイルは凍結アプリ = 見た目を変えられない)。同じ名前の部品を2つ作ると
 * 「どっちを import したかで見た目が変わる」ので、**実装は1つに保ち、
 * ここから再エクスポート**する。v4 の画面はこのバレルだけを見ればよい。
 *
 * ただし既定の `title` が「データがありません」なのは v4 の決めごとに反する
 * (「何が無いのか」と「次の一手」を書くこと)。**v4 の画面では `title` と
 * `description` を必ず渡すこと** — G3 の検査で止める予定。
 */
export { EmptyState, type EmptyStateProps } from '../dashboard/EmptyState';
export { NoSearchResults, type NoSearchResultsProps } from './NoSearchResults';
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
