/**
 * 打ち込みが止まってから値を渡す（1文字ごとにサーバーへ投げないため）
 *
 * 待つのは**投げるまで**です。投げたあとの遅れ（古い結果が新しい結果より後に
 * 届く）は react-query が問い合わせの鍵ごとに持つので、ここでは扱いません。
 */
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, ms = 300): T {
  const [slow, setSlow] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSlow(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return slow;
}
