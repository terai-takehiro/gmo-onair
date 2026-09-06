/**
 * ⑦ 貸出を登録する ／ ①機材を選ぶステップ (種別のタブ ＋ カード)
 *
 * `LendingDialog` の1段目。選択状態そのものは親が持ち、ここは
 * 「種別で絞る」「カードを押して選ぶ」の表示だけを受け持つ。
 */
import { useMemo } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { TYPE_CODES } from '@/lib/constants';
import type { LendableItem } from './types';

export function LendingSelectStep({ loading, parents, childrenMap, selectedIds, typeTab, onTypeTabChange, onToggle }: {
  loading: boolean;
  parents: LendableItem[];
  childrenMap: Map<string, LendableItem[]>;
  selectedIds: Set<string>;
  typeTab: string;
  onTypeTabChange: (code: string) => void;
  onToggle: (item: LendableItem) => void;
}) {
  const availableTypes = useMemo(() => {
    const codes = new Set(parents.map((i) => i.equipment_type_code));
    return TYPE_CODES.filter((t) => codes.has(t.code));
  }, [parents]);
  const shown = typeTab ? parents.filter((i) => i.equipment_type_code === typeTab) : parents;

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mt-1 flex gap-1.5 overflow-x-auto border-b border-border bg-card py-2.5">
        <button
          type="button"
          onClick={() => onTypeTabChange('')}
          className={cn(
            'min-h-tap shrink-0 rounded-chip px-3 text-sub lg:min-h-[36px]',
            !typeTab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-background',
          )}
        >
          すべて {parents.length}
        </button>
        {availableTypes.map((t) => (
          <button
            key={t.code}
            type="button"
            onClick={() => onTypeTabChange(t.code)}
            className={cn(
              'min-h-tap shrink-0 rounded-chip px-3 text-sub lg:min-h-[36px]',
              typeTab === t.code ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-background',
            )}
          >
            {t.label} {parents.filter((i) => i.equipment_type_code === t.code).length}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-12 text-center text-sub text-muted-foreground">
          <Loader2 className="mr-2 inline h-5 w-5 animate-spin" aria-hidden="true" />読み込み中…
        </p>
      ) : shown.length === 0 ? (
        <EmptyState
          title="持ち出せる機材がありません"
          description="設定の「貸出のルール」で貸出可にした、稼働中の機材だけが出ます。"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.map((item) => {
            const on = selectedIds.has(item.id);
            const lent = !!item.current_lending;
            const kids = childrenMap.get(item.id)?.length ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                disabled={lent}
                onClick={() => onToggle(item)}
                aria-pressed={on}
                className={cn(
                  'min-h-tap relative w-full rounded-card border p-2.5 text-left text-sub',
                  on ? 'border-primary bg-primary-surface' : 'border-border hover:bg-muted',
                  lent && 'cursor-not-allowed bg-muted opacity-50',
                )}
              >
                {on && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-chip bg-primary">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" aria-hidden="true" />
                  </span>
                )}
                <span className="line-clamp-2 block pr-5 text-list">{item.name}</span>
                <span className="font-number mt-1 block text-sub-sm text-muted-foreground">
                  {item.unit_number != null ? `No.${item.unit_number}` : item.eq_code}
                </span>
                {item.location_name && (
                  <span className="mt-0.5 block truncate text-sub-sm text-muted-foreground">{item.location_name}</span>
                )}
                {kids > 0 && <span className="mt-1 block text-note text-primary">付属品 {kids} 点も一緒</span>}
                {lent && <span className="mt-1 block text-note text-warning">いま貸出中</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
