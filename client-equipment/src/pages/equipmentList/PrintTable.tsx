/**
 * 機材台帳の印刷用の表 (`index.css` の `@media print` が拾う入れ物)。
 *
 * **`index.css` の印刷 CSS は触っていません** — ラック図と共用で、
 * 高さの固定を外す前提が `shared/src/client/base.css` 側にあります。
 * ここは中身を出すだけです。
 */
import { PRINT_COLS, sectionDisplay, type EquipmentRecord } from './types';

/** 深さ → 名前の前に付ける記号 */
const INDENT_PREFIX = ['', '└ ', '　└ ', '　　└ '];

function cellValue(item: EquipmentRecord, key: string): string {
  switch (key) {
    case 'eq_code': return item.eq_code || '–';
    case 'equipment_type': return sectionDisplay(item.equipment_type_code, item.equipment_section) || '–';
    case 'name': return item.name || '–';
    case 'manufacturer_name': return item.manufacturer_name || '–';
    case 'model_number': return item.model_number || '–';
    case 'unit_number': return item.unit_number != null ? String(item.unit_number) : '–';
    case 'serial_number': return item.serial_number || '–';
    case 'location': return item.location_name || item.location_detail || '–';
    case 'fixed_asset_code': return item.fixed_asset_code || '–';
    case 'purchased_at': return item.purchased_at?.slice(0, 7) || '–';
    case 'warranty_years': return item.warranty_years ? `${item.warranty_years}年` : '–';
    case 'notes': return item.notes || '–';
    default: return '–';
  }
}

export function PrintTable({ items, printCols, printCheckbox, printTitle, filterLabel }: {
  items: EquipmentRecord[];
  printCols: Set<string>;
  printCheckbox: boolean;
  printTitle: string;
  filterLabel: string;
}) {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  const visibleCols = PRINT_COLS.filter((c) => printCols.has(c.key));

  const idMap = new Map<string, EquipmentRecord>(items.map((i) => [i.id, i]));
  const getDepth = (item: EquipmentRecord): number => {
    let depth = 0;
    let pid = item.parent_id;
    while (pid && idMap.has(pid)) {
      depth++;
      pid = idMap.get(pid)?.parent_id;
    }
    return depth;
  };

  return (
    <div id="eq-print-area">
      <div className="print-title">{printTitle}</div>
      <div className="print-meta">
        {today}　全 {items.length} 件{filterLabel ? `　絞り込み: ${filterLabel}` : ''}
      </div>
      <table>
        <thead>
          <tr>
            {printCheckbox && <th className="check-col">✓</th>}
            {visibleCols.map((c) => (
              <th key={c.key} className={c.key === 'eq_code' ? 'col-id' : ''}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const depth = getDepth(item);
            return (
              <tr key={item.id} className={`depth-${Math.min(depth, 3)}`}>
                {printCheckbox && (
                  <td className="check-col">
                    <span style={{ display: 'block', width: 13, height: 13, border: '1px solid #000', margin: '0 auto' }} />
                  </td>
                )}
                {visibleCols.map((c) => {
                  const isName = c.key === 'name';
                  const tdClass = [
                    c.key === 'eq_code' ? 'col-id' : '',
                    c.key === 'notes' ? 'col-notes' : '',
                    isName ? 'col-name' : '',
                  ].filter(Boolean).join(' ');
                  const value = cellValue(item, c.key);
                  return (
                    <td
                      key={c.key}
                      className={tdClass}
                      style={isName && depth > 0 ? { paddingLeft: `${depth * 10 + 5}px` } : {}}
                    >
                      {isName && depth > 0 ? `${INDENT_PREFIX[Math.min(depth, 3)]}${value}` : value}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
