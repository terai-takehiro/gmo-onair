export interface MaintenanceRecord {
  id: string;
  eq_code: string;
  equipment_name: string;
  /** 付属品 (子機材) の記録なら、その親。親が無い機材では null */
  parent_id: string | null;
  parent_eq_code: string | null;
  parent_name: string | null;
  record_type: string;
  title: string;
  description: string | null;
  vendor_name: string | null;
  repair_cost: number | null;
  status: string;
  reported_at: string | null;
  result: string | null;
  started_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
}
