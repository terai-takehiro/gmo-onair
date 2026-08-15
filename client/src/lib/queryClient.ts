/*
 * ⚠️ **共通のものをそのまま使う**（レビューでの指摘 #48）。
 *
 * ここは着手時点で**この アプリだけ独自の `QueryClient`** を作っており、
 * `shared/src/client/queryClient.ts` の **MutationCache（保存が黙って失敗しない
 * ための最後の受け皿）が効いていませんでした**。
 *
 * 書き込みは7アプリで 296 か所あるのに `onError` を持つのは 54 か所だけで、
 * 残りは 400 / 403 / 500 が返っても**画面に何も出ません**（押した人には
 * 「押しても変わらない」としか見えない）。**いちばん大きいアプリで**その受け皿が
 * 外れていたことになります（日常業務・機材管理は前から共通を読んでいました）。
 *
 * 既定の値も共通側のほうが丁寧です（4xx は retry しない・5xx は 2 回まで・
 * 書き込みは retry しない）。`staleTime` と `refetchOnWindowFocus` は同じ値です。
 */
export { queryClient, mutationCache } from '@gmo-onair/shared/src/client/queryClient';
