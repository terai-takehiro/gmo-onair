/**
 * 制作資料 — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭を参照。
 *
 * `AppShell.tsx` が `<PcOnlyGate table={TECHOPS_PC_ONLY}>` として実際に使っている。
 * ただし **`<PcOnlyGate>` は共通シェル配下（`AppShell` の `<Outlet />`）でしか
 * 効かない** — 本番3画面（`/techops/onair/:id` 等）はシェル無しの独立ルート
 * なので、この表に載っていても実際にゲートを通ることは無い（それでも
 * `scripts/check-mobile-declared.mjs` の宣言としては必要）。
 *
 * - **編集（`/techops/editor/:id`）は PC 専用**（`docs/design/v4/mobile.md` の
 *   `spNotOnPhone` に「Qシートの編集」と明記されている）
 * - **本番3画面（進行・ランダウン・プロンプター）も PC/据え置き端末専用**。
 *   OBS のブラウザソースや配信卓に固定して使う運用画面であり、
 *   持ち替えて使う想定ではないため
 * - **公開音声サポート（`/techops/audio/:id`）はスマホで開く**（現場のスタッフや
 *   出演者が手元のスマホで見る前提の画面）
 * - **アプリのトップ（`/techops/top`）・進行台本の案件選択（`/techops/home`）・
 *   一覧（`/techops/sheets`）・番組（マニュアル）のハブ（`/techops/programs/:id`）は
 *   スマホで開く**（2026-08-22 追加分）
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

const SHEETS = { label: '進行台本の一覧を開く', to: '/techops/sheets' };

export const TECHOPS_PC_ONLY: PcOnlyEntry[] = [
  {
    path: '/techops/editor/:id',
    what: '進行台本の編集',
    why: '構成・キュー・立ち位置図をまとめて組む画面で、列とパネルが多く狭い幅では組めません。',
    instead: SHEETS,
  },
  {
    path: '/techops/onair/:id',
    what: '本番・進行',
    why: '配信卓・OBS のブラウザソースに固定して使う運用画面です。',
    instead: SHEETS,
  },
  {
    path: '/techops/rundown/:id',
    what: '本番・ランダウン',
    why: '配信卓に固定して使う運用画面です。',
    instead: SHEETS,
  },
  {
    path: '/techops/prompter/:id',
    what: '本番・プロンプター',
    why: '大きな画面に固定して読み上げる運用画面です。',
    instead: SHEETS,
  },
  {
    path: '/techops/settings/schedule-templates',
    what: 'スケジュール表のひな形の編集',
    why: '列・項目の組み合わせを一度に見ながら組む画面で、狭い幅では組めません。',
    instead: { label: 'スケジュール表の一覧を開く', to: '/techops/schedules' },
  },
  {
    // 計時・視聴者（liveops）の組織の鍵設定。旧 client-live 側の `LIVE_PC_ONLY`
    // （`/settings`）と同じ理由。番組設定（`/techops/live/:ownerKey/settings`）は
    // 対象外 — 元実装（`LIVE_MOBILE_OK`）どおりスマホでも開ける
    path: '/techops/live-org-settings',
    what: '計時・視聴者の組織の鍵設定',
    why: 'YouTube・Jstream・Zoom・TeamsのAPIキーや資格情報を登録する画面です。外部サービスの管理画面と往復しながら入力するため、PCでの操作を前提にしています。',
    instead: { label: 'アプリのトップを開く', to: '/techops/top' },
  },
  {
    // 計時・視聴者の「案件に紐づかない既存セッション」一覧（レビュー対応・§致命的2）。
    // 一覧＋タイマー操作＋視聴者計測パネルを1画面に収めた管理者向けの診断画面で、
    // 組織の鍵設定と同じ理由（狭い幅で運用する想定ではない）でPC専用にした。
    path: '/techops/live-legacy',
    what: '計時・視聴者の案件に紐づかないセッション一覧',
    why: '旧スタンドアロン作成で残ったセッションを探して開き直すための管理者向け画面で、日常的にスマホから開く運用ではありません。',
    instead: { label: 'アプリのトップを開く', to: '/techops/top' },
  },
];

/**
 * **スマホの左メニューからも落とすルート**（`hidden: true` の分）。
 * シェルに渡すと、スマホのときだけ項目が消える（他の v4 対象2アプリと同じ形。
 * いまは `hidden: true` を付けた項目が無いので空配列）。
 */
export const TECHOPS_MOBILE_HIDDEN = TECHOPS_PC_ONLY.filter((e) => e.hidden).map((e) => e.path);

/**
 * **スマホで触る／読む画面。** ここと `TECHOPS_PC_ONLY` のどちらにも入っていない
 * ルートがあると `npm run lint` が止まります。
 */
export const TECHOPS_MOBILE_OK: string[] = [
  '/techops/top',       // アプリのトップ（番組・イベントを選ぶ。2026-08-22 追加）
  '/techops/home',      // 進行台本の案件選択
  '/techops/sheets',    // 進行台本の一覧
  '/techops/audio/:id', // 公開音声サポート — 現場のスマホで見る前提
  '/techops/schedules',      // スケジュール表の一覧
  '/techops/schedules/:id',  // スケジュール表の詳細（375px は縦積みカードに畳む）
  // 収録設定・配信設定の簡易入口（旧 `/techops/device-settings`）は2026-08-22 に廃止（`App.tsx` にルート無し）
  '/techops/recording/:ownerKey', // 収録設定（PC表＋スマホは下シートに畳む）
  '/techops/streaming/:ownerKey', // 配信設定（同上）
  '/techops/rental/:ownerKey', // レンタル機材検索（カード一覧。スマホは1列）（2026-08-22 追加）
  '/techops/rental/:ownerKey/list', // レンタル機材検索・予約リスト（同上）
  '/techops/rental/:ownerKey/mail/:company', // レンタル機材検索・依頼メール作成（同上）
  '/techops/live/:ownerKey', // 計時・視聴者・ダッシュボード（本番中に会場・ロビーから確認する場面がある。移植元の client-live 版もスマホで開いていた）
  '/techops/live/:ownerKey/timers', // 計時・視聴者・タイマー管理（同上）
  '/techops/live/:ownerKey/settings', // 計時・視聴者・番組設定（移植元の client-live 版もスマホで開いていた。縦一列のフォーム）
  '/techops/projects/:id', // 制作のジャーニー（案件の入口）。カード縦積みで375pxでも読める
  '/techops/docs/:id',     // 制作のジャーニー（資料単体の入口）。同上
  '/techops/programs/:id', // 制作のジャーニー（番組＝マニュアルの入口）。2026-08-22 追加・同上
];
