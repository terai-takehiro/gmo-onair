/**
 * 計時LIVE — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭を参照。
 *
 * ── どう分けたか（実際に画面を確認して判断） ──────────────────
 *
 * - **セッション一覧・ダッシュボード・タイマー管理・番組設定**は、
 *   もともと `sm:` で縦積みに畳む作りになっていた（一覧はカード、
 *   タイマー管理は `sm:flex-row` の一覧＋詳細、番組設定は縦一列のフォーム）。
 *   本番中に会場やロビーからタイマー・視聴者数だけ確認したい場面も
 *   実際にあるため、スマホでも開けるようにする
 * - **組織の設定（`/settings`）だけ PC 専用**にした。YouTube / Jstream / Zoom /
 *   Teams の API キー・クライアントシークレットを外部サービスの管理画面と
 *   往復しながら貼り付ける画面で、`docs/design/v4/mobile.md` の
 *   `spNotOnPhone`（「設定と権限」）に当たる
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

export const LIVE_PC_ONLY: PcOnlyEntry[] = [
  {
    path: '/settings',
    what: '計時LIVEの設定',
    why: 'YouTube・Jstream・Zoom・TeamsのAPIキーや資格情報を登録する画面です。外部サービスの管理画面と往復しながら入力するため、PCでの操作を前提にしています。',
    instead: { label: 'セッション一覧を開く', to: '/' },
  },
];

/**
 * **スマホの左メニューから落とすルート**（`hidden: true` の分）。
 * シェルに渡すと、スマホのときだけ項目が消えます。**ルートは生きています。**
 */
export const LIVE_MOBILE_HIDDEN = LIVE_PC_ONLY.filter((e) => e.hidden).map((e) => e.path);

/**
 * **スマホで触る／読む画面。** ここと `LIVE_PC_ONLY` のどちらにも入っていない
 * ルートがあると `npm run lint` が止まります（決めないまま出さないため）。
 */
export const LIVE_MOBILE_OK: string[] = [
  '/',                             // セッション一覧
  '/program/:programId',           // ダッシュボード（タイマー・視聴者数の確認）
  '/program/:programId/timers',    // タイマー管理
  '/program/:programId/settings',  // 番組設定（配信URL・ID）
  /*
   * 表示画面 (`/live/display/:timerId`)。`App.tsx` の `DisplayRouter`（`AppShell` を
   * 経由しない別ルーター・認証なし）が持つルートで、`check-mobile-declared.mjs` は
   * ファイル全体からルートを拾うのでここにも出てくる。この PR では
   * `TimerDisplayPage.tsx` に一切触れていない — 元から vw/vh で組んであり
   * スマホでもそのまま表示できる画面なので、素性どおり「スマホで触る」に置く
   * （`PcOnlyGate` はこの画面を経由しないので、実際の挙動には影響しない）。
   */
  '/display/:timerId',
];
