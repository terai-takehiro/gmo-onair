// テロップCG — 一覧表部品専用の入力UI（PageFormDialog から切り出し・400行規律）。
//
// `list` パーツだけが持つ「項目の可変長配列」を編集する。他の部品の1行テキスト欄
// （pageFields.ts の通常の PartFieldDef）とは別経路 — PageFormDialog 側は
// `def.kind === 'list-items'` のときだけこのコンポーネントに差し替える（他部品は無改修）。
// ScoreEntriesEditor / VoteChoicesEditor と同じ操作感（並べ替えは上下ボタン・44px タップ領域）
// で揃えたが、要素は構造体ではなく文字列1本なので入力欄は1つだけ（票数・得点のような
// 付随フィールドが無い分、いちばんシンプル）。
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEFAULT_ITEM_LIMIT, DEFAULT_MAX_LIST_ITEMS } from './listItems';

export function ListItemsEditor({
  label, items, maxItems, itemLimit, onChange,
}: {
  label: string;
  items: string[];
  maxItems?: number;
  itemLimit?: number;
  onChange: (next: string[]) => void;
}) {
  const max = maxItems ?? DEFAULT_MAX_LIST_ITEMS;
  const limit = itemLimit ?? DEFAULT_ITEM_LIMIT;

  const update = (i: number, value: string) => {
    onChange(items.map((v, idx) => (idx === i ? value : v)));
  };
  const add = () => {
    if (items.length >= max) return;
    onChange([...items, '']);
  };
  const remove = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-number text-note text-muted-foreground">{items.length} / {max}</span>
      </div>
      <div className="mt-1.5 space-y-2">
        {items.map((item, i) => {
          const len = Array.from(item).length;
          return (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-control-md border border-border bg-surface-subtle p-2"
            >
              <div className="flex shrink-0 gap-0.5">
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11"
                  disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${i + 1}番目を上へ`}
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button" variant="outline" size="icon" className="h-11 w-11"
                  disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={`${i + 1}番目を下へ`}
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="min-w-[160px] flex-1 space-y-1">
                <Input
                  className="min-h-[44px]"
                  value={item}
                  placeholder={`項目（${limit}字まで）`}
                  onChange={(e) => update(i, e.target.value)}
                  aria-label={`${i + 1}番目の項目`}
                />
                {len > limit && (
                  <p className="mt-0.5 text-note text-warning">{len} / {limit}字</p>
                )}
              </div>

              <Button
                type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
                onClick={() => remove(i)} aria-label={`${i + 1}番目を削除`} disabled={items.length <= 1}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2 min-h-[44px]" disabled={items.length >= max} onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />項目を追加
      </Button>
    </div>
  );
}
