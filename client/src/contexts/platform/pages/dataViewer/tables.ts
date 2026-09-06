/**
 * データビューア — **表そのものの定義**（どの表がどのアプリのものか・日本語名）
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * 左のレールに出す表の一覧（アプリ別のグループ分け）と、表の日本語名だけ。
 * 画面の状態も通信も持たない**ただの表**なので、画面から切り離してある。
 * 新しいテーブルを足したときは `TABLE_LABELS` と `TABLE_GROUPS` の両方に書く
 * （書き忘れても「その他」に出るので消えはしないが、日本語名が出ない）。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `DataViewerPage.tsx` が 400 行（このリポジトリの1ファイルの上限）を大きく
 * 超えており、その半分近くがこの対応表だった。1か所直すのに 880 行読む形に
 * なっていたので、**表の定義 / 列の見せ方 / 画面**に分けた。
 */
import type { ComponentType } from 'react';
import { Briefcase, FileSpreadsheet, Wrench, Radio, Tv, Users as UsersIcon } from 'lucide-react';

export interface TableInfo {
  name: string;
  count: number;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const TABLE_LABELS: Record<string, string> = {
  // 案件管理
  projects: '案件',
  customers: '顧客',
  vendors: '仕入先',
  companies: '会社',
  partners: 'パートナー(個人)',
  revenues: '売上',
  revenue_items: '売上明細',
  revenue_allocations: '売上按分',
  purchases: '仕入',
  purchase_allocations: '仕入按分',
  project_groups: '費用按分グループ',
  project_group_members: '費用按分メンバー',
  sga_expenses: '販管費',
  pricing_categories: '料金カテゴリ',
  pricing_items: '料金項目',
  episodes: 'エピソード',
  episode_orders: 'エピソード発注',
  invoice_groups: '請求グループ',
  invoice_group_episodes: '請求グループ↔エピソード',
  studio_locations: 'スタジオ拠点',
  studio_rooms: 'スタジオ部屋',
  studio_bookings: 'スタジオ予約',
  studio_booking_rooms: 'スタジオ予約↔部屋',
  lost_reason_categories: '失注理由マスタ',
  simulations: 'シミュレーション',
  sales_targets: '売上目標',
  activity_logs: '営業活動記録',

  // Qシート
  qsheet_documents: 'Qシート',
  qsheet_stage_templates: 'Qシートテンプレート',

  // 機材管理
  equipment_items: '機材',
  equipment_categories: '機材カテゴリ',
  equipment_branches: '機材所属拠点',
  equipment_locations: '機材保管場所',
  equipment_manufacturers: '機材メーカー',
  equipment_colors: '機材カラー',
  equipment_rack_types: 'ラック種別',
  rack_blank_panels: 'ラックブランクパネル',
  equipment_accessories: '機材付属品',
  equipment_custom_columns: '機材カスタム列定義',
  equipment_custom_values: '機材カスタム列値',
  equipment_id_sequences: '機材ID採番',
  equipment_lendings: '機材貸出',
  equipment_rental_categories: 'レンタルカテゴリ',
  inventory_checks: '棚卸',
  inventory_check_items: '棚卸明細',
  maintenance_records: 'メンテナンス記録',

  // ライブ運用
  liveops_programs: 'ライブ番組',
  liveops_settings: 'ライブ設定',
  liveops_snapshots: 'ライブスナップショット',
  liveops_timers: 'ライブタイマー',
  // リアルタイムCG
  awards_events: 'イベント',
  awards_categories: 'カテゴリ',
  awards_entries: 'エントリ',
  awards_cue_state: 'CueState',

  // 共通・マスター
  users: 'ユーザー',
  user_permissions: 'ユーザー権限',
  sequences: '採番管理',
  login_attempts: 'ログイン試行',
  verification_codes: '検証コード(SMS等)',
};

export interface TableGroup {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  tables: string[];
}

/**
 * テーブルをアプリ別にグルーピング (v2.7.14+)
 * 同じテーブルが複数グループに属することはない (アプリ単位で物理分離)
 */
export const TABLE_GROUPS: TableGroup[] = [
  {
    id: 'sales',
    label: '案件管理',
    icon: Briefcase,
    tables: [
      'projects', 'customers', 'vendors', 'companies', 'partners',
      'revenues', 'revenue_items', 'revenue_allocations',
      'purchases', 'purchase_allocations',
      'project_groups', 'project_group_members',
      'sga_expenses',
      'pricing_categories', 'pricing_items',
      'episodes', 'episode_orders',
      'invoice_groups', 'invoice_group_episodes',
      'studio_locations', 'studio_rooms', 'studio_bookings', 'studio_booking_rooms',
      'lost_reason_categories',
      'simulations', 'sales_targets',
      'activity_logs',
    ],
  },
  {
    id: 'qsheet',
    label: 'Qシート',
    icon: FileSpreadsheet,
    tables: ['qsheet_documents', 'qsheet_stage_templates'],
  },
  {
    id: 'equipment',
    label: '機材管理',
    icon: Wrench,
    tables: [
      'equipment_items', 'equipment_categories',
      'equipment_branches', 'equipment_locations',
      'equipment_manufacturers', 'equipment_colors',
      'equipment_rack_types', 'rack_blank_panels',
      'equipment_accessories',
      'equipment_custom_columns', 'equipment_custom_values',
      'equipment_id_sequences',
      'equipment_lendings', 'equipment_rental_categories',
      'inventory_checks', 'inventory_check_items',
      'maintenance_records',
    ],
  },
  {
    id: 'liveops',
    label: 'ライブ運用',
    icon: Radio,
    tables: ['liveops_programs', 'liveops_settings', 'liveops_snapshots', 'liveops_timers'],
  },
  {
    id: 'awards',
    label: 'リアルタイムCG',
    icon: Tv,
    tables: ['awards_events', 'awards_categories', 'awards_entries', 'awards_cue_state'],
  },
  {
    id: 'common',
    label: '共通・マスター',
    icon: UsersIcon,
    tables: ['users', 'user_permissions', 'sequences', 'login_attempts', 'verification_codes'],
  },
];

export const KNOWN_GROUPED_TABLES = new Set(TABLE_GROUPS.flatMap(g => g.tables));
