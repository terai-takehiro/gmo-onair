/**
 * 機材台帳の1行ぶんの列 (標準の列 ＋ 自分で作った列)
 *
 * ── `<td>` から `<RowSlot>` に載せ替えました ────────────────
 *
 * 前は素の `<table>` でした。`<table>` の列幅は**中身が決める**ので、
 * 絞り込みを変えるたびに列が動き、同じ「種別」の列が画面によって違う幅に
 * なります。7段の固定幅（`COL_W`）に寄せると、**出す列を変えても
 * 残った列は同じ位置のまま**です。
 *
 * この一覧が持っている3つ（列の出し入れ・その場編集・親子の入れ子）は
 * そのまま残しています:
 *
 *   ・列の出し入れ … `colOrder` / `visibleCols` で並べる順序も保つ
 *   ・その場編集   … `editMode` のとき入力欄に変わる（中身は1文字も変えていない）
 *   ・親子の入れ子 … 行の頭（`LEAD_W`）に段差を出す。列は親子で同じ位置
 */
import type { ReactNode } from 'react';
import { RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { CONDITION_LABELS } from '@/lib/constants';
import { SectionBadge } from './badges';
import { COL_DEFS, COL_W, CUSTOM_COL_W, type ColKey, type EquipmentRecord } from './types';

export interface CellContext {
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

/** 素の文字。**列の幅で切る**（折り返すと行の高さがそろわない） */
function Text({ children }: { children: ReactNode }) {
  return <span className="text-sub-sm truncate text-muted-foreground">{children}</span>;
}

/**
 * 「貸出可」の列。
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
      <span className="text-sub-sm truncate text-muted-foreground" title="親の機材の設定を受け継いでいます">
        {on ? '貸出可' : '常設'}（親から）
      </span>
    );
  }
  if (!ctx.canSetRental) {
    return (
      <span
        className={`text-sub-sm truncate ${on ? 'font-bold text-primary' : 'text-muted-foreground'}`}
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
      {/* 「常設」は押せない印ではなく**この台帳の中心概念**（読ませる状態）なので
          薄い文字にしない。「貸出可」との差は太さと色で十分付いている */}
      <span className={`text-sub-sm ${on ? 'font-bold text-primary' : 'text-muted-foreground'}`}>
        {on ? '貸出可' : '常設'}
      </span>
    </label>
  );
}

/**
 * 標準の列。**出す列と並びは利用者ごとの設定に従う。**
 *
 * `name`（商品名）だけ `RowMain`（伸びる列）。**行に1つだけ**が `Row` の決まりで、
 * これがあるので長い商品名があっても右側の列が押し出されません。
 */
/**
 * 列の定義を鍵で引く表。
 *
 * `COL_DEFS.find(...)` を**セルごと**に呼ぶと 行数 × 列数 回の総なめになります
 * （3,800 行 × 8 列 = 30,400 回）。定義は動かないので1度だけ表にする。
 */
const COL_BY_KEY = new Map(COL_DEFS.map((c) => [c.key as ColKey, c]));

export function standardCells(
  item: EquipmentRecord,
  colOrder: ColKey[],
  visibleCols: Set<ColKey>,
  ctx: CellContext,
  nameSuffix?: ReactNode,
): ReactNode[] {
  return colOrder.filter((k) => visibleCols.has(k)).map((key) => {
    const col = COL_BY_KEY.get(key);
    if (!col) return null;
    switch (col.key) {
      case 'eq_code':
        return (
          <RowSlot key={key} w={COL_W.eq_code}>
            <span className="font-number text-sub-sm truncate text-muted-foreground">{item.eq_code}</span>
          </RowSlot>
        );
      case 'equipment_type':
        // ⚠️ **`overflow-hidden` を外さないこと。** バッジは和文4字までしか幅が
        // 固定されず、それ以上は自然幅で伸びます。`RowSlot` は `shrink-0` なので
        // はみ出したぶんは**隣の「設置場所」の上に重なって**文字が読めなくなります
        // （実際に「設備/その他設備」が「RACK1」に重なっていた）。
        // 幅は `COL_W.equipment_type` = 128 でいまの8通り全部が収まりますが、
        // 種別が増えたときに**同じ壊れ方を静かにやり直さない**ための止め具です。
        //
        // 帯そのものは 112px にそろえる（`badges.tsx`）— そろえないと
        // 4〜8字が混ざるこの列だけ**右端が4通り**になり、縦に流し読みできません。
        return (
          <RowSlot key={key} w={COL_W.equipment_type} className="overflow-hidden">
            <SectionBadge typeCode={item.equipment_type_code} section={item.equipment_section} fixedW={112} />
          </RowSlot>
        );
      case 'location': {
        const text = item.location_name || item.location_detail || '';
        return (
          <RowSlot key={key} w={COL_W.location} title={text || undefined}>
            {text ? <Text>{text}</Text> : null}
          </RowSlot>
        );
      }
      case 'name':
        return (
          <RowMain key={key}>
            {ctx.editMode
              ? <InlineInput item={item} field="name" ctx={ctx} />
              : <div className="text-list truncate" title={item.name}>{item.name}{nameSuffix}</div>}
          </RowMain>
        );
      case 'manufacturer':
        return (
          <RowSlot key={key} w={COL_W.manufacturer} title={item.manufacturer_name || undefined}>
            {item.manufacturer_name ? <Text>{item.manufacturer_name}</Text> : null}
          </RowSlot>
        );
      case 'model_number':
        return (
          <RowSlot key={key} w={COL_W.model_number} title={item.model_number || undefined}>
            {ctx.editMode
              ? <InlineInput item={item} field="model_number" ctx={ctx} />
              : (item.model_number ? <Text>{item.model_number}</Text> : null)}
          </RowSlot>
        );
      case 'serial_number':
        return (
          <RowSlot key={key} w={COL_W.serial_number} title={item.serial_number || undefined}>
            {ctx.editMode
              ? <InlineInput item={item} field="serial_number" ctx={ctx} />
              : (item.serial_number ? <Text>{item.serial_number}</Text> : null)}
          </RowSlot>
        );
      case 'unit_number':
        return (
          <RowSlot key={key} w={COL_W.unit_number} align="right">
            {ctx.editMode
              ? <InlineInput item={item} field="unit_number" ctx={ctx} type="number" className="text-right" />
              : (item.unit_number ?? null) !== null
                ? <span className="font-number text-sub-sm text-muted-foreground">{item.unit_number}</span>
                : null}
          </RowSlot>
        );
      case 'condition':
        return (
          <RowSlot key={key} w={COL_W.condition}>
            {CONDITION_LABELS[item.condition ?? ''] ? <Text>{CONDITION_LABELS[item.condition ?? '']}</Text> : null}
          </RowSlot>
        );
      case 'fixed_asset_code':
        return (
          <RowSlot key={key} w={COL_W.fixed_asset_code} title={item.fixed_asset_code || undefined}>
            {ctx.editMode
              ? <InlineInput item={item} field="fixed_asset_code" ctx={ctx} />
              : (item.fixed_asset_code ? <Text>{item.fixed_asset_code}</Text> : null)}
          </RowSlot>
        );
      case 'notes':
        return (
          <RowSlot key={key} w={COL_W.notes} title={item.notes || undefined}>
            {ctx.editMode
              ? <InlineInput item={item} field="notes" ctx={ctx} />
              : (item.notes ? <Text>{item.notes}</Text> : null)}
          </RowSlot>
        );
      case 'rental':
        return (
          <RowSlot key={key} w={COL_W.rental} placeholder={null}>
            <RentalCell item={item} ctx={ctx} />
          </RowSlot>
        );
      default: return null;
    }
  });
}

export interface CustomCellContext {
  columns: CustomColumn[];
  visible: Set<string>;
  values: Record<string, Record<string, string>>;
  editing: { equipmentId: string; columnId: string } | null;
  setEditing: (v: { equipmentId: string; columnId: string } | null) => void;
  write: (equipmentId: string, columnId: string, value: string) => void;
}

/** 自分で作った列。押すとその場で書ける。**幅は全部同じ**（`CUSTOM_COL_W`） */
export function customCells(item: EquipmentRecord, ctx: CustomCellContext): ReactNode[] {
  return ctx.columns.filter((c) => ctx.visible.has(c.id)).map((col) => {
    const val = ctx.values[item.id]?.[col.id] ?? '';
    const isEditing = ctx.editing?.equipmentId === item.id && ctx.editing?.columnId === col.id;

    if (col.col_type === 'checkbox') {
      const checked = val === 'true' || val === '1';
      return (
        <RowSlot key={col.id} w={CUSTOM_COL_W} align="center" placeholder={null} onClick={(e) => e.stopPropagation()}>
          <EnhancedCheckbox
            checked={checked}
            aria-label={col.name}
            onCheckedChange={(v) => ctx.write(item.id, col.id, v ? 'true' : 'false')}
          />
        </RowSlot>
      );
    }
    if (isEditing) {
      return (
        <RowSlot key={col.id} w={CUSTOM_COL_W} placeholder={null} onClick={(e) => e.stopPropagation()}>
          <input
            type={col.col_type === 'number' ? 'number' : 'text'}
            className="text-sub w-full border-b border-primary-border bg-transparent focus:border-primary focus:outline-none"
            defaultValue={val}
            aria-label={col.name}
            autoFocus
            onBlur={(e) => { ctx.setEditing(null); if (e.target.value !== val) ctx.write(item.id, col.id, e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') ctx.setEditing(null);
            }}
          />
        </RowSlot>
      );
    }
    return (
      <RowSlot
        key={col.id}
        w={CUSTOM_COL_W}
        className="cursor-text hover:bg-muted"
        title={val || '(押すと書けます)'}
        onClick={(e) => { e.stopPropagation(); ctx.setEditing({ equipmentId: item.id, columnId: col.id }); }}
      >
        {val ? <Text>{val}</Text> : null}
      </RowSlot>
    );
  });
}
