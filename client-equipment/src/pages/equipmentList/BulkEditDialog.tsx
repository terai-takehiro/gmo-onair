/**
 * 選んだ機材をまとめて編集する (manager 以上)。
 *
 * 旧実装は 23 個の `if` を JSX に並べていました。**送る値は変えず**、
 * 「どの項目がどんな入力になるか」を1つの表にしています
 * (並べて書くと、項目を足したときにどれか1つだけ入力欄が付かない)。
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ASSET_CLASS_OPTIONS, CONDITION_LABELS, CONDITION_OPTIONS, RACK_SLOT_OPTIONS,
  SECTIONS, STATUS_OPTIONS, TYPE_CODES,
} from '@/lib/constants';
import type { BulkField, ColorRecord, LocationRecord, NamedRecord } from './types';

type Opt = { value: string; label: string };

/** 項目 → 入力のしかた。`opts` があれば選択、無ければ `input` の型で入力欄 */
const FIELDS: { key: BulkField; label: string; input: 'text' | 'number' | 'date'; opts?: 'manufacturer' | 'location' | 'color' | Opt[]; placeholder?: string }[] = [
  { key: 'name', label: '商品名', input: 'text', placeholder: '商品名' },
  { key: 'manufacturer_id', label: 'メーカー', input: 'text', opts: 'manufacturer' },
  { key: 'model_number', label: '型名', input: 'text', placeholder: '型名' },
  { key: 'serial_number', label: '製造番号', input: 'text', placeholder: '製造番号' },
  { key: 'unit_number', label: 'No. (個体番号)', input: 'number', placeholder: '0' },
  { key: 'fixed_asset_code', label: '資産コード', input: 'text', placeholder: '資産コード' },
  { key: 'branch_code', label: '持ち主の会社', input: 'text', placeholder: 'GMO-IG' },
  { key: 'asset_class', label: '資産の区分', input: 'text', opts: ASSET_CLASS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  { key: 'equipment_section', label: '設備／貸出', input: 'text', opts: SECTIONS.map((s) => ({ value: s.value, label: s.label })) },
  { key: 'equipment_type_code', label: '種別', input: 'text', opts: TYPE_CODES.map((t) => ({ value: t.code, label: `${t.code} - ${t.label}` })) },
  // 表示は `CONDITION_LABELS` (新品同様／良好／普通／要注意)。旧実装と同じ言葉にしてある —
  // `CONDITION_OPTIONS.label` は返却の記録で使う別の言い方 (優良／良好／可／不良)
  { key: 'condition', label: 'コンディション', input: 'text', opts: CONDITION_OPTIONS.map((o) => ({ value: o.value, label: CONDITION_LABELS[o.value] ?? o.label })) },
  { key: 'color_id', label: '機材の色', input: 'text', opts: 'color' },
  { key: 'location_id', label: '保管場所', input: 'text', opts: 'location' },
  { key: 'location_detail', label: '場所の詳細', input: 'text', placeholder: '場所の詳細' },
  { key: 'purchased_at', label: '購入年月', input: 'date' },
  { key: 'warranty_years', label: '保証期間 (年)', input: 'number', placeholder: '0' },
  { key: 'depreciation_years', label: '償却年数', input: 'number', placeholder: '0' },
  { key: 'status', label: '状態', input: 'text', opts: STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  { key: 'rack_position', label: 'U位置 (下端)', input: 'number', placeholder: '0' },
  { key: 'rack_height', label: '高さ (U)', input: 'number', placeholder: '1' },
  { key: 'rack_slot', label: '横位置', input: 'text', opts: RACK_SLOT_OPTIONS.map((o) => ({ value: o.value, label: o.label })) },
  { key: 'rack_side', label: '前面／背面', input: 'text', opts: [{ value: 'front', label: '前面' }, { value: 'back', label: '背面' }] },
  { key: 'notes', label: '備考', input: 'text' },
];

/** 空のまま適用してよい項目 (「消す」ができる項目) */
const CLEARABLE: BulkField[] = ['notes', 'location_detail', 'serial_number', 'fixed_asset_code'];

export function BulkEditDialog({
  open, count, field, value, saving, error,
  manufacturers, locations, colors,
  onFieldChange, onValueChange, onClose, onSubmit,
}: {
  open: boolean;
  count: number;
  field: BulkField;
  value: string;
  saving: boolean;
  error: string | null;
  manufacturers: NamedRecord[];
  locations: LocationRecord[];
  colors: ColorRecord[];
  onFieldChange: (f: BulkField) => void;
  onValueChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const def = FIELDS.find((f) => f.key === field) ?? FIELDS[0];

  const options: Opt[] | null =
    def.opts === 'manufacturer' ? [{ value: 'none', label: '(なし)' }, ...manufacturers.map((m) => ({ value: m.id, label: m.name }))]
      : def.opts === 'location' ? [{ value: 'none', label: '(なし)' }, ...locations.map((l) => ({ value: l.id, label: l.name }))]
        : def.opts === 'color' ? [{ value: 'none', label: 'なし (種別の色)' }, ...colors.map((c) => ({ value: c.id, label: c.name }))]
          : Array.isArray(def.opts) ? def.opts : null;

  const canApply = count > 0 && (value !== '' || CLEARABLE.includes(field));

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={`まとめて編集 (${count} 件)`}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={onSubmit} disabled={saving || !canApply}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {count} 件に当てる
          </Button>
        </FormDialogFooter>
      }
    >
      {error && (
        <p className="rounded-control border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>編集する項目</Label>
          <Select value={field} onValueChange={(v) => { onFieldChange(v as BulkField); onValueChange(''); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELDS.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>新しい値</Label>
          {options ? (
            <Select value={value} onValueChange={onValueChange}>
              <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={def.input}
              min={def.input === 'number' ? (field === 'rack_height' ? 1 : 0) : undefined}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder={def.placeholder}
            />
          )}
          {CLEARABLE.includes(field) && (
            <p className="text-note text-muted-foreground">空のまま押すと、選んだ機材のこの項目を消します。</p>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
