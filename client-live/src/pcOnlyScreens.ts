/**
 * 計時LIVE — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭を参照。
 *
 * ── どう分けたか（実際に画面を確認して判断） ──────────────────
 *
 * ⚠️ v4.1 段2（ミニアプリ化フェーズ2・URL再設計）で、運用画面
 * （ダッシュボード・タイマー管理・番組設定・組織の鍵設定）はすべて
 * `client-qsheet` バンドル側（`/qsheet/live/...`）へ移った。ここに残る
 * `/open` `/settings` `/program/:programId` 配下3つは**旧URLのリダイレクト専用画面**
 * （`pages/redirects/`）になったため、`<Redirect...>` という名前の部品を使う
 * ルートとして `check-mobile-declared.mjs` の対象から自動的に外れる
 * （転送は画面として数えない・同スクリプトの `routesOf()` 参照）。
 * このアプリで「スマホ／PC」を宣言する画面は、以後 `/`（案内画面）と
 * 表示画面（`/display/:timerId`）の2つだけになった
 *
 * - **PC専用の画面はもう無い。** 旧「組織の設定（`/settings`）」の PC専用判断は
 *   移植先の `client-qsheet/src/pcOnlyScreens.ts`（`QSHEET_PC_ONLY` の
 *   `/qsheet/live-org-settings`）に引き継いだ
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

export const LIVE_PC_ONLY: PcOnlyEntry[] = [];

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
  '/', // 計時・視聴者の案内（旧セッション一覧は廃止。制作技術支援の案件から開く案内を表示するだけ・v4.1段2）
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
