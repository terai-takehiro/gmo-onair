/**
 * 機材の編集ダイアログ ── カスタム列（自分で作る列）
 *
 * PC の表はカスタム列のセルを1個ずつクリックしてその場で書ける
 * （`EquipmentCells.tsx` の `customCells`）。スマホには**その「表」自体が無い**
 * （768px 未満は `EquipmentCards` のカードに切り替わる）ので、代わりにこの
 * 編集ダイアログの中にまとめて出す（監査 2026-08-20 要対応3「カスタム列が
 * スマホでは読み取り専用」への対応）。
 *
 * **書き込みは表と同じ経路** (`PUT /equipment/custom-values/:columnId/:equipmentId`
 * ＝ `useCustomValues.write`)。この項目だけ、ダイアログの「直す」ボタンを待たずに
 * 1つずつすぐ保存する — PC の表のセル編集と同じ体験にそろえた（1つのダイアログの中に
 * 「押すとすぐ保存される欄」と「『直す』を押して初めて保存される欄」が混ざるが、
 * 送る口が違う以上どちらかに寄せると片方が嘘になる）。
 *
 * **新規登録では出さない**（呼び出し側で `mode.kind === 'edit'` のときだけ渡す）。
 * カスタム値は既存の `equipment_id` に紐づくため、まだ存在しない機材には書き込めない。
 * 登録した直後に「直す」から入れば良い。
 */
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import type { CustomColumn } from '@/components/CustomColumnDialog';

function CustomField({ col, value, onCommit }: {
  col: CustomColumn;
  value: string;
  onCommit: (value: string) => void;
}) {
  // サーバー値が届いたら追随するが、打っている途中は自分の値を保つ
  // （`useCustomValues` が書き込み中のセルをサーバー値で上書きしないのと同じ理由）
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);

  if (col.col_type === 'checkbox') {
    const checked = local === 'true' || local === '1';
    return (
      <label className="flex min-h-tap cursor-pointer items-center gap-2">
        <EnhancedCheckbox
          checked={checked}
          onCheckedChange={(v) => { const next = v ? 'true' : 'false'; setLocal(next); onCommit(next); }}
          aria-label={col.name}
        />
        <span className="text-sub">{col.name}</span>
      </label>
    );
  }
  return (
    <div className="space-y-1">
      <Label>{col.name}</Label>
      <Input
        type={col.col_type === 'number' ? 'number' : 'text'}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onCommit(local); }}
      />
    </div>
  );
}

export function EquipmentCustomFields({ itemId, columns, values, onChange }: {
  itemId: string;
  columns: CustomColumn[];
  /** この機材ぶんの値 (列id → 値)。無い列は空欄扱い */
  values: Record<string, string>;
  onChange: (equipmentId: string, columnId: string, value: string) => void;
}) {
  if (columns.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-cardtitle">カスタム項目</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {columns.map((col) => (
          <CustomField
            key={col.id}
            col={col}
            value={values[col.id] ?? ''}
            onCommit={(v) => onChange(itemId, col.id, v)}
          />
        ))}
      </div>
    </div>
  );
}
