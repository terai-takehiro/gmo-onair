/**
 * 機材台帳の絞り込み — **スマホ版**（M8）
 *
 * ── 何が起きていたか（390px で実測）─────────────────────────
 *
 * 最初のカードに着くまで **約 1,100px** ＝ 1.4 画面ぶんが枠でした。内訳:
 *
 *   説明文 ／ 3タブ ／「機材 33 点」＋ボタン6個（2段）／
 *   種別のチップ 9個（2段）／ 区分のチップ 3個 ／ 設置場所 ／
 *   探す欄 ＋「付属品も出す」
 *
 * このうち **6個のボタンのうち5個は、スマホでは押しても何も起きません** —
 * Excel 取込・Excel 出力・印刷・出す列・表で直す は**どれも表に効くもの**で、
 * 768px 未満では表そのものが出ていない（`EquipmentCards` に切り替わる）ためです。
 * → `ItemsPanel` 側で落としました。ここは残る絞り込みを畳みます。
 *
 * ── 設置場所だけ形を変えた ──────────────────────────────────
 *
 * PC は**ボタンを押すと下に開くドロップダウン**ですが、スマホでは
 * シートの中にさらに小さいドロップダウンが重なることになります。
 * シートの中では**そのまま並べます**（開く手間が1つ減る）。
 *
 * ── 数え方 ──────────────────────────────────────────────────
 *
 * 「付属品も出す」も数に入れます。**絞り込みではなく増やす操作**ですが、
 * 入れたままだと件数が急に増え、**畳んでいると理由が分かりません**。
 */
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import {
  MobileFilterBar, MobileFilterField, MobileFilterSegments,
} from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { TYPE_CODES } from '@/lib/constants';
import type { EquipmentRecord, LocationRecord } from './types';
import type { FilterState } from './EquipmentFilters';

/** 既定から動いている絞り込みの数。**探す欄は数えない**（外に出したままなので見えている） */
export function activeCount(s: FilterState): number {
  return (s.type ? 1 : 0) + (s.section ? 1 : 0) + (s.locs.size > 0 ? 1 : 0) + (s.includeChildren ? 1 : 0);
}

export function MobileFilters({
  state, base, locations, onChange, onToggleLoc, onClear,
}: {
  state: FilterState;
  base: { forType: EquipmentRecord[]; forSection: EquipmentRecord[] };
  locations: LocationRecord[];
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

  return (
    <MobileFilterBar
      search={{
        value: state.search,
        onChange: (v) => onChange({ search: v }),
        placeholder: '名前・ID・型名で探す',
        label: '機材を探す',
      }}
      activeCount={activeCount(state)}
      onClearAll={onClear}
    >
      {/* 種別は9個あるので、シートの中でも横スクロールのチップのまま
          （縦に9行積むとシートが埋まり、下の軸に届かない） */}
      <MobileFilterField label="種別">
        <FilterChips
          label="種別で絞り込む"
          items={typeChips}
          value={state.type}
          onChange={(v) => onChange({ type: v })}
        />
      </MobileFilterField>

      <MobileFilterField label="区分">
        <MobileFilterSegments
          label="区分で絞り込む"
          items={[['', `設備も貸出も ${base.forSection.length}`], ['equipment', '設備'], ['rental', '貸出']]}
          value={state.section}
          onChange={(v) => onChange({ section: v })}
        />
      </MobileFilterField>

      <MobileFilterField
        label="設置場所"
        hint={state.locs.size > 0 ? `${state.locs.size} か所を選んでいます` : undefined}
      >
        {locations.length === 0 ? (
          <span className="text-note text-muted-foreground">保管場所がまだ作られていません</span>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-control border border-border">
            {locations.map((loc) => (
              <label key={loc.id} className="min-h-tap flex cursor-pointer items-center gap-2.5 border-b border-border-faint px-3 last:border-b-0">
                <EnhancedCheckbox checked={state.locs.has(loc.id)} onCheckedChange={() => onToggleLoc(loc.id)} />
                <span className="text-list truncate">{loc.name || loc.location_detail}</span>
              </label>
            ))}
          </div>
        )}
      </MobileFilterField>

      <MobileFilterField label="付属品" hint="ケーブルやバッテリーなど、機材にぶら下がっているものも一覧に出します">
        <label className="flex min-h-tap items-center gap-2.5">
          <Switch
            checked={state.includeChildren}
            onCheckedChange={(v) => onChange({ includeChildren: !!v })}
            aria-label="付属品も出す"
          />
          <span className="text-list">付属品も出す</span>
        </label>
      </MobileFilterField>
    </MobileFilterBar>
  );
}
