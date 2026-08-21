/**
 * 制作資料 — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭を参照。
 *
 * ⚠️ **このアプリは v4 の共通シェル・`client-v4/pcOnly.tsx` の実際のゲート
 * （`<PcOnlyGate>`）にはまだ載せ替えていない**（凍結解除はこの段では
 * `apps.ts` の `frozen` と検査体系の移行だけ。見た目の作り直しは別段）。
 * ここでは `scripts/check-mobile-declared.mjs` が読む**宣言だけ**を置く
 * （新しく作った画面 `/qsheet/home` が「決めずに縦へ畳んだだけ」で
 * 取り残されるのを防ぐのが目的）。
 *
 * - **編集（`/qsheet/editor/:id`）は PC 専用**（`docs/design/v4/mobile.md` の
 *   `spNotOnPhone` に「Qシートの編集」と明記されている）
 * - **本番3画面（進行・ランダウン・プロンプター）も PC/据え置き端末専用**。
 *   OBS のブラウザソースや配信卓に固定して使う運用画面であり、
 *   持ち替えて使う想定ではないため
 * - **公開音声サポート（`/qsheet/audio/:id`）はスマホで開く**（現場のスタッフや
 *   出演者が手元のスマホで見る前提の画面）
 * - **トップ（`/qsheet/home`）・一覧（`/qsheet/sheets`）はスマホで開く**
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

const SHEETS = { label: '進行台本の一覧を開く', to: '/qsheet/sheets' };

export const QSHEET_PC_ONLY: PcOnlyEntry[] = [
  {
    path: '/qsheet/editor/:id',
    what: '進行台本の編集',
    why: '構成・キュー・立ち位置図をまとめて組む画面で、列とパネルが多く狭い幅では組めません。',
    instead: SHEETS,
  },
  {
    path: '/qsheet/onair/:id',
    what: '本番・進行',
    why: '配信卓・OBS のブラウザソースに固定して使う運用画面です。',
    instead: SHEETS,
  },
  {
    path: '/qsheet/rundown/:id',
    what: '本番・ランダウン',
    why: '配信卓に固定して使う運用画面です。',
    instead: SHEETS,
  },
  {
    path: '/qsheet/prompter/:id',
    what: '本番・プロンプター',
    why: '大きな画面に固定して読み上げる運用画面です。',
    instead: SHEETS,
  },
  {
    path: '/qsheet/settings/schedule-templates',
    what: 'スケジュール表のひな形の編集',
    why: '列・項目の組み合わせを一度に見ながら組む画面で、狭い幅では組めません。',
    instead: { label: 'スケジュール表の一覧を開く', to: '/qsheet/schedules' },
  },
];

/**
 * **スマホで触る／読む画面。** ここと `QSHEET_PC_ONLY` のどちらにも入っていない
 * ルートがあると `npm run lint` が止まります。
 */
export const QSHEET_MOBILE_OK: string[] = [
  '/qsheet/home',      // トップ（案件を選ぶ）
  '/qsheet/sheets',    // 進行台本の一覧
  '/qsheet/audio/:id', // 公開音声サポート — 現場のスマホで見る前提
  '/qsheet/schedules',      // スケジュール表の一覧
  '/qsheet/schedules/:id',  // スケジュール表の詳細（375px は縦積みカードに畳む）
];
