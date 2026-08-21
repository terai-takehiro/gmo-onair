/**
 * shared/src/constants/statuses.ts — ステータス定義の単一情報源
 *
 * 各アプリの page / component から独立して定義されていたステータス
 * (label / variant / color) を一元化する。
 *
 * 使い方:
 *   import { PROJECT_STAGE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
 *   const stage = PROJECT_STAGE.a_won;          // { label: 'A 受注', variant: 'success' }
 *   statusOf(PROJECT_STAGE, 'a_won').label      // 'A 受注'
 *   statusOf(PROJECT_STAGE, 'unknown').label    // 'unknown' (フォールバック)
 *
 *   import { Badge } from '@gmo-onair/shared/src/client/ui/badge';
 *   <Badge variant={stage.variant}>{stage.label}</Badge>
 */

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'outline';

export interface StatusSpec {
  /** 画面表示ラベル (日本語) */
  label: string;
  /** Badge component の variant */
  variant: BadgeVariant;
  /** 補足説明 (ツールチップ等で使用) */
  description?: string;
  /** recharts 等のチャート系で使う固定色 (必要な場合のみ) */
  chartColor?: string;
}

export type StatusDomain<K extends string = string> = Record<K, StatusSpec>;

/** ドメインとキーから StatusSpec を安全に取り出す (未知キーは label のみフォールバック) */
export function statusOf<K extends string>(domain: StatusDomain<K>, key: string): StatusSpec {
  return domain[key as K] ?? { label: key, variant: 'secondary' };
}

// ══════════════════════════════════════════════════════════════════
// 案件 stage — 統合プロジェクトライフサイクル (Phase A)
// neta → d_hold → c_proposal → b_verbal → a_won → s_completed / e_lost
// ══════════════════════════════════════════════════════════════════
export const PROJECT_STAGE = {
  neta:         { label: 'ネタ',       variant: 'secondary',   description: '初期接触・未見積' },
  d_hold:       { label: 'D 仮押さえ', variant: 'info',        description: '仮押さえ段階' },
  c_proposal:   { label: 'C 見積提案', variant: 'default',     description: '見積・提案中' },
  b_verbal:     { label: 'B 口頭決定', variant: 'warning',     description: '口頭での受注合意' },
  a_won:        { label: 'A 受注済',   variant: 'success',     description: '正式受注・実行中' },
  s_completed:  { label: 'S 完了',     variant: 'secondary',   description: '納品完了' },
  e_lost:       { label: 'E 失注',     variant: 'destructive', description: '失注' },
} as const satisfies StatusDomain;

export type ProjectStageKey = keyof typeof PROJECT_STAGE;

// ══════════════════════════════════════════════════════════════════
// 機材メンテナンス
// ══════════════════════════════════════════════════════════════════
export const MAINTENANCE_STATUS = {
  reported:    { label: '報告済',    variant: 'warning' },
  in_progress: { label: '対応中',    variant: 'destructive' },
  completed:   { label: '完了',      variant: 'success' },
  cancelled:   { label: 'キャンセル', variant: 'secondary' },
} as const satisfies StatusDomain;

export const MAINTENANCE_TYPE = {
  breakdown:   { label: '故障',       variant: 'destructive' },
  repair:      { label: '修理',       variant: 'warning' },
  maintenance: { label: 'メンテナンス', variant: 'info' },
  inspection:  { label: '点検',       variant: 'secondary' },
} as const satisfies StatusDomain;

// ══════════════════════════════════════════════════════════════════
// 機材状態 (equipment_items.status)
// ══════════════════════════════════════════════════════════════════
export const EQUIPMENT_STATUS = {
  active:    { label: '稼働中', variant: 'success' },
  in_repair: { label: '修理中', variant: 'warning' },
  retired:   { label: '引退',   variant: 'secondary' },
  disposed:  { label: '廃棄',   variant: 'destructive' },
  lost:      { label: '紛失',   variant: 'destructive' },
  inactive:  { label: '停止',   variant: 'secondary' },
} as const satisfies StatusDomain;

// ══════════════════════════════════════════════════════════════════
// 機材コンディション (equipment_items.condition)
// ══════════════════════════════════════════════════════════════════
export const EQUIPMENT_CONDITION = {
  excellent: { label: '優良', variant: 'success' },
  good:      { label: '良好', variant: 'default' },
  fair:      { label: '可',   variant: 'warning' },
  poor:      { label: '不良', variant: 'destructive' },
} as const satisfies StatusDomain;

// ══════════════════════════════════════════════════════════════════
// 棚卸し (inventory_sessions.status)
// ══════════════════════════════════════════════════════════════════
export const INVENTORY_STATUS = {
  draft:       { label: '下書き', variant: 'secondary' },
  in_progress: { label: '実施中', variant: 'warning' },
  completed:   { label: '完了',   variant: 'success' },
} as const satisfies StatusDomain;

// ══════════════════════════════════════════════════════════════════
// インタラクティブイベント
// ══════════════════════════════════════════════════════════════════
export const INTERACTIVE_EVENT_STATUS = {
  draft:     { label: '下書き',     variant: 'secondary' },
  rehearsal: { label: 'リハーサル', variant: 'warning' },
  live:      { label: 'LIVE',       variant: 'default' },
  ended:     { label: '終了',       variant: 'secondary' },
  archived:  { label: 'アーカイブ', variant: 'outline' },
} as const satisfies StatusDomain;

// ══════════════════════════════════════════════════════════════════
// ダッシュボードアラート種別
// ══════════════════════════════════════════════════════════════════
export const ALERT_TYPE = {
  application_form: { label: '申込書未提出',         variant: 'destructive' },
  upcoming_event:   { label: 'イベント直前',         variant: 'warning' },
  warning:          { label: '警告',                 variant: 'warning' },
  danger:           { label: '緊急',                 variant: 'destructive' },
  info:             { label: '情報',                 variant: 'info' },
} as const satisfies StatusDomain;

/** アラート優先度 (小さいほど緊急) — ソート用 */
export const ALERT_PRIORITY: Record<keyof typeof ALERT_TYPE, number> = {
  danger: 0,
  application_form: 1,
  upcoming_event: 2,
  warning: 3,
  info: 4,
};
