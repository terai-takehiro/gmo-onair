/**
 * ② 機材台帳 ／ 機材 の型と列の定義 (v4)
 *
 * `EquipmentListPage.tsx` (2,017行) から切り出したものです。
 * **列の定義と保存する値は1つも変えていません** — 枠の入れ替えと中身の作り直しを
 * 同じ回でやると、どちらが原因で壊れたか切り分けられなくなります。
 */
import { SECTIONS, TYPE_CODES } from '@/lib/constants';

/**
 * サーバーから来る機材の行。
 *
 * **`any` を消して `unknown` の索引にはしていません。** この一覧はカスタム列
 * (利用者が作る列) を持ち、行に何が生えているかがサーバーの設定次第で変わります。
 * 型を狭めるなら列の定義から作る必要があり、それは別の仕事です。
 */
export interface EquipmentRecord {
  id: string;
  eq_code?: string;
  name: string;
  model_number?: string | null;
  unit_number?: number | null;
  serial_number?: string | null;
  equipment_type_code?: string | null;
  equipment_section?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  location_detail?: string | null;
  manufacturer_id?: string | null;
  manufacturer_name?: string | null;
  asset_class?: string | null;
  fixed_asset_code?: string | null;
  condition?: string | null;
  status?: string | null;
  notes?: string | null;
  parent_id?: string | null;
  parent_name?: string | null;
  children_count?: number | null;
  branch_code?: string | null;
  color_id?: string | null;
  purchased_at?: string | null;
  warranty_years?: number | null;
  depreciation_years?: number | null;
  rack_position?: number | null;
  rack_height?: number | null;
  rack_slot?: string | null;
  rack_side?: string | null;
  /** この機材そのものの「貸出可」 */
  is_rental_listed?: boolean | null;
  /** 親の「貸出可」。子は親を受け継ぐ（`effective_rental_listed`） */
  parent_rental_listed?: boolean | null;
  effective_rental_listed?: boolean | null;
  [key: string]: unknown;
}

export interface LocationRecord {
  id: string;
  name: string;
  location_detail?: string | null;
  is_rack?: boolean;
  rack_units?: number | null;
}

export interface NamedRecord { id: string; name: string }
export interface ColorRecord { id: string; name: string; color_hex: string }

/** 「映像設備」のように 種別 ＋ 区分 をつないだ表示 */
export const sectionDisplay = (typeCode: string | null | undefined, section: string | null | undefined) => {
  const t = TYPE_CODES.find((c) => c.code === typeCode)?.label || '';
  const s = SECTIONS.find((c) => c.value === section)?.label || '';
  return `${t}${s}`.trim() || '-';
};

export const COL_DEFS = [
  { key: 'eq_code', label: 'ID', sortKey: 'eq_code', default: true },
  { key: 'equipment_type', label: '種別', sortKey: 'equipment_type_code', default: true },
  { key: 'location', label: '設置場所', sortKey: 'location_name', default: true },
  { key: 'name', label: '商品名', sortKey: 'name', default: true },
  { key: 'manufacturer', label: 'メーカー', sortKey: 'manufacturer_name', default: false },
  { key: 'model_number', label: '型名', sortKey: 'model_number', default: true },
  { key: 'serial_number', label: 'シリアル', sortKey: 'serial_number', default: false },
  { key: 'unit_number', label: 'No', sortKey: 'unit_number', default: true },
  { key: 'condition', label: '状態', sortKey: 'condition', default: false },
  { key: 'fixed_asset_code', label: '資産コード', sortKey: 'fixed_asset_code', default: false },
  { key: 'notes', label: '備考', sortKey: 'notes', default: true },
  // **モックはこの切り替えを台帳の列に置いている**（「チェックはこの一覧から
  // その場で切り替えられます」）。書き込みには `equipment` の owner 権限が要るので、
  // 権限が無い人には**押せない印**として出す（列ごと消すと、なぜ貸出画面に
  // 出てこないのかが台帳から分からなくなる）
  { key: 'rental', label: '貸出可', sortKey: 'is_rental_listed', default: true },
] as const;

export type ColKey = (typeof COL_DEFS)[number]['key'];

export const PRINT_COLS = [
  { key: 'eq_code', label: 'ID' },
  { key: 'equipment_type', label: '種別' },
  { key: 'name', label: '商品名' },
  { key: 'manufacturer_name', label: 'メーカー' },
  { key: 'model_number', label: '型名' },
  { key: 'unit_number', label: 'No.' },
  { key: 'serial_number', label: 'serial' },
  { key: 'location', label: '設置場所' },
  { key: 'fixed_asset_code', label: '資産コード' },
  { key: 'purchased_at', label: '購入年月' },
  { key: 'warranty_years', label: '保証' },
  { key: 'notes', label: '備考' },
] as const;

export type EquipmentForm = typeof defaultForm;

export const defaultForm = {
  name: '', model_number: '', unit_number: '', serial_number: '',
  branch_code: 'GMO-IG', asset_class: 'fixed_asset', fixed_asset_code: '', depreciation_years: '',
  equipment_section: 'equipment', equipment_type_code: 'V', location_code: 'Y',
  manufacturer_id: '', purchased_at: '', warranty_years: '',
  location_id: '', status: 'active', condition: 'good', notes: '',
  parent_id: '',
  color_id: '',
  rack_position: '', rack_height: '1', rack_slot: 'full', rack_side: 'front',
};

/** 連続登録のときに次の1台へ引き継ぐ項目 (拠点・種別など「同じ棚に何台も入れる」もの) */
export const CARRY_OVER_KEYS = [
  'location_code', 'equipment_type_code', 'equipment_section',
  'branch_code', 'location_id', 'manufacturer_id', 'asset_class',
  'purchased_at', 'warranty_years', 'depreciation_years',
  'rack_side', 'color_id',
] as const;

export type BulkField =
  | 'branch_code' | 'asset_class' | 'equipment_section' | 'equipment_type_code' | 'location_id'
  | 'purchased_at' | 'warranty_years' | 'depreciation_years' | 'status' | 'notes' | 'name'
  | 'manufacturer_id' | 'model_number' | 'serial_number' | 'unit_number' | 'fixed_asset_code'
  | 'condition' | 'color_id' | 'location_detail' | 'rack_position' | 'rack_height'
  | 'rack_slot' | 'rack_side';

/** 機材 → 入力欄。`mode` が `copy` のとき**個体ごとの値だけ**を落とす */
export function toEquipmentForm(item: EquipmentRecord, mode: 'edit' | 'copy'): EquipmentForm {
  const perUnit = mode === 'copy';
  return {
    name: item.name || '',
    model_number: item.model_number || '',
    // No. と serial と資産コードは個体固有。写すときは空にする
    unit_number: perUnit ? '' : (item.unit_number?.toString() || ''),
    serial_number: perUnit ? '' : (item.serial_number || ''),
    fixed_asset_code: perUnit ? '' : (item.fixed_asset_code || ''),
    branch_code: item.branch_code || 'GMO-IG',
    asset_class: item.asset_class || 'fixed_asset',
    depreciation_years: item.depreciation_years?.toString() || '0',
    equipment_section: item.equipment_section || 'equipment',
    equipment_type_code: item.equipment_type_code || 'V',
    location_code: (item.location_code as string) || 'Y',
    manufacturer_id: item.manufacturer_id || '',
    purchased_at: item.purchased_at?.slice(0, 10) || '',
    warranty_years: item.warranty_years?.toString() || '0',
    location_id: item.location_id || '',
    status: item.status || 'active',
    condition: item.condition || 'good',
    notes: item.notes || '',
    parent_id: item.parent_id || '',
    color_id: item.color_id || '',
    // ラック位置も個体ごと
    rack_position: perUnit ? '' : (item.rack_position?.toString() || ''),
    rack_height: item.rack_height?.toString() || '1',
    rack_slot: item.rack_slot || 'full',
    rack_side: item.rack_side || 'front',
  };
}
