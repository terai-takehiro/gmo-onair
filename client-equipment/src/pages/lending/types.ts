/** 貸出ダイアログの「持ち出せる機材」1件 (`/equipment/items?is_rental_listed=true`) */
export interface LendableItem {
  id: string;
  name: string;
  eq_code: string;
  unit_number: number | null;
  equipment_type_code: string;
  location_name: string | null;
  parent_id: string | null;
  current_lending?: unknown;
}

export interface Lending {
  id: string;
  equipment_name: string;
  unit_number: number | null;
  borrower_name: string;
  purpose: string | null;
  status: string;
  /** 持ち出し予定日 (migration 168)。`status='planned'` のときだけ意味を持つ */
  planned_out_date?: string | null;
  lent_at: string | null;
  due_date: string | null;
  returned_at: string | null;
  project_name: string | null;
  gls_number: string | null;
}
