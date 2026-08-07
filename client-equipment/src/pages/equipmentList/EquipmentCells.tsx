/**
 * 機材台帳の1行ぶんのセル (標準の列 ＋ 自分で作った列)
 *
 * 表そのものは `<table>` のままにしてあります。この一覧だけが
 * **列の出し入れ・その場編集・親子の入れ子**の3つを同時に持っており、
 * 行の部品 (`<Row>`) に載せ替えるにはその3つを作り直す必要があるためです
 * (v4 の第1段階＝分割まで。載せ替えは第2段階)。
 */
import type { ReactNode } from 'react';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { CONDITION_LABELS } from '@/lib/constants';
import { SectionBadge } from './badges';
import { COL_DEFS, type ColKey, type EquipmentRecord } from './types';

export interface CellContext {
  py: string;
  editMode: boolean;
  edits: Record<string, Record<string, string>>;
  onEditChange: (id: string, field: string, value: string) => void;
  onEditCommit: (id: string) => void;
  /** 「貸出可」を押せるか（`equipment` の owner だけ）。無ければ印だけ出す */
  canSetRental: boolean;
  onToggleRental: (item: EquipmentRecord) => void;
  /** いま切り替え中の機材 id（二度押しを止める） */
  rentalBusyId: string | null;
}

function InlineInput({ item, field, ctx, type, className }: {
  item: EquipmentRecord; field: string; ctx: CellContext; type?: string; className?: string;
}) {
  const current = ctx.edits[item.id]?.[field] ?? ((item[field] as string | number | null) ?? '').toString();
  return (
    <input
      type={type || 'text'}
      value={current}
      onChange={(e) => ctx.onEditChange(item.id, field, e.target.value)}
      onBlur={() => ctx.onEditCommit(item.id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={field}
      className={`w-full border-b border-primary-border bg-transparent text-sub focus:border-primary focus:outline-none ${className ?? ''}`}
    />
  );
}

/**
 * 「貸出可」のセル。
 *
 * 子機材は**親の設定を受け継ぐ**（サーバーの `effective_rental_listed`）ので、
 * 子の行では切り替えさせず「親から」と出す。切り替えられるように見せると、
 * 押しても親が優先されて何も変わりません。
 */
function RentalCell({ item, ctx }: { item: EquipmentRecord; ctx: CellContext }) {
  const inherited = !!item.parent_id && item.parent_rental_listed != null;
  const on = inherited ? !!item.effective_rental_listed : !!item.is_rental_listed;

  if (inherited) {
    return (
      <span className="text-sub-sm text-muted-foreground" title="親の機材の設定を受け継いでいます">
        {on ? '貸出可' : '常設'}（親から）
      </span>
    );
  }
  if (!ctx.canSetRental) {
    return (
      <span
        className={`text-sub-sm ${on ? 'font-bold text-primary' : 'text-fg-disabled'}`}
        title="変えるには機材管理の「所有者」権限が要ります"
      >
        {on ? '貸出可' : '常設'}
      </span>
    );
  }
  return (
    <label className="flex min-h-tap cursor-pointer items-center gap-1.5 lg:min-h-[32px]" onClick={(e) => e.stopPropagation()}>
      <EnhancedCheckbox
        checked={on}
        disabled={ctx.rentalBusyId === item.id}
        onCheckedChange={() => ctx.onToggleRental(item)}
        aria-label={`${item.name} を貸出可にする`}
      />
      <span className={`text-sub-sm ${on ? 'font-bold text-primary' : 'text-fg-disabled'}`}>
        {on ? '貸出可' : '常設'}
      </span>
    </label>
  );
}

/** 標準の列のセル。**出す列と並びは利用者ごとの設定に従う** */
export function standardCells(
  item: EquipmentRecord,
  colOrder: ColKey[],
  visibleCols: Set<ColKey>,
  ctx: CellContext,
  nameSuffix?: ReactNode,
): ReactNode[] {
  return colOrder.filter((k) => visibleCols.has(k)).map((key) => {
    const col = COL_DEFS.find((c) => c.key === key);
    if (!col) return null;
    const pad = `px-3 ${ctx.py}`;
    switch (col.key) {
      case 'eq_code':
        return <td key={key} className={`${pad} font-number whitespace-nowrap text-sub-sm text-muted-foreground`}>{item.eq_code}</td>;
      case 'equipment_type':
        return (
          <td key={key} className={`${pad} whitespace-nowrap`}>
            <SectionBadge typeCode={item.equipment_type_code} section={item.equipment_section} />
          </td>
        );
      case 'location': {
        const text = item.location_name || item.location_detail || '–';
        return (
          <td key={key} className={`${pad} text-sub-sm text-muted-foreground`}>
            <div className="max-w-[128px] truncate" title={text}>{text}</div>
          </td>
        );
      }
      case 'name':
        return (
          <td key={key} className={`${pad} text-list`}>
            {ctx.editMode
              ? <InlineInput item={item} field="name" ctx={ctx} />
              : <div className="line-clamp-2 max-w-[160px] break-words">{item.name}{nameSuffix}</div>}
          </td>
        );
      case 'manufacturer':
        return <td key={key} className={`${pad} whitespace-nowrap text-sub-sm text-muted-foreground`}>{item.manufacturer_name || '–'}</td>;
      case 'model_number':
        return (
          <td key={key} className={`${pad} text-sub-sm text-muted-foreground`}>
            {ctx.editMode
              ? <InlineInput item={item} field="model_number" ctx={ctx} />
              : <div className="line-clamp-2 max-w-[128px] break-all">{item.model_number || '–'}</div>}
          </td>
        );
      case 'serial_number':
        return (
          <td key={key} className={`${pad} whitespace-nowrap text-sub-sm text-muted-foreground`}>
            {ctx.editMode ? <InlineInput item={item} field="serial_number" ctx={ctx} /> : (item.serial_number || '–')}
          </td>
        );
      case 'unit_number':
        return (
          <td key={key} className={`${pad} font-number whitespace-nowrap text-right text-sub-sm text-muted-foreground`}>
            {ctx.editMode
              ? <InlineInput item={item} field="unit_number" ctx={ctx} type="number" className="text-right" />
              : (item.unit_number ?? '–')}
          </td>
        );
      case 'condition':
        return <td key={key} className={`${pad} whitespace-nowrap text-sub-sm text-muted-foreground`}>{CONDITION_LABELS[item.condition ?? ''] || '–'}</td>;
      case 'fixed_asset_code':
        return (
          <td key={key} className={`${pad} whitespace-nowrap text-sub-sm text-muted-foreground`}>
            {ctx.editMode ? <InlineInput item={item} field="fixed_asset_code" ctx={ctx} /> : (item.fixed_asset_code || '–')}
          </td>
        );
      case 'notes':
        return (
          <td key={key} className={`${pad} text-sub-sm text-muted-foreground`}>
            {ctx.editMode
              ? <InlineInput item={item} field="notes" ctx={ctx} />
              : <div className="line-clamp-2 max-w-[200px] break-words">{item.notes || '–'}</div>}
          </td>
        );
      case 'rental':
        return <td key={key} className={`${pad} whitespace-nowrap`}><RentalCell item={item} ctx={ctx} /></td>;
      default: return null;
    }
  });
}

export interface CustomCellContext {
  py: string;
  columns: CustomColumn[];
  visible: Set<string>;
  values: Record<string, Record<string, string>>;
  editing: { equipmentId: string; columnId: string } | null;
  setEditing: (v: { equipmentId: string; columnId: string } | null) => void;
  write: (equipmentId: string, columnId: string, value: string) => void;
}

/** 自分で作った列のセル。押すとその場で書ける */
export function customCells(item: EquipmentRecord, ctx: CustomCellContext): ReactNode[] {
  return ctx.columns.filter((c) => ctx.visible.has(c.id)).map((col) => {
    const val = ctx.values[item.id]?.[col.id] ?? '';
    const isEditing = ctx.editing?.equipmentId === item.id && ctx.editing?.columnId === col.id;
    const pad = `px-3 ${ctx.py}`;

    if (col.col_type === 'checkbox') {
      const checked = val === 'true' || val === '1';
      return (
        <td key={col.id} className={`${pad} text-center`} onClick={(e) => e.stopPropagation()}>
          <EnhancedCheckbox
            checked={checked}
            onCheckedChange={(v) => ctx.write(item.id, col.id, v ? 'true' : 'false')}
          />
        </td>
      );
    }
    if (isEditing) {
      return (
        <td key={col.id} className={pad} onClick={(e) => e.stopPropagation()}>
          <input
            type={col.col_type === 'number' ? 'number' : 'text'}
            className="w-full min-w-[72px] border-b border-primary-border bg-transparent text-sub focus:border-primary focus:outline-none"
            defaultValue={val}
            aria-label={col.name}
            autoFocus
            onBlur={(e) => { ctx.setEditing(null); if (e.target.value !== val) ctx.write(item.id, col.id, e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') ctx.setEditing(null);
            }}
          />
        </td>
      );
    }
    return (
      <td
        key={col.id}
        className={`${pad} max-w-[128px] cursor-text truncate text-sub-sm text-muted-foreground hover:bg-muted`}
        title={val || '(押すと書けます)'}
        onClick={(e) => { e.stopPropagation(); ctx.setEditing({ equipmentId: item.id, columnId: col.id }); }}
      >
        {val || <span className="text-fg-disabled">—</span>}
      </td>
    );
  });
}
