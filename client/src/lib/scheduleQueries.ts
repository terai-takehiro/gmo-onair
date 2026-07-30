// 予定を書き換えたあとに「何を再取得させるか」の定義。1か所に集める (v3.1.1)
//
// ── なぜ1ファイルにしたか ─────────────────────────────────────
//
// 予約を登録したのに一覧が増えない、という形の不具合が繰り返し起きていた。
// 原因はいつも同じで、**書いた側と読んだ側で問い合わせの鍵が違う**:
//
//   StudioBookingDialog が無効化していたのは  ["studio-bookings"] だけ
//   案件詳細の予約一覧が使っているのは        ["project-studio-bookings", id]
//   「期限が近い仮押さえ」が使っているのは     ["studio-holds"]
//
// `refetchOnWindowFocus` は切ってあるので (queryClient.ts)、リロードするまで
// 画面は古いまま。押した人には「登録できなかった」ように見えるので、
// **もう一度入れ直す**。これが二重登録の主要な作られ方のひとつだった。
//
// 画面ごとに鍵を書き足す方式は、新しい画面が増えるたびに必ずまた漏れる。
// ここに層ごとの一覧を持ち、**書いた側は層の名前だけを言う**形にする。

import type { QueryClient } from '@tanstack/react-query';

/**
 * 層ごとの問い合わせ鍵。
 *
 * 鍵は**前方一致**で無効化されるので、`['project-studio-bookings']` と書けば
 * 案件ごとの `['project-studio-bookings', id]` すべてが対象になる
 * (どの案件の予約を変えたのか呼び出し側が知らなくても取りこぼさない)。
 */
const SCHEDULE_QUERY_KEYS = {
  /**
   * スタジオ予約・仮押さえ。
   *
   * **同じ「案件の予約」を読む問い合わせが3つある** (端点も違う) ので、
   * 1つでも漏らすとその画面だけ古いまま残る:
   *   project-studio-bookings  案件編集画面の一覧      GET /studios/bookings?project_id=
   *   project-schedule         案件詳細の「予定」タブ  GET /projects/:id/schedule
   *   studio-holds             期限が近い仮押さえ      GET /studios/bookings?type=hold
   * `today/inquiry-availability` は空き照会 (予約が入れば候補日が変わる)。
   */
  studio: [
    ['studio-bookings'],
    ['project-studio-bookings'],
    ['project-schedule'],
    ['studio-holds'],
    ['calendar-events'],
    ['today', 'inquiry-availability'],
  ],
  /** 個人予定 (手入力 + ICS購読 + Google + Outlook) */
  personal: [['personal-events']],
  /** パートナー予定 (代休 / 有給 / 出張) */
  partner: [['partner-schedules'], ['my-partner-schedules']],
} as const;

export type ScheduleLayer = keyof typeof SCHEDULE_QUERY_KEYS;

/**
 * 予定を書き換えたあとに呼ぶ。触った層だけを渡す。
 *
 * ```ts
 * onSuccess: () => { invalidateSchedule(qc, 'studio'); }
 * ```
 */
export function invalidateSchedule(qc: QueryClient, ...layers: ScheduleLayer[]) {
  for (const layer of layers) {
    for (const key of SCHEDULE_QUERY_KEYS[layer]) {
      qc.invalidateQueries({ queryKey: key as unknown as readonly unknown[] });
    }
  }
}
