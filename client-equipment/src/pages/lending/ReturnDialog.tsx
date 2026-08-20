/**
 * ⑦ 貸出・返却 ／ 返却を記録する
 *
 * 戻ってきたときの状態を残します (壊れて戻ってきたことに後から気づけるように)。
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CONDITION_OPTIONS } from '@/lib/constants';

export function ReturnDialog({ open, name, saving, error, onClose, onSubmit }: {
  open: boolean;
  name: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (p: { condition_in: string; notes: string }) => void;
}) {
  const [condition, setCondition] = useState('good');
  const [notes, setNotes] = useState('');

  useEffect(() => { if (open) { setCondition('good'); setNotes(''); } }, [open]);

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="返却を記録する"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={() => onSubmit({ condition_in: condition, notes })} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            返却を記録
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
        <p className="rounded-control bg-muted px-3 py-2 text-sub">{name}</p>
        <div className="space-y-1">
          <Label>戻ってきたときの状態</Label>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONDITION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>気づいたこと</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ケーブルに折れあり など" />
        </div>
      </div>
    </FormDialog>
  );
}
