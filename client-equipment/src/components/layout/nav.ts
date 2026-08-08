/**
 * 機材管理の左メニュー — **v4 の情報設計に差し替え済み** (8画面)。
 *
 * 旧メニューは1つの塊に 14 項目が平らに並んでいました。中身は
 *
 *   機材一覧 / ケーブル管理 / コネクタ管理 / 貸出機材一覧  ← どれも「物の台帳」
 *   貸出管理 / 貸出機材設定                                ← 貸出
 *   保管場所管理 / メーカー管理 / 機材色                    ← 設定
 *
 * で、**毎日開く画面と月1回しか触らない設定が同じ高さ**に並んでいました。
 * さらに「貸出カテゴリ管理」(`/equipment/rental-categories`) は
 * **ルートはあるのにメニューから辿り着けません**でした。
 *
 * v4 は モックの `MENU` に合わせて **現場 / 貸出 / 設定** の3つの塊にします。
 * **畳んだ画面は全部いまの8画面のどこかのタブに入っている**ので、
 * 「そのほか (作り直し前)」の塊は作っていません (作り直していない画面が
 * 出てきたらここに畳みます)。
 *
 * ── `to` が `/equipment/...` で始まる理由 ──────────────────────
 *
 * このアプリはルーターの `basename` を持たず、Vite の `base: '/equipment/'` だけで
 * 動いています (日常業務は `basename="/daily"` を持つので `/tasks` と書ける)。
 * **共通シェルは接頭辞を知りません** — この差はアプリごとの `nav.ts` に閉じ込めます。
 */
import {
  ArrowRightLeft,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Layers,
  Package,
  QrCode,
  Search,
  Server,
  Settings,
  Wrench,
} from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';

export const EQUIPMENT_NAV: ShellNavSection[] = [
  {
    title: '現場',
    items: [
      // `end: true` が要る。付け忘れると**全ページでダッシュボードが光る**
      { label: 'ダッシュボード', to: '/equipment', icon: BarChart3, end: true },
      // ケーブル・コネクタ・貸出機材はこの中のタブ。**別項目にしない** —
      // 探しているものがどの台帳に入っているかを先に思い出す必要が出る
      { label: '機材台帳', to: '/equipment/items', icon: Package },
      { label: 'ラック図', to: '/equipment/racks', icon: Server },
      { label: 'メンテナンス', to: '/equipment/maintenance', icon: Wrench },
      { label: '棚卸し', to: '/equipment/inventory', icon: ClipboardCheck },
      { label: 'QRスキャン', to: '/equipment/scan', icon: QrCode },
    ],
  },
  {
    title: '貸出',
    items: [
      { label: '貸出・返却', to: '/equipment/lendings', icon: ArrowRightLeft },
      // 台帳のタブへ直接送る。貸出のときはこちらから入るほうが早い
      { label: '貸出対象の機材', to: '/equipment/items?view=lend', icon: Layers },
    ],
  },
  {
    title: '設定',
    items: [
      // 保管場所 / メーカー・色 / 貸出カテゴリ / 貸出の決めごと の4タブ
      { label: '設定', to: '/equipment/settings', icon: Settings },
    ],
  },
];

/**
 * スマホ下端のタブ。**v4 の決めごとどおり ホーム / やること / 探す**（M9）。
 *
 * 3つ目は長らく「メニューを開く」でした（検索の画面が無かったため）。
 * ですが**メニューは上辺バーの ☰ からも開けます** — 3枠しかないうちの1枠を
 * 二重の入口に使っていて、決めごとにある検索がどこにも無い状態でした。
 * `/equipment/search` を作って本来の形に戻しています
 * （QRスキャンはその画面の中にいちばん大きく置いてあります）。
 */
export const EQUIPMENT_MOBILE_TABS: ShellMobileTab[] = [
  { label: 'ホーム', to: '/equipment', icon: BarChart3, end: true },
  { label: 'やること', to: '/equipment/lendings', icon: ClipboardList },
  { label: '探す', to: '/equipment/search', icon: Search },
];
