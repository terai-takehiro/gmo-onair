// 機材台帳の「印刷」まわり — v2.9.292 で EquipmentListPage.tsx から切り出し。
//
// 印刷は台帳の中で**独立した機能**（列を選ぶ・題を付ける・向きを決める・紙に出す）で、
// 一覧の絞り込みや編集とは state を共有していない。ひとかたまりにすると
// 「印刷を直したい」ときに読む場所が 1 つで済む。
//
// **中身は 1 行も変えていない**（移動 + props 化のみ）。
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { ToggleButtonGroup } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { sectionDisplay } from './columns';
import { PRINT_COLS } from './columns';


export function PrintSettingsDialog({
  open, onOpenChange, printCols, setPrintCols, printCheckbox, setPrintCheckbox,
  printTitle, setPrintTitle, printLandscape, setPrintLandscape, onPrint, itemCount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  printCols: Set<string>;
  setPrintCols: (v: Set<string>) => void;
  printCheckbox: boolean;
  setPrintCheckbox: (v: boolean) => void;
  printTitle: string;
  setPrintTitle: (v: string) => void;
  printLandscape: boolean;
  setPrintLandscape: (v: boolean) => void;
  onPrint: () => void;
  itemCount: number;
}) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>印刷設定</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>タイトル</Label>
              <Input value={printTitle} onChange={(e) => setPrintTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>印刷する列</Label>
              <ToggleButtonGroup
                options={PRINT_COLS.map(c => ({ value: c.key, label: c.label }))}
                value={Array.from(printCols)}
                onChange={(next: string[]) => setPrintCols(new Set(next))}
                multi
                cols={{ base: 2, sm: 3 }}
                size="sm"
                showSelectAll
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>チェック欄を追加（棚卸し用手書き）</span>
              <Switch checked={printCheckbox} onCheckedChange={(v: boolean) => setPrintCheckbox(!!v)} />
            </div>
            <div className="space-y-1.5">
              <Label>用紙方向</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="radio" name="print-orient" checked={!printLandscape} onChange={() => setPrintLandscape(false)} />
                  縦 (A4 Portrait)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="radio" name="print-orient" checked={printLandscape} onChange={() => setPrintLandscape(true)} />
                  横 (Landscape)
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">※ 現在の絞り込み結果 {itemCount} 件を印刷</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
              <Button onClick={onPrint}>
                <Printer className="h-4 w-4 mr-1" />印刷実行
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );
}

export function PrintTable({ items, printCols, printCheckbox, printTitle, filterLabel }: {
  items: any[];
  printCols: Set<string>;
  printCheckbox: boolean;
  printTitle: string;
  filterLabel: string;
}) {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  const getCellValue = (item: any, key: string): string => {
    switch (key) {
      case 'eq_code':           return item.eq_code || '–';
      case 'equipment_type':    return sectionDisplay(item.equipment_type_code, item.equipment_section) || '–';
      case 'name':              return item.name || '–';
      case 'manufacturer_name': return item.manufacturer_name || '–';
      case 'model_number':      return item.model_number || '–';
      case 'unit_number':       return item.unit_number != null ? String(item.unit_number) : '–';
      case 'serial_number':     return item.serial_number || '–';
      case 'location':          return item.location_name || item.location_detail || '–';
      case 'fixed_asset_code':  return item.fixed_asset_code || '–';
      case 'purchased_at':      return item.purchased_at?.slice(0, 7) || '–';
      case 'warranty_years':    return item.warranty_years ? `${item.warranty_years}年` : '–';
      case 'notes':             return item.notes || '–';
      default:                  return '–';
    }
  };

  const visibleCols = PRINT_COLS.filter(c => printCols.has(c.key));

  // 各アイテムの深さを計算（idMap から親を辿る）
  const idMap = new Map<string, any>(items.map((i: any) => [i.id, i]));
  const getDepth = (item: any): number => {
    let depth = 0;
    let pid = item.parent_id;
    while (pid && idMap.has(pid)) {
      depth++;
      pid = idMap.get(pid)?.parent_id;
    }
    return depth;
  };

  // インデント記号（深さ → プレフィックス文字列）
  const INDENT_PREFIX = ['', '└ ', '　└ ', '　　└ '];

  return (
    <div id="eq-print-area">
      <div className="print-title">{printTitle}</div>
      <div className="print-meta">
        {today}　全 {items.length} 件{filterLabel ? `　フィルター: ${filterLabel}` : ''}
      </div>
      <table>
        <thead>
          <tr>
            {printCheckbox && <th className="check-col">✓</th>}
            {visibleCols.map(c => (
              <th key={c.key} className={c.key === 'eq_code' ? 'col-id' : ''}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const depth = getDepth(item);
            const depthClass = `depth-${Math.min(depth, 3)}`;
            return (
              <tr key={item.id} className={depthClass}>
                {printCheckbox && (
                  <td className="check-col">
                    <span style={{ display: 'block', width: 13, height: 13, border: '1px solid #000', margin: '0 auto' }} />
                  </td>
                )}
                {visibleCols.map(c => {
                  const isName = c.key === 'name';
                  const tdClass = [
                    c.key === 'eq_code' ? 'col-id' : '',
                    c.key === 'notes' ? 'col-notes' : '',
                    isName ? 'col-name' : '',
                  ].filter(Boolean).join(' ');
                  const value = getCellValue(item, c.key);
                  return (
                    <td key={c.key} className={tdClass}
                      style={isName && depth > 0 ? { paddingLeft: `${depth * 10 + 5}px` } : {}}>
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
