/**
 * 予約を触ったあとに読み直す問い合わせ (1か所にまとめる)
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * v4.1.1 で「カレンダーの予約 → 案件の実施日」の書き戻しを足しました
 * (`server/.../project-event-dates.service.ts`)。**サーバーは直しているのに、
 * 画面が読み直していませんでした。**
 *
 * 共通の `QueryClient` は `staleTime: 60_000` ＋ `refetchOnWindowFocus: false`
 * (`shared/src/client/queryClient.ts`) なので、予約を作る・動かす・消したあと
 * 案件詳細や案件一覧に戻ると、**最大60秒は古い実施日が出ます**。
 * つまり書き戻しを足した回に、**利用者から見た症状はそのまま残っていました**
 * (レビューでの指摘 #164・P1)。
 *
 * ⚠️ **これは画面を見ても分かりません。** 案件詳細は古い日付を自信を持って出し、
 * カレンダーは新しい日付を出します。どちらが本当かは**予約を1件ずつ開くか、
 * 60秒待って読み直す**しかありません。
 *
 * ── なぜ画面ごとに書かないか ────────────────────────────────
 *
 * 予約を書き換える口は**6か所**あり (下の一覧)、着手時点で**そのうち5か所が
 * 予約の鍵しか落としていません**でした。画面ごとに足す方式では、
 * **次に予約を触る画面を足した人が必ずまた書き忘れます** —
 * 書き忘れても**エラーは出ず、60秒待てば直る**ので気づけません。
 *
 * そこで**鍵の一覧をここに置き**、`shared/tests/bookingInvalidation.test.ts` が
 * 「`/studios/bookings` を書き換える画面は、この関数を呼んでいること」を
 * ソースを読んで固定します。
 */

import { HOLD_KEY } from '../contexts/production/pages/holds/holdLogic';

/** `queryClient` のうち、ここで使う分だけ。react-query を持ち込まずに試せるようにする */
export interface Invalidator {
  invalidateQueries(filters: { queryKey: readonly unknown[] }): unknown;
}

/**
 * 予約を1件書き換えたときに古くなる問い合わせの鍵。
 *
 * **前方一致で当たります** (react-query の既定)。`['project']` は
 * `['project', id]` に当たり、`['project-studio-bookings']` には**当たりません**
 * (配列の要素ごとの比較なので、文字列の前方一致ではない)。
 * 同じく `['projects']` は `['projects', view, page, ...]` (案件一覧・案件台帳) に当たります。
 */
export const BOOKING_AFFECTED_KEYS = [
  /** カレンダー・部屋の空き */
  ['studio-bookings'],
  /** 案件詳細の「スタジオ予約」一覧 */
  ['project-studio-bookings'],
  /** 案件詳細の実施日 (`event_start` / `event_end`) */
  ['project'],
  /** 案件一覧・案件台帳の実施日と並び順 */
  ['projects'],
  /** ③ 仮押さえ一覧・①予定サイドレールの「仮押さえ」ウィジェット (`holdLogic.ts` の HOLD_KEY と同一) */
  HOLD_KEY,
] as const;

/**
 * 予約を作る・動かす・消したあとに呼ぶ。
 *
 * **付け替え (案件 A → 案件 B) も込みです。** `['project']` を丸ごと落とすので、
 * 付け替え前後どちらの案件の詳細も読み直します
 * (id を数えて2つ落とす形にすると、**元の案件の id を控え忘れた画面から漏れます**)。
 */
export function invalidateBookingQueries(qc: Invalidator): void {
  for (const queryKey of BOOKING_AFFECTED_KEYS) qc.invalidateQueries({ queryKey });
}
