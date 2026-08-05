/**
 * 機材管理の左メニュー — **中身は今までと1項目も変えていない**。
 *
 * 旧 `Sidebar.tsx` の `navItems` からの逐語コピーです。並べ替え・改名・削除を
 * していません。情報設計 (v4 では8画面に整理する) は Phase 4 で相談します。
 *
 * ── `to` が `/equipment/...` で始まる理由 ──────────────────────
 *
 * このアプリはルーターの `basename` を持たず、Vite の `base: '/equipment/'` だけで
 * 動いています (日常業務は `basename="/daily"` を持つので `/tasks` と書ける)。
 * **共通シェルは接頭辞を知りません** — この差はアプリごとの `nav.ts` に閉じ込めます。
 */
import {
  BarChart3,
  Package,
  Cable,
  Plug,
  Layers,
  ClipboardList,
  Settings,
  Wrench,
  ClipboardCheck,
  QrCode,
  Server,
  MapPin,
  Building2,
  Palette,
  Menu,
} from 'lucide-react';
import type { ShellMobileTab, ShellNavSection } from '@gmo-onair/shared/src/client/shell';

export const EQUIPMENT_NAV: ShellNavSection[] = [
  {
    items: [
      // `end: true` が要る。付け忘れると**全ページでダッシュボードが光る**
      { label: 'ダッシュボード', to: '/equipment', icon: BarChart3, end: true },
      { label: '機材一覧', to: '/equipment/items', icon: Package },
      { label: 'ケーブル管理', to: '/equipment/cables', icon: Cable },
      { label: 'コネクタ管理', to: '/equipment/connectors', icon: Plug },
      { label: '貸出機材一覧', to: '/equipment/model-groups', icon: Layers },
      { label: '貸出管理', to: '/equipment/lendings', icon: ClipboardList },
      { label: '貸出機材設定', to: '/equipment/rental-settings', icon: Settings },
      { label: 'メンテナンス', to: '/equipment/maintenance', icon: Wrench },
      { label: '棚卸し', to: '/equipment/inventory', icon: ClipboardCheck },
      { label: 'QRスキャン', to: '/equipment/scan', icon: QrCode },
      { label: 'ラック実装', to: '/equipment/racks', icon: Server },
      { label: '保管場所管理', to: '/equipment/locations', icon: MapPin },
      { label: 'メーカー管理', to: '/equipment/manufacturers', icon: Building2 },
      { label: '機材色', to: '/equipment/colors', icon: Palette },
    ],
  },
];

/**
 * スマホ下端のタブ。v4 の決めごとは ホーム / やること / 検索 の3つですが、
 * 機材管理にはまだ「検索」の画面がありません (QRスキャンは別物)。
 * 無い画面のタブを置くと押しても何も起きないので、いまはメニューを開くタブです。
 */
export const EQUIPMENT_MOBILE_TABS: ShellMobileTab[] = [
  { label: 'ホーム', to: '/equipment', icon: BarChart3, end: true },
  { label: 'やること', to: '/equipment/lendings', icon: ClipboardList },
  { label: 'メニュー', icon: Menu, action: 'menu' },
];
