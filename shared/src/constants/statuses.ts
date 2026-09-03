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
// neta → d_hold → c_proposal → b_verbal → a_won → r_delivered → s_completed / e_lost
// r_delivered = 「実施済（財務処理中）」。a_won と s_completed の間に挟む中間ステージで、
// 受注は確定済み・実施も終わったが、請求・入金など財務処理がまだの状態を表す
// (2026-09 追加。BOX の 98_終了案件フォルダ移動は s_completed のときだけ発火する — 財務処理が
// 終わっていないのに完了フォルダに入ってしまう問題を避けるため、意図的に r_delivered では発火させない)
//
// ⚠️ **ここがステージラベルの唯一の正** (docs/core-redesign-plan.md §3-7)。
// かつて client の型 / 一覧バッジ / MCP の4系統に分裂し、同じ neta が
// 「ネタ」「E 問合せ」、同じ s_completed が「S 完了」「完了」「S 案件終了」と
// 画面によって違う名前で出ていた。決定: neta =「ネタ」・s_completed =「S 完了」。
//  - `client/src/types/stages.ts` はここを import して組み立てる
//  - `server/src/contexts/mcp/tools/projects.tools.ts` の STAGE_LABELS は
//    server が shared を import できない (rootDir) ため値を写している —
//    `shared/tests/stageLabels.test.ts` がズレたら落とす
//  - 一覧バッジの和文短縮 (`projectList/stages.ts`) だけは表示上の例外
// ══════════════════════════════════════════════════════════════════
export const PROJECT_STAGE = {
  neta:         { label: 'ネタ',       variant: 'secondary',   description: '初期接触・未見積' },
  d_hold:       { label: 'D 仮押さえ', variant: 'info',        description: '仮押さえ段階' },
  c_proposal:   { label: 'C 見積提案', variant: 'default',     description: '見積・提案中' },
  b_verbal:     { label: 'B 口頭決定', variant: 'warning',     description: '口頭での受注合意' },
  a_won:        { label: 'A 受注済',   variant: 'success',     description: '正式受注・実行中' },
  r_delivered:  { label: 'R 実施済',   variant: 'warning',     description: '実施済み・財務処理中（請求・入金待ち）' },
  s_completed:  { label: 'S 完了',     variant: 'secondary',   description: '納品完了' },
  e_lost:       { label: 'E 失注',     variant: 'destructive', description: '失注' },
} as const satisfies StatusDomain;

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

