// 全データバックアップ — system_admin専用
// 主要テーブルを日本語ヘッダーのxlsxマルチシートとして出力
import { Router, Request, Response, NextFunction } from 'express';
import { queryAll } from '../../../shared/db/connection';
import { requireAuth, requireRole } from '../../../shared/middleware/auth';
import { buildExcelWorkbook, excelResponse, SheetSpec } from '../../../shared/utils/excel';

const router = Router();
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

interface SheetDef {
  name: string;
  query: string;
  columns: { key: string; header: string; width?: number }[];
}

const SHEETS: SheetDef[] = [
  // ============ ユーザー ============
  {
    name: 'ユーザー',
    query: `SELECT id, name, email, role, created_at FROM users WHERE deleted_at IS NULL ORDER BY name`,
    columns: [
      { key: 'id', header: 'ID', width: 36 },
      { key: 'name', header: '氏名', width: 20 },
      { key: 'email', header: 'Email', width: 28 },
      { key: 'role', header: 'ロール', width: 14 },
      { key: 'created_at', header: '登録日', width: 20 },
    ],
  },
  {
    name: 'ユーザー権限',
    query: `SELECT u.name as user_name, u.email, p.module, p.access_level
            FROM user_permissions p JOIN users u ON u.id = p.user_id
            WHERE u.deleted_at IS NULL ORDER BY u.name, p.module`,
    columns: [
      { key: 'user_name', header: 'ユーザー名', width: 20 },
      { key: 'email', header: 'Email', width: 28 },
      { key: 'module', header: 'モジュール', width: 16 },
      { key: 'access_level', header: 'アクセスレベル', width: 14 },
    ],
  },
  // ============ 案件管理 ============
  {
    // Phase 3-3-4（2026-08-18）: customers ではなく companies（is_customer = TRUE）
    // から読む（customers.routes.ts の一覧・検索と同じ理由。基本情報は companies に
    // 同期済みで、companies.is_customer が唯一のロール判定になっている）
    name: '顧客',
    query: `SELECT name, short_name, contact_name, email, phone, address, notes
            FROM companies WHERE is_customer = TRUE AND deleted_at IS NULL ORDER BY name`,
    columns: [
      { key: 'name', header: '会社名', width: 28 },
      { key: 'short_name', header: '略称', width: 14 },
      { key: 'contact_name', header: '担当者', width: 16 },
      { key: 'email', header: 'Email', width: 24 },
      { key: 'phone', header: '電話', width: 16 },
      { key: 'address', header: '住所', width: 40 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  {
    name: '仕入先',
    // Phase 3-3-9（`vendors` テーブル削除）以降、companies（is_vendor = TRUE）
    // から読む（顧客シートと同じ理由。上記コメント参照）
    query: `SELECT name, contact_name, email, phone, address, vendor_type, invoice_registration_number, notes
            FROM companies WHERE is_vendor = TRUE AND deleted_at IS NULL ORDER BY name`,
    columns: [
      { key: 'name', header: '会社名', width: 28 },
      { key: 'contact_name', header: '担当者', width: 16 },
      { key: 'email', header: 'Email', width: 24 },
      { key: 'phone', header: '電話', width: 16 },
      { key: 'address', header: '住所', width: 40 },
      { key: 'vendor_type', header: '区分', width: 12 },
      { key: 'invoice_registration_number', header: '適格請求書登録番号', width: 24 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  {
    name: 'パートナー',
    query: `SELECT name, email, phone, role_title, specialties, notes
            FROM partners WHERE deleted_at IS NULL ORDER BY name`,
    columns: [
      { key: 'name', header: '氏名', width: 20 },
      { key: 'email', header: 'Email', width: 24 },
      { key: 'phone', header: '電話', width: 16 },
      { key: 'role_title', header: '役職', width: 16 },
      { key: 'specialties', header: '専門分野', width: 30 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  {
    name: '案件',
    query: `SELECT p.gls_number, p.code, p.name, c.name as customer_name, p.stage,
                   p.project_type, p.expected_amount, p.event_start, p.event_end,
                   u.name as assigned_to_name, p.lost_reason, p.created_at
            FROM projects p
            LEFT JOIN companies c ON c.id = p.customer_id
            LEFT JOIN users u ON u.id = p.assigned_to
            WHERE p.deleted_at IS NULL
            ORDER BY p.created_at DESC`,
    columns: [
      { key: 'gls_number', header: 'GLS番号', width: 14 },
      { key: 'code', header: 'コード', width: 14 },
      { key: 'name', header: '案件名', width: 36 },
      { key: 'customer_name', header: '顧客', width: 24 },
      { key: 'stage', header: 'ステージ', width: 12 },
      { key: 'project_type', header: '案件種別', width: 14 },
      { key: 'expected_amount', header: '予定金額', width: 14 },
      { key: 'event_start', header: '開始日', width: 12 },
      { key: 'event_end', header: '終了日', width: 12 },
      { key: 'assigned_to_name', header: '担当', width: 14 },
      { key: 'lost_reason', header: '失注理由', width: 14 },
      { key: 'created_at', header: '作成日', width: 20 },
    ],
  },
  {
    name: 'エピソード',
    query: `SELECT p.gls_number, e.episode_code, e.episode_number,
                   e.recording_date, e.broadcast_date, e.delivery_date, e.notes
            FROM episodes e JOIN projects p ON p.id = e.project_id
            WHERE e.deleted_at IS NULL ORDER BY p.gls_number, e.episode_number`,
    columns: [
      { key: 'gls_number', header: 'GLS番号', width: 14 },
      { key: 'episode_code', header: 'エピソードコード', width: 18 },
      { key: 'episode_number', header: '話数', width: 8 },
      { key: 'recording_date', header: '収録日', width: 12 },
      { key: 'broadcast_date', header: '放送日', width: 12 },
      { key: 'delivery_date', header: '納品日', width: 12 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  // ============ 予算 ============
  {
    name: '売上',
    query: `SELECT r.billing_key, p.gls_number, p.name as project_name, c.name as customer_name,
                   r.amount, r.tax_category, r.recognition_date, r.billing_date, r.payment_due_date,
                   r.subtitle, r.status, r.notes
            FROM revenues r
            LEFT JOIN projects p ON p.id = r.project_id
            LEFT JOIN companies c ON c.id = r.customer_id
            WHERE r.deleted_at IS NULL ORDER BY r.recognition_date DESC`,
    columns: [
      { key: 'billing_key', header: '請求キー', width: 16 },
      { key: 'gls_number', header: 'GLS番号', width: 14 },
      { key: 'project_name', header: '案件名', width: 30 },
      { key: 'customer_name', header: '顧客', width: 20 },
      { key: 'amount', header: '金額', width: 14 },
      { key: 'tax_category', header: '税区分', width: 10 },
      { key: 'recognition_date', header: '計上日', width: 12 },
      { key: 'billing_date', header: '請求日', width: 12 },
      { key: 'payment_due_date', header: '支払期日', width: 12 },
      { key: 'subtitle', header: '内訳', width: 24 },
      { key: 'status', header: 'ステータス', width: 12 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  {
    name: '仕入',
    // Phase 3-3-9（`vendors` テーブル削除）以降、仕入先名は companies から直接読む
    // （`vendors` が無くなったので削除済み仕入先へのフォールバックという概念自体が
    // 不要になった。purchases.routes.ts と同じ理由）
    query: `SELECT pu.billing_key, p.gls_number, p.name as project_name, vco.name as vendor_name,
                   pu.amount, pu.tax_category, pu.description, pu.recognition_date,
                   pu.payment_due_date, pu.notes
            FROM purchases pu
            LEFT JOIN projects p ON p.id = pu.project_id
            LEFT JOIN companies vco ON vco.id = pu.vendor_id
            WHERE pu.deleted_at IS NULL ORDER BY pu.recognition_date DESC`,
    columns: [
      { key: 'billing_key', header: '請求キー', width: 16 },
      { key: 'gls_number', header: 'GLS番号', width: 14 },
      { key: 'project_name', header: '案件名', width: 30 },
      { key: 'vendor_name', header: '仕入先', width: 20 },
      { key: 'amount', header: '金額', width: 14 },
      { key: 'tax_category', header: '税区分', width: 10 },
      { key: 'description', header: '摘要', width: 30 },
      { key: 'recognition_date', header: '計上日', width: 12 },
      { key: 'payment_due_date', header: '支払期日', width: 12 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  {
    name: '販管費',
    query: `SELECT s.billing_key, s.vendor_name, s.description, s.amount,
                   s.expense_type, s.tax_category, s.recognition_date, s.payment_due_date, s.notes
            FROM sga_expenses s WHERE s.deleted_at IS NULL ORDER BY s.recognition_date DESC`,
    columns: [
      { key: 'billing_key', header: '請求キー', width: 16 },
      { key: 'vendor_name', header: 'ベンダー名', width: 20 },
      { key: 'description', header: '摘要', width: 30 },
      { key: 'amount', header: '金額', width: 14 },
      { key: 'expense_type', header: '費用区分', width: 12 },
      { key: 'tax_category', header: '税区分', width: 10 },
      { key: 'recognition_date', header: '計上日', width: 12 },
      { key: 'payment_due_date', header: '支払期日', width: 12 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  // ============ 機材 ============
  {
    name: '機材',
    query: `SELECT ei.eq_code, ei.name, ei.equipment_type_code, ei.equipment_section,
                   em.name as manufacturer, ei.model_number, ei.serial_number, ei.unit_number,
                   ei.branch_code, ei.asset_class, ei.fixed_asset_code,
                   ei.depreciation_years, ei.purchased_at, ei.warranty_years,
                   ei.status, ei.condition, el.name as location_name, ei.location_detail,
                   ei.notes
            FROM equipment_items ei
            LEFT JOIN equipment_manufacturers em ON em.id = ei.manufacturer_id
            LEFT JOIN equipment_locations el ON el.id = ei.location_id
            WHERE ei.deleted_at IS NULL
            ORDER BY ei.equipment_type_code, ei.name, ei.unit_number`,
    columns: [
      { key: 'eq_code', header: 'ID', width: 16 },
      { key: 'name', header: '機材名', width: 30 },
      { key: 'equipment_type_code', header: '種別', width: 8 },
      { key: 'equipment_section', header: '設備/貸出', width: 10 },
      { key: 'manufacturer', header: 'メーカー', width: 16 },
      { key: 'model_number', header: '型番', width: 16 },
      { key: 'serial_number', header: 'シリアル番号', width: 18 },
      { key: 'unit_number', header: 'No', width: 6 },
      { key: 'branch_code', header: '所管', width: 14 },
      { key: 'asset_class', header: '資産管理', width: 10 },
      { key: 'fixed_asset_code', header: '資産コード', width: 16 },
      { key: 'depreciation_years', header: '償却', width: 6 },
      { key: 'purchased_at', header: '購入年月', width: 12 },
      { key: 'warranty_years', header: '保証期間', width: 8 },
      { key: 'status', header: 'ステータス', width: 12 },
      { key: 'condition', header: 'コンディション', width: 12 },
      { key: 'location_name', header: '保管場所', width: 18 },
      { key: 'location_detail', header: '保管場所詳細', width: 18 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  {
    name: '機材貸出',
    query: `SELECT el.lent_at, ei.eq_code, ei.name as equipment_name,
                   p.gls_number, el.borrower_name, el.purpose,
                   el.due_date, el.returned_at, el.status, el.notes
            FROM equipment_lendings el
            JOIN equipment_items ei ON ei.id = el.equipment_id
            LEFT JOIN projects p ON p.id = el.project_id
            ORDER BY el.lent_at DESC`,
    columns: [
      { key: 'lent_at', header: '貸出日', width: 16 },
      { key: 'eq_code', header: 'ID', width: 16 },
      { key: 'equipment_name', header: '機材名', width: 28 },
      { key: 'gls_number', header: 'GLS番号', width: 14 },
      { key: 'borrower_name', header: '借用者', width: 16 },
      { key: 'purpose', header: '目的', width: 24 },
      { key: 'due_date', header: '返却期限', width: 12 },
      { key: 'returned_at', header: '返却日', width: 16 },
      { key: 'status', header: 'ステータス', width: 12 },
      { key: 'notes', header: '備考', width: 30 },
    ],
  },
  // ============ スタジオ ============
  {
    name: 'スタジオ予約',
    query: `SELECT b.title, b.booking_type, p.gls_number, b.start_time, b.end_time,
                   b.all_day, b.location_note, b.notes, u.name as created_by_name
            FROM studio_bookings b
            LEFT JOIN projects p ON p.id = b.project_id
            LEFT JOIN users u ON u.id = b.created_by
            WHERE b.deleted_at IS NULL ORDER BY b.start_time DESC`,
    columns: [
      { key: 'title', header: 'タイトル', width: 36 },
      { key: 'booking_type', header: 'タイプ', width: 12 },
      { key: 'gls_number', header: 'GLS番号', width: 14 },
      { key: 'start_time', header: '開始', width: 18 },
      { key: 'end_time', header: '終了', width: 18 },
      { key: 'all_day', header: '終日', width: 6 },
      { key: 'location_note', header: 'ロケ地メモ', width: 24 },
      { key: 'notes', header: '備考', width: 30 },
      { key: 'created_by_name', header: '作成者', width: 14 },
    ],
  },
];

router.get('/admin/backup.xlsx', requireAuth, requireRole('system_admin'), wrap(async (_req, res) => {
  const sheets: SheetSpec[] = [];
  for (const def of SHEETS) {
    try {
      const rows = await queryAll(def.query) as Record<string, unknown>[];
      sheets.push({ name: def.name, columns: def.columns, rows });
    } catch (err) {
      // テーブルが存在しない等のエラーは1行のエラーシートに置き換え
      sheets.push({
        name: def.name,
        columns: [{ key: 'error', header: 'エラー', width: 60 }],
        rows: [{ error: String(err instanceof Error ? err.message : err) }],
      });
    }
  }

  const buf = await buildExcelWorkbook(sheets);
  const today = new Date().toISOString().slice(0, 10);
  excelResponse(res, `gmo-onair_backup_${today}.xlsx`, buf);
}));

export default router;
