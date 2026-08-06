/**
 * 入力が止まってから値を返す。**探す欄で1文字ごとに問い合わせない**ため。
 *
 * 同じ 400ms のタイマーが機材一覧・ケーブル・コネクタ・貸出機材一覧の4か所に
 * それぞれ手書きされていました (1つは `handleSearchChange._timer` に
 * 関数オブジェクトを生やす形で、型も付いていませんでした)。
 */
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
