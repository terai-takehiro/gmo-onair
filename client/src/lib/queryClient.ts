// 案件管理アプリの QueryClient。
//
// v3.1.0 まで、このファイルだけが**自前の QueryClient** を作っていた
// (他の6アプリは shared を再エクスポートしている)。そのため案件管理だけが
//   - 4xx でも retry: 1 で再送していた (権限エラーの表示が1往復ぶん遅れる)
//   - 書き込みが失敗したときの共通の受け皿 (MutationCache) を持っていなかった
// という状態だった。一番人が触るアプリなので共通の設定に寄せる。
export { queryClient } from '@gmo-onair/shared/src/client/queryClient';
