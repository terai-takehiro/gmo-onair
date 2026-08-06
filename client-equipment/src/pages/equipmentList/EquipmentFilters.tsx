/**
 * 機材台帳の絞り込み (種別 ／ 区分 ／ 設置場所 ／ 探す ／ 子機材)
 *
 * ── 件数を必ず出す ──────────────────────────────────────
 *
 * 旧実装のタブは件数を持っていなかったので、**押してみるまで 0 件だと分かりません**
 * でした。件数は「その軸以外の絞り込みだけ」を掛けて数えます
 * (全件の内訳を出すと、探している最中に押した先が 0 件になる)。
 */
import { MapPin } from 'lucide-react';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/parts/SearchField';
import { TYPE_CODES } from '@/lib/constants';
import type { EquipmentRecord, LocationRecord } from './types';

export interface FilterState {
  type: string;
  section: string;
  locs: Set<string>;
  search: string;
  includeChildren: boolean;
}

export function EquipmentFilters({
  state, base, locations, locOpen, onLocOpenChange, onChange, onToggleLoc, onClear,
}: {
  state: FilterState;
  /** その軸以外の絞り込みを掛けたあとの母数 (件数を数える元) */
  base: { forType: EquipmentRecord[]; forSection: EquipmentRecord[] };
  locations: LocationRecord[];
  locOpen: boolean;
  onLocOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<FilterState>) => void;
  onToggleLoc: (id: string) => void;
  onClear: () => void;
}) {
  const typeChips = [
    { key: '', label: 'すべて', count: base.forType.length },
    ...TYPE_CODES.map((t) => ({
      key: t.code,
      label: t.label,
      count: base.forType.filter((i) => i.equipment_type_code === t.code).length,
    })),
  ];

  const sectionChips = [
    { key: '', label: '設備も貸出も', count: base.forSection.length },
    { key: 'equipment', label: '設備', count: base.forSection.filter((i) => i.equipment_section === 'equipment').length },
    { key: 'rental', label: '貸出', count: base.forSection.filter((i) => i.equipment_section === 'rental').length },
  ];

  const filtering = !!(state.type || state.section || state.locs.size > 0 || state.search);

  return (
    <div className="flex flex-col gap-2">
      <FilterChips
        label="種別で絞り込む"
        items={typeChips}
        value={state.type}
        onChange={(v) => onChange({ type: v })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips
          label="区分で絞り込む"
          items={sectionChips}
          value={state.section}
          onChange={(v) => onChange({ section: v })}
        />

        <div className="relative">
          {locOpen && (
            <button
              type="button"
              aria-label="設置場所の絞り込みを閉じる"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => onLocOpenChange(false)}
            />
          )}
          <Button
            variant={state.locs.size > 0 ? 'default' : 'outline'}
            onClick={() => onLocOpenChange(!locOpen)}
            aria-expanded={locOpen}
          >
            <MapPin className="mr-1 h-4 w-4" aria-hidden="true" />
            {state.locs.size > 0 ? `設置場所 ${state.locs.size} か所` : '設置場所'}
          </Button>
          {locOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-72 min-w-[200px] overflow-y-auto rounded-card border border-border bg-card py-1.5 shadow-lg">
              {state.locs.size > 0 && (
                <button
                  type="button"
                  className="min-h-tap w-full border-b border-border px-3 text-left text-sub text-muted-foreground hover:bg-muted lg:min-h-[36px]"
                  onClick={() => { onChange({ locs: new Set() }); onLocOpenChange(false); }}
                >
                  選んだ場所を外す
                </button>
              )}
              {locations.map((loc) => (
                <label
                  key={loc.id}
                  className="min-h-tap flex cursor-pointer items-center gap-2 px-3 text-sub hover:bg-muted lg:min-h-[36px]"
                >
                  <EnhancedCheckbox checked={state.locs.has(loc.id)} onCheckedChange={() => onToggleLoc(loc.id)} />
                  <span className="truncate">{loc.name || loc.location_detail}</span>
                </label>
              ))}
              {locations.length === 0 && (
                <p className="px-3 py-2 text-sub-sm text-muted-foreground">保管場所がまだ作られていません</p>
              )}
            </div>
          )}
        </div>

        {filtering && (
          <Button variant="ghost" onClick={onClear}>絞り込みを外す</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField
          value={state.search}
          onChange={(v) => onChange({ search: v })}
          placeholder="名前・ID・型名で探す"
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-sub text-muted-foreground">
          <Switch
            checked={state.includeChildren}
            onCheckedChange={(v) => onChange({ includeChildren: !!v })}
            aria-label="付属品も出す"
          />
          <span>付属品も出す</span>
        </label>
      </div>
    </div>
  );
}
