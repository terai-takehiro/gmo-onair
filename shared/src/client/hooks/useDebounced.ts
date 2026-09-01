/**
 * 入力が止まってから値を返す。**探す欄で1文字ごとに問い合わせない**ため。
 *
 * ── なぜ `useDeferredValue` ではないか ────────────────────────
 *
 * React 18 の `useDeferredValue` が遅らせるのは**レンダー**であって**時間**では
 * ありません。低優先度の再レンダーは次のフレームで必ず反映されるので、
 * **問い合わせの鍵は結局1文字ごとに変わり、リクエストの数は減りません**。
 * 困っているのは「入力欄が固まること」ではなく
 * 「1文字＝1リクエスト＝サーバー側で SQL 4〜5本」なので、
 * **回数を減らせるのは時間で遅らせるこの形だけ**です。
 *
 * ── 使い方の決めごと ────────────────────────────────────────
 *
 * ⚠️ **入力欄が読む値は遅らせないこと。** 遅らせるのは
 * **問い合わせの鍵に渡す値だけ**です。入力欄まで遅らせると打鍵が1テンポ遅れて見えます。
 * ⚠️ **「0件でした」の判定は遅らせた値で行うこと。** 即時の値で判定すると、
 * **まだ問い合わせていない言葉で「該当なし」**が一瞬出ます。
 */
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
