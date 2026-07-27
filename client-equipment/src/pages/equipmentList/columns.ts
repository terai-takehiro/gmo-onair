// 機材台帳の列の定義と、種別の表示名 — v2.9.292 で EquipmentListPage.tsx から切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import { TYPE_CODES, SECTIONS } from '@/lib/constants';

export const sectionDisplay = (typeCode: string | null, section: string | null) => {
  const t = TYPE_CODES.find((c) => c.code === typeCode)?.label || "";
  const s = SECTIONS.find((c) => c.value === section)?.label || "";
  return `${t}${s}`.trim() || "-";
};


export const PRINT_COLS = [
  { key: 'eq_code',           label: 'ID'        },
  { key: 'equipment_type',    label: '種別'       },
  { key: 'name',              label: '商品名'     },
  { key: 'manufacturer_name', label: 'メーカー'   },
  { key: 'model_number',      label: '型名'       },
  { key: 'unit_number',       label: 'No.'        },
  { key: 'serial_number',     label: 'serial'     },
  { key: 'location',          label: '設置場所'   },
  { key: 'fixed_asset_code',  label: '資産コード' },
  { key: 'purchased_at',      label: '購入年月'   },
  { key: 'warranty_years',    label: '保証'       },
  { key: 'notes',             label: '備考'       },
] as const;