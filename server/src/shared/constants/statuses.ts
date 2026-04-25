/**
 * server/src/shared/constants/statuses.ts — サーバー側ステータス文字列の単一情報源
 *
 * クライアント側は shared/src/constants/statuses.ts (ラベル・色含む) を持つが、
 * サーバーはステータス文字列そのものだけ必要なのでシンプル化。
 * 値 (string literal) はクライアント側の各 StatusDomain のキーと同じに保つこと。
 *
 * 使い方:
 *   import { EQUIPMENT_LENDING_STATUS } from '../../../shared/constants/statuses';
 *   if (status === EQUIPMENT_LENDING_STATUS.LENT) { ... }
 *   const allowed = Object.values(INTERACTIVE_EVENT_STATUS);
 *
 * ──────────────────────────────────────────────────────────────────
 * DB CHECK 制約との対応 (Phase 3 v2.6.7 で確認済み — drift 無し):
 *   EQUIPMENT_STATUS         → migrations/007_equipment.sql:42
 *   INVENTORY_STATUS         → migrations/007_equipment.sql:69
 *   MAINTENANCE_STATUS       → migrations/007_equipment.sql:103
 *   EQUIPMENT_LENDING_STATUS → migrations/007_equipment.sql:122
 *   QSHEET_STATUS            → migrations/012_qsheet_schema.sql:19
 *   INTERACTIVE_EVENT_STATUS → migrations/013_interactive_schema.sql:8
 *                            → migrations/024_rehearsal_status.sql:4 (rehearsal 追加)
 *   TECHSHEET_STATUS         → migrations/014_techsheet_schema.sql:12
 *   INTERACTIVE_QUESTION_STATUS → migrations/021_interactive_quiz.sql:11
 *                              → migrations/023_interactive_complete.sql:46
 *   PROJECT_STAGE            → projects テーブル (CHECK 無し、コード側で enforce)
 *
 * ここの const と migration の値が乖離した場合: 必ず両方を同時に更新する。
 * ──────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════════════════════
// 機材
// ══════════════════════════════════════════════════════════════════
export const EQUIPMENT_STATUS = {
  ACTIVE: 'active',
  IN_REPAIR: 'in_repair',
  RETIRED: 'retired',
  DISPOSED: 'disposed',
  LOST: 'lost',
  INACTIVE: 'inactive',
} as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUS)[keyof typeof EQUIPMENT_STATUS];

export const EQUIPMENT_LENDING_STATUS = {
  LENT: 'lent',
  RETURNED: 'returned',
  OVERDUE: 'overdue',
  LOST: 'lost',
} as const;
export type EquipmentLendingStatus =
  (typeof EQUIPMENT_LENDING_STATUS)[keyof typeof EQUIPMENT_LENDING_STATUS];

export const MAINTENANCE_STATUS = {
  REPORTED: 'reported',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[keyof typeof MAINTENANCE_STATUS];

export const INVENTORY_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;
export type InventoryStatus = (typeof INVENTORY_STATUS)[keyof typeof INVENTORY_STATUS];

// ══════════════════════════════════════════════════════════════════
// インタラクティブ
// ══════════════════════════════════════════════════════════════════
export const INTERACTIVE_EVENT_STATUS = {
  DRAFT: 'draft',
  REHEARSAL: 'rehearsal',
  LIVE: 'live',
  ENDED: 'ended',
  ARCHIVED: 'archived',
} as const;
export type InteractiveEventStatus =
  (typeof INTERACTIVE_EVENT_STATUS)[keyof typeof INTERACTIVE_EVENT_STATUS];

export const INTERACTIVE_QUESTION_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
} as const;
export type InteractiveQuestionStatus =
  (typeof INTERACTIVE_QUESTION_STATUS)[keyof typeof INTERACTIVE_QUESTION_STATUS];

// ══════════════════════════════════════════════════════════════════
// Qシート
// ══════════════════════════════════════════════════════════════════
export const QSHEET_STATUS = {
  DRAFT: 'draft',
  REHEARSAL: 'rehearsal',
  ON_AIR: 'on_air',
  ARCHIVED: 'archived',
} as const;
export type QsheetStatus = (typeof QSHEET_STATUS)[keyof typeof QSHEET_STATUS];

// ══════════════════════════════════════════════════════════════════
// 技術資料 (TechSheet)
// ══════════════════════════════════════════════════════════════════
export const TECHSHEET_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  ARCHIVED: 'archived',
} as const;
export type TechsheetStatus = (typeof TECHSHEET_STATUS)[keyof typeof TECHSHEET_STATUS];

// ══════════════════════════════════════════════════════════════════
// 案件ライフサイクル (Phase A 統合)
// ══════════════════════════════════════════════════════════════════
export const PROJECT_STAGE = {
  NETA: 'neta',
  D_HOLD: 'd_hold',
  C_PROPOSAL: 'c_proposal',
  B_VERBAL: 'b_verbal',
  A_WON: 'a_won',
  S_COMPLETED: 's_completed',
  E_LOST: 'e_lost',
} as const;
export type ProjectStage = (typeof PROJECT_STAGE)[keyof typeof PROJECT_STAGE];
