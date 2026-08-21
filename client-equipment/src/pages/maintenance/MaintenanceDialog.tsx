/**
 * メンテナンスの記録を足すダイアログ。
 *
 * 機材は数が多いので `SearchableSelect` (探せる選択) にしています。
 * 旧実装は素の `<Select>` で、2,000 台のリストから目で探す形でした。
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@gmo-onair/shared/src/client/ui/searchable-select';
import { MAINTENANCE_TYPE } from '@gmo-onair/shared/src/constants/statuses';

export interface MaintenanceForm {
  equipment_id: string;
  record_type: string;
  title: string;
  description: string;
  assigned_to: string;
  vendor_name: string;
  repair_cost: string;
}

const EMPTY: MaintenanceForm = {
  equipment_id: '', record_type: 'breakdown', title: '',
  description: '', assigned_to: '', vendor_name: '', repair_cost: '',
};

export function MaintenanceDialog({ open, items, saving, error, onClose, onSubmit }: {
  open: boolean;
  items: { id: string; eq_code: string; name: string }[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: MaintenanceForm) => void;
}) {
  const [form, setForm] = useState<MaintenanceForm>(EMPTY);
  useEffect(() => { if (open) setForm(EMPTY); }, [open]);

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="メンテナンスの記録"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => onSubmit(form)} disabled={!form.equipment_id || !form.title || saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            足す
          </Button>
        </FormDialogFooter>
      }
    >
      {error && (
        <p className="mb-3 rounded-control border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <Label>機材 *</Label>
          <SearchableSelect
            value={form.equipment_id}
            onChange={(v) => setForm((f) => ({ ...f, equipment_id: v }))}
            options={items.map((i) => ({ value: i.id, label: i.name, subLabel: i.eq_code }))}
            placeholder="ID・名前で探す"
          />
        </div>
        <div className="space-y-1">
          <Label>種類</Label>
          <Select value={form.record_type} onValueChange={(v) => setForm((f) => ({ ...f, record_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(MAINTENANCE_TYPE).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>内容 *</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="レンズのAF不良（修理見積待ち）"
          />
        </div>
        <div className="space-y-1">
          <Label>詳しい状況</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="中望遠でAFが迷う。作例あり"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>修理業者</Label>
            <Input value={form.vendor_name} onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>修理費用 (円)</Label>
            <Input
              type="number" min="0"
              value={form.repair_cost}
              onChange={(e) => setForm((f) => ({ ...f, repair_cost: e.target.value }))}
            />
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
