/**
 * 「中断」は失敗ではない — retry もエラー表示もしない印
 *
 * ⚠️ **これが無いと、絞り込むたびにエラーが出る画面になります。**
 * 中断された通信は HTTP の状態を持たないので、`queryClient` の retry 判定
 * （4xx なら諦める・それ以外は2回まで試す）では **4xx に当たらず2回リトライ**され、
 * 3回失敗したあと `ErrorPanel` が `status === undefined` の枝を選んで
 * **「通信ができませんでした。ネットワークを確かめて…」**と出してしまいます。
 *
 * ⚠️ **そもそも `AbortController` を自分で作らないこと。** 中断は
 * `queryFn: async ({ signal }) => …` から渡ってくるものだけを使います。
 * react-query が自分で中断したぶんは `CancelledError` として内部で処理され、
 * エラーにはなりません。ここは**自前で作ってしまった場合の受け皿**です。
 */
export function isCanceled(error: unknown): boolean {
  const e = error as { code?: string; name?: string } | null | undefined;
  return e?.code === 'ERR_CANCELED'      // axios 1.x
    || e?.name === 'CanceledError'
    || e?.name === 'AbortError';         // 素の fetch / DOM
}
