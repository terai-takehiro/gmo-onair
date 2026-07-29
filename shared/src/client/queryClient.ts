// shared/src/client/queryClient.ts — 全アプリ共通の React Query 設定
//
// **保存が黙って失敗するのを止めるのが主目的**。
//
// v3.1.0 まで、書き込み (useMutation) は 396 か所あったのに `onError` を持つのは
// 112 か所だけだった。残り 284 か所はサーバーが 400 / 403 / 500 を返しても
// **画面に何も出ない**ため、押した人には「押しても変わらない」としか見えない
// (実際にこの形で「個人予定が削除できない」「ヨミが変更できない」「GLS が発番できない」が
//  別々の版で1件ずつ報告され、そのたびに1画面だけ直していた)。
//
// 画面ごとに `onError` を足していく方式は、**新しく書いた画面が必ずまた漏れる**。
// そこで MutationCache に最後の受け皿を置き、
//   - 画面が自分で `onError` を持っているときは**黙る** (二重に出さない)
//   - 持っていないときだけ共通のお知らせ帯を出す
// という形にした。既存の 112 か所の文言は変わらず、残り 284 か所が黙らなくなる。
import { QueryClient, MutationCache } from '@tanstack/react-query';
import { notifyApiError } from './notify';

/**
 * 書き込みの meta。`useMutation({ mutationFn, meta: { action: '案件の保存' } })` の形で渡す。
 *
 *   action  何をしようとして失敗したかの日本語。省略すると「保存」になる
 *   silent  共通の受け皿を出さない (画面が自前でエラーを描いている場合)
 *
 * react-query の `Register` 拡張はしない — `meta` を厳格に型付けすると
 * 別の用途で `meta` を使いたくなったときにこちらの型を直す必要が出る。
 */
export interface MutationActionMeta {
  action?: string;
  silent?: boolean;
}

/** 401 は api クライアントがログイン画面に送るので、ここで帯を出すと二重に知らせることになる */
function isAuthError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status;
  return status === 401;
}

export const mutationCache = new MutationCache({
  // 引数の並びは (error, variables, onMutateResult, mutation, context)。
  // **4番目が mutation** — ここを取り違えると常に黙るか常に二重に出る。
  onError: (error, _variables, _onMutateResult, mutation) => {
    // 画面が自分で知らせているときは何もしない (同じ失敗を2回出さない)
    if (mutation.options.onError) return;
    const meta = (mutation.meta ?? {}) as MutationActionMeta;
    if (meta.silent) return;
    if (isAuthError(error)) return;
    notifyApiError(
      meta.action ? `${meta.action}に失敗しました` : '保存できませんでした',
      error,
      'もう一度お試しください。続くときは管理者に連絡してください。',
    );
  },
});

export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // 4xx は retry しない (権限/認証エラーは即時に表示)。
      // 5xx / network 系は最大 2 回 retry (= 計 3 試行) で transient blip を吸収。
      retry: (failureCount, error: unknown) => {
        const status = (error as { response?: { status?: number } } | null | undefined)?.response?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      // 書き込みは retry しない。同じ登録が2件できるほうが害が大きい
      retry: false,
    },
  },
});
