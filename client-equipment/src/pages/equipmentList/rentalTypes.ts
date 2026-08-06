/**
 * ② 機材台帳 ／ 貸出機材 の型 (旧 `ModelGroupPage.tsx` から切り出し)
 *
 * 貸出機材は**型番ごとにまとめた塊**で並びます (同じ機種が10台あっても1行)。
 * 開くと1台ずつの状態が出ます。
 */
export interface RentalChild {
  id: string;
  eq_code: string;
  name: string;
  unit_number: number | null;
  status: string;
}

export interface RentalUnit {
  id: string;
  eq_code: string;
  unit_number: number | null;
  serial_number: string | null;
  status: string;
  condition: string;
  location_name: string | null;
  location_detail: string | null;
  rental_display_name: string | null;
  children: RentalChild[];
}

export interface ModelGroup {
  name: string;
  model_number: string;
  manufacturer_name: string | null;
  equipment_type_code: string;
  rental_category_id: string | null;
  rental_category_name: string | null;
  rental_category_sort_order: number | null;
  rental_display_name: string | null;
  total_count: number;
  units: RentalUnit[];
}

export interface RentalCategory { id: string; name: string; sort_order: number }

export interface CategorySection {
  id: string | null;
  name: string;
  sort_order: number;
  groups: ModelGroup[];
}

export const groupKey = (g: ModelGroup) => `${g.name}::${g.model_number}::${g.equipment_type_code}`;

/** 状態の色。**引退・廃棄・紛失は「危ない」ではなく「もう使わない」**なので灰にする */
export const UNIT_STATUS_TONE: Record<string, string> = {
  active: 'bg-success-surface text-success border-transparent',
  in_repair: 'bg-warning-surface text-warning border-transparent',
  retired: 'bg-muted text-muted-foreground border-transparent',
  disposed: 'bg-muted text-muted-foreground border-transparent',
  lost: 'bg-destructive-surface text-destructive border-transparent',
};

export const UNIT_STATUS_LABELS: Record<string, string> = {
  active: '稼働中', in_repair: '修理中', retired: '休止', disposed: '廃棄', lost: '紛失',
};
