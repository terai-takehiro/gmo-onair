/**
 * 機材管理 — **スマホでは開かない画面の一覧**（M2）
 *
 * 決め方と書き方は `client/src/pcOnlyScreens.ts` の冒頭に書いてあります。
 *
 * **このアプリは現場で開くもの**（棚卸し・QRスキャン・貸出・返却・機材を探す）が
 * 中心なので、PC 向きは「図を組む」「設定を触る」の2種類だけです。
 *
 * > **メンテナンスはスマホに残します**（ご判断）。現場で「これ壊れている」を
 * > その場で登録したい、が実際に起きるためです。
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

const ITEMS = { label: '機材台帳を開く', to: '/equipment/items' };

export const EQUIPMENT_PC_ONLY: PcOnlyEntry[] = [
  {
    path: '/equipment/racks',
    what: 'ラック図',
    why: '1U ずつの升目に機材を並べる図で、この幅だと1本ぶんの高さも入りません。',
    instead: ITEMS,
  },
  {
    path: '/equipment/settings',
    what: '機材管理の設定',
    why: '保管場所・メーカー・色・貸出の決めごとをまとめて触る画面です。',
    instead: ITEMS,
    // **スマホのメニューには出さない。** 現場で開く画面ではありません
    hidden: true,
  },
  // **旧 URL（`/equipment/locations` など8本）はここに書かない。** どれも
  // `/equipment/settings?tab=…` や台帳のタブへの転送で、画面ではありません
];

/**
 * **スマホの左メニューから落とすルート**（`hidden: true` の分）。
 * シェルに渡すと、スマホのときだけ項目が消えます。**ルートは生きています。**
 */
export const EQUIPMENT_MOBILE_HIDDEN = EQUIPMENT_PC_ONLY.filter((e) => e.hidden).map((e) => e.path);

/**
 * **スマホで触る／読む画面。** ここと `EQUIPMENT_PC_ONLY` のどちらにも入っていない
 * ルートがあると `npm run lint` が止まります。
 */
export const EQUIPMENT_MOBILE_OK: string[] = [
  '/equipment',             // ダッシュボード（読む）
  '/equipment/items',       // 機材台帳 — カード表示がある（EquipmentCards）
  '/equipment/items/:id',   // 機材の詳細
  '/equipment/lendings',    // 貸出・返却 — **現場で使う**
  '/equipment/inventory',   // 棚卸し — スマホでは現場のスキャンになる
  '/equipment/scan',        // QRスキャン
  '/equipment/search',      // 探す — **スマホの下タブ3つ目**（M9）
  '/equipment/maintenance', // メンテナンス — **現場で「壊れている」を登録する**（ご判断）
];
