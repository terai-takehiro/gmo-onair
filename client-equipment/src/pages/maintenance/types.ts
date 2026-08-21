export interface MaintenanceRecord {
  id: string;
  eq_code: string;
  equipment_name: string;
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
