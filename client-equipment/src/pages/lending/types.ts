export interface Lending {
  id: string;
  equipment_name: string;
  unit_number: number | null;
  borrower_name: string;
  purpose: string | null;
  status: string;
  /** 出庫予定日 (migration 168)。`status='planned'` のときだけ意味を持つ */
  planned_out_date?: string | null;
  lent_at: string | null;
  due_date: string | null;
  returned_at: string | null;
  project_name: string | null;
  gls_number: string | null;
}
