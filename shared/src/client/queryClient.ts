// shared/src/client/queryClient.ts — 全アプリ共通の React Query 設定
//
// ── **保存が黙って失敗するのを止めるのが主目的** ──────────────────
//
// 書き込み (`useMutation`) は7アプリで **296 か所**あるのに、`onError` の記述は
// **54 か所**しかありません (しかもこの 54 には mutation 以外の用途も混ざるので
// 実際はもっと少ない)。残りはサーバーが 400 / 403 / 500 を返しても
// **画面に何も出ません**。押した人には「押しても変わらない」としか見えません。
//
// 画面ごとに `onError` を足していく方式では、**新しく書いた画面が必ずまた漏れます**。
// そこで MutationCache に**最後の受け皿**を置きます:
//
//   ・画面が自分で `onError` を持っているときは**黙る** (同じ失敗を2回出さない)
//   ・持っていないときだけ共通のお知らせ帯 (`NoticeBar`) を出す
//
// 既存の文言は変わらず、**黙っていた分だけが黙らなくなります**。
//
// ── 凍結4アプリへの影響 ────────────────────────────────────
//
// 凍結アプリは `<NoticeBar />` を置かないので、`setNotice` が呼ばれても
// **描く相手がいない = 今日と同じ挙動**です (見た目は変わりません)。
// v4.1 以降で載せ替えるときに帯を置けば、そのとき効き始めます。
import { QueryClient, MutationCache } from '@tanstack/react-query';
import { notifyApiError } from './notify';

/**
 * 書き込みの `meta`。`useMutation({ mutationFn, meta: { action: '案件の保存' } })` の形で渡す。
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
  /*
   * **4番目の引数が mutation** (並びは (error, variables, context, mutation))。
   * ここを取り違えると「常に黙る」か「常に二重に出る」のどちらかになり、
   * どちらも画面を見ただけでは原因が分からない。
   * → `shared/tests/queryClient.test.ts` で実際に失敗させて固定してある。
   */
  onError: (error, _variables, _context, mutation) => {
    /*
     * 画面が自分で知らせているときは何もしない (同じ失敗を2回出さない)。
     *
     * ⚠️ **見えるのは `useMutation({ onError })` だけです**（レビューでの指摘 #48・実測）。
     * `mutate(vars, { onError })` の形は react-query が**観測者の側**に持つので
     * `mutation.options` には入らず、**ここは黙れません**。
     *
     * それでも画面に出るのは1つです — **受け皿が先・画面があと**の順で走り、
     * `setNotice` は帯を1つしか持たないので**画面の文言が残ります**。
     * つまり**順番のおかげ**なので、`shared/tests/queryClient.test.ts` で固定してあります
     * （入れ替わると、共通の文言が画面の文言を上書きして何が失敗したか分からなくなる）。
     */
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
      // 書き込みは retry しない。同じ登録が2件できるほうが害が大きい。
      // (react-query の既定も 0 回なので**挙動は変わらない**。明示しておく)
      retry: false,
    },
  },
});
