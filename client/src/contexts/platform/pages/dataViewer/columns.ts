/**
 * データビューア — **列の見せ方**（日本語名・ID列・金額列・1マスの文字）
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * どの表にも共通で出てくる列の日本語名と、「この列は ID か／金額か」の判定、
 * 1マスに出す文字の作り方だけ。**金額はここで文字列にしない** —
 * 描く側が shared の `<Money>` で描く（v4 の決めごと「¥と数字は別要素」）。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `DataViewerPage.tsx` が 400 行（1ファイルの上限）を大きく超えていたため、
 * **表の定義 / 列の見せ方 / 画面**に分けた（`tables.ts` と対）。
 */

export const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  name: '名前',
  email: 'メール',
  role: '権限',
  short_name: '略称',
  notes: 'メモ',
  address: '住所',
  vendor_type: '種別',
  invoice_registration_number: 'インボイス番号',
  phone: '電話',
  role_title: '役職',
  specialties: '専門分野',
  sort_order: '表示順',
  category_id: 'カテゴリID',
  sub_label: '補足',
  unit_price: '単価',
  calc_type: '計算タイプ',
  seq_name: '採番名',
  prefix: 'プレフィックス',
  year_month: '年月',
  counter: 'カウンター',
  opp_code: 'OPPコード',
  title: '案件名',
  customer_id: '顧客ID',
  project_type: '案件種類',
  stage: 'ステージ',
  expected_amount: '想定金額',
  expected_date: '想定日',
  project_id: '案件ID',
  assigned_to: '担当者',
  opportunity_id: 'ヨミID',
  date_start: '開始日',
  date_end: '終了日',
  label: 'ラベル',
  pricing_item_id: '料金項目ID',
  quantity: '数量',
  days: '日数',
  subtotal: '小計',
  description: '説明',
  gls_number: 'イベントコード',
  group_id: 'グループID',
  rehearsal_start: 'リハ開始',
  rehearsal_end: 'リハ終了',
  event_start: '本番開始',
  event_end: '本番終了',
  status: 'ステータス',
  broadcast_type: '番組種別',
  media_platform: '配信媒体',
  application_form: '申込書',
  episode_number: '話数番号',
  episode_code: 'エピソードコード',
  recording_date: '収録日',
  broadcast_date: '放送日',
  delivery_date: '納品日',
  order_date: '発注日',
  episode_count: '発注話数',
  start_episode: '開始話数',
  end_episode: '終了話数',
  invoice_date: '請求日',
  invoice_group_id: '請求グループID',
  episode_id: '話数ID',
  billing_key: '請求KEY',
  tax_category: '税区分',
  amount: '金額',
  recognition_date: '計上日',
  billing_date: '請求予定日',
  payment_due_date: '支払期日',
  vendor_id: '仕入先ID',
  settlement_method: '精算方法',
  settlement_number: '精算番号',
  external_ref_id: '外部参照ID',
  invoice_qualified: 'インボイス',
  inspection_date: '検収日',
  purchase_id: '仕入ID',
  allocated_amount: '按分額',
  vendor_name: '支払先',
  expense_type: '種別',
  amortize_start: '按分開始',
  amortize_end: '按分終了',
  source: '処理元',
  period_start: '期間開始',
  period_end: '期間終了',
  created_at: '作成日',
  updated_at: '更新日',
  created_by: '作成者',
  updated_by: '更新者',
  deleted_at: '削除日',
};

const ID_COLUMNS = ["id", "user_id", "customer_id", "vendor_id", "partner_id", "project_id", "episode_id", "group_id", "opportunity_id", "invoice_group_id", "category_id", "item_id", "order_id", "revenue_id", "purchase_id", "allocation_id", "simulation_id", "created_by", "updated_by"];
const MONEY_COLUMNS = ["amount", "unit_price", "total_amount", "subtotal", "tax_amount", "gross_profit", "price", "cost", "budget", "revenue_amount", "purchase_amount"];

export function isIdColumn(col: string): boolean {
  return ID_COLUMNS.includes(col) || col.endsWith("_id");
}

export function isMoneyColumn(col: string): boolean {
  return MONEY_COLUMNS.includes(col) || col.endsWith("_amount") || col.endsWith("_price");
}

export function formatCell(col: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);

  if (isIdColumn(col)) {
    return str.length > 8 ? str.substring(0, 8) : str;
  }

  // 金額列はここで文字列にせず、描画側が shared の <Money> で描く (¥と数字を別要素にする)

  return str;
}
