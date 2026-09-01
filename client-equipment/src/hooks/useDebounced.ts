/**
 * 実体は `shared/src/client/hooks/useDebounced.ts`。
 *
 * ⚠️ **写しを作らないこと。** 同じタイマーが機材一覧・ケーブル・コネクタ・
 * 貸出機材一覧の4か所に手書きされていたのを1つにまとめた経緯があり、
 * 今回それを shared へ上げ直した。ここは薄い包みだけ。
 *
 * ⚠️ **既定を 400ms のまま保つ。** shared 側の既定は 300ms だが、
 * この4画面は 400ms で動いてきたので、**上げ直したついでに反応の速さを
 * 変えない**（変えるなら、変えたと分かる形で別に出す）。
 */
import { useDebounced as useDebouncedShared } from '@gmo-onair/shared/src/client/hooks/useDebounced';

export function useDebounced<T>(value: T, delay = 400): T {
  return useDebouncedShared(value, delay);
}
