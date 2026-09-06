/**
 * 機材台帳の「まとめて編集」の状態と送る値の組み立て。
 *
 * `ItemsPanel.tsx` から切り出したものです。**送る値の作り方は変えていません**
 * （数値の列は空を `null` に、場所・メーカー・色の「なし」も `null` に変える）。
 */
import { useState } from 'react';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { BulkField } from './types';

const NUMERIC_FIELDS: BulkField[] = ['warranty_years', 'depreciation_years', 'unit_number', 'rack_position', 'rack_height'];
const NULLABLE_SELECT_FIELDS: BulkField[] = ['location_id', 'manufacturer_id', 'color_id'];

export function useBulkEdit(clearSelection: () => void) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<BulkField>('branch_code');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => { setError(null); setOpen(true); };

  const buildPayload = (ids: string[]) => {
    if (ids.length === 0) return null;
    let v: unknown = value;
    if (NUMERIC_FIELDS.includes(field)) v = value === '' ? null : Number(value);
    if (NULLABLE_SELECT_FIELDS.includes(field) && value === 'none') v = null;
    return { ids, fields: { [field]: v } };
  };

  const onDone = (count: number) => {
    setOpen(false);
    setError(null);
    clearSelection();
    setValue('');
    notifySuccess(`${count} 件を保存しました`);
  };

  return { open, field, value, error, setOpen, setField, setValue, setError, openDialog, buildPayload, onDone };
}
