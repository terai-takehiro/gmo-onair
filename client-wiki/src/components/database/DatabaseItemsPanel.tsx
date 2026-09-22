/**
 * 右パネル「項目」（列の定義）— 設計 §6-⑩
 *
 * 名前・型・選択肢・必須を並べ、押すと1つずつ直せます。
 * **順番がそのまま表の列の順番**なので、上下で動かせるようにしてあります
 * （ビューごとの「表示する列」は「絞り込みと並べ替え」の中にあります）。
 *
 * ⚠️ 項目の定義は PC の操作（設計 §6-⑩）。このパネルは `hidden xl:flex` の中にあります。
 */
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiItem } from '@gmo-onair/shared/src/wiki/types';
import { ITEM_TYPE_LABEL, itemIcon } from './dbValues';

export interface DatabaseItemsPanelProps {
  items: WikiItem[];
  canEdit: boolean;
  saving: boolean;
  onAdd: () => void;
  onEdit: (item: WikiItem) => void;
  /** 並べ替え（上へ / 下へ）。表の列の順番が変わります */
  onReorder: (items: WikiItem[]) => void;
}

function move(items: WikiItem[], index: number, delta: number): WikiItem[] {
  const next = [...items];
  const to = index + delta;
  if (to < 0 || to >= next.length) return items;
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export default function DatabaseItemsPanel({
  items, canEdit, saving, onAdd, onEdit, onReorder,
}: DatabaseItemsPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="text-cardtitle text-foreground">項目</span>
        {canEdit && (
          <Button size="sm" variant="outline" disabled={saving} onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            追加
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <EmptyState
            title="まだ項目がありません"
            description={canEdit
              ? '「追加」を押すと、表の列（名前・型・選択肢）を決められます。'
              : '項目を追加できるのは編集権限のある人です。'}
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((item, i) => {
              const Icon = itemIcon(item.type);
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-note border border-border bg-card px-2.5 py-2"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-list text-foreground">
                      {item.name}
                      {item.required && <span className="ml-1 text-sub-sm text-destructive">必須</span>}
                    </span>
                    <span className="block truncate text-sub-sm text-muted-foreground">
                      {ITEM_TYPE_LABEL[item.type]}
                      {item.options?.length ? ` ・ 選択肢 ${item.options.length} 件` : ''}
                    </span>
                  </span>

                  {canEdit && (
                    <span className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${item.name}を上へ`}
                        disabled={saving || i === 0}
                        onClick={() => onReorder(move(items, i, -1))}
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${item.name}を下へ`}
                        disabled={saving || i === items.length - 1}
                        onClick={() => onReorder(move(items, i, 1))}
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${item.name}を編集`}
                        disabled={saving}
                        onClick={() => onEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
