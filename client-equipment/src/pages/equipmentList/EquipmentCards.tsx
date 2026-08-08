/**
 * 機材台帳のスマホ表示 (640px 未満)。
 *
 * **PC の表をそのまま縮めない** (docs/design/v4/_rules.md「3. スマホ」)。
 * 出すのは「どれか1つ選ぶ」ために要るものだけ — 種別・ID・名前・型名・
 * メーカー／置き場所です。列の出し入れ・その場編集・まとめて直すは PC に任せます。
 */
import { ChevronRight } from 'lucide-react';
import { TYPE_BORDER_COLOR } from '@/lib/constants';
import { AssetBadge, SectionBadge } from './badges';
import type { EquipmentRecord } from './types';

export function EquipmentCards({ items, onOpen }: {
  items: EquipmentRecord[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 md:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item.id)}
          className={`min-h-tap w-full rounded-card border border-border bg-card px-3 py-2.5 text-left hover:bg-background ${
            item.parent_id ? 'ml-4' : ''
          }`}
          style={{ borderLeft: `3px solid ${TYPE_BORDER_COLOR[item.equipment_type_code ?? ''] ?? '#6b7280'}` }}
        >
          <span className="mb-1 flex items-center justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <SectionBadge typeCode={item.equipment_type_code} section={item.equipment_section} placeholder={false} />
              <span className="font-number text-sub-sm text-muted-foreground">{item.eq_code}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </span>
          <span className="block truncate text-list">
            {item.name}
            {(item.children_count ?? 0) > 0 && (
              <span className="ml-1.5 rounded-chip bg-muted px-1.5 font-number text-note text-muted-foreground">
                {item.children_count}
              </span>
            )}
            {item.parent_name && (
              <span className="ml-1.5 rounded-badge-xs bg-muted px-1 text-note text-muted-foreground">
                ← {item.parent_name}
              </span>
            )}
          </span>
          <span className="block truncate text-sub-sm text-muted-foreground">
            {item.model_number || '型名なし'}{item.unit_number != null ? ` ／ No.${item.unit_number}` : ''}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-sub-sm text-muted-foreground">
            {[item.manufacturer_name, item.location_name || item.location_detail].filter(Boolean).join(' ／ ')}
            {item.asset_class && <AssetBadge v={item.asset_class} />}
          </span>
        </button>
      ))}
    </div>
  );
}
