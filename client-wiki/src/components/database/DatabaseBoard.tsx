/**
 * ボードのビュー — 選択型の項目でグループに分け、ドラッグで値を変える（設計 §6-⑩）
 *
 * ⚠️ **`@dnd-kit` は client-wiki に入れていません。** 入れるとバンドルが増え、
 *    このアプリで必要なのは「カードを列から列へ移す」だけなので、
 *    ブラウザ標準のドラッグ（`draggable` ＋ `dragstart` / `dragover` / `drop`）で作ります。
 *
 * ⚠️ **ドラッグだけにしない。** 標準のドラッグはタッチでは動かず、キーボードでも
 *    操作できません。カードの中に同じ値を変える選択欄を置いて、
 *    スマホとキーボードでも動かせるようにしています。
 */
import { useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Columns3 } from 'lucide-react';
import type { WikiItem, WikiRow } from '@gmo-onair/shared/src/wiki/types';
import { cn } from '@/lib/utils';
import { groupRows } from './dbView';
import { displayValue, optionTone } from './dbValues';

export interface DatabaseBoardProps {
  items: WikiItem[];
  rows: WikiRow[];
  /** グループ化に使う選択型の項目。無ければ案内を出す */
  groupItem: WikiItem | null;
  canEdit: boolean;
  savingRowId?: string | null;
  /** カードを動かしたとき。`null` は「未設定」に戻す */
  onMove: (row: WikiRow, value: string | null) => void;
}

export default function DatabaseBoard({
  items, rows, groupItem, canEdit, savingRowId, onMove,
}: DatabaseBoardProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  if (!groupItem) {
    return (
      <EmptyState
        icon={<Columns3 />}
        title="グループに使う項目が決まっていません"
        description="ボードは選択型の項目でグループに分けます。「ビューの設定」で項目を選んでください。"
      />
    );
  }

  // 値の欄はグループに使う項目を除く（同じ値が2か所に出るのを避ける）
  const detailItems = items.filter((it) => it.id !== groupItem.id).slice(0, 2);
  const groups = groupRows(rows, groupItem);
  const drop = (value: string | null) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const row = rows.find((r) => r.id === id);
    setDragging(null);
    if (!row) return;
    const now = row.props?.[groupItem.id];
    if ((typeof now === 'string' ? now : null) === value) return;
    onMove(row, value);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {groups.map((group) => (
        <section
          key={group.value ?? 'unset'}
          className={cn(
            'flex w-[240px] shrink-0 flex-col gap-2 rounded-card border border-border bg-surface-subtle p-2.5',
            over === (group.value ?? 'unset') && 'border-primary',
          )}
          onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(group.value ?? 'unset'); } }}
          onDragLeave={() => setOver((v) => (v === (group.value ?? 'unset') ? null : v))}
          onDrop={drop(group.value)}
        >
          <h3 className="flex items-center justify-between gap-2 text-th text-muted-foreground">
            <span className="truncate">{group.label}</span>
            <span className="shrink-0 tabular-nums">{group.rows.length}</span>
          </h3>

          {group.rows.map((row) => (
            <article
              key={row.id}
              draggable={canEdit}
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', row.id); setDragging(row.id); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              className={cn(
                'rounded-note border border-border bg-card p-2.5',
                canEdit && 'cursor-grab',
                dragging === row.id && 'opacity-50',
              )}
            >
              <Link to={`/p/${row.id}`} className="no-underline">
                <span className="block truncate text-list text-foreground hover:text-primary">{row.title}</span>
              </Link>

              {detailItems.map((item) => {
                const text = displayValue(item, row.props?.[item.id]);
                if (!text) return null;
                return (
                  <span key={item.id} className="mt-1 block truncate text-sub-sm text-muted-foreground">
                    {item.name}: {text}
                  </span>
                );
              })}

              {/* ドラッグできない端末・キーボードのための同じ操作 */}
              {canEdit && (
                <select
                  className="mt-2 min-h-tap w-full rounded-control border border-border bg-card px-2 text-sub-sm text-foreground lg:h-8 lg:min-h-0"
                  value={typeof row.props?.[groupItem.id] === 'string' ? String(row.props[groupItem.id]) : ''}
                  disabled={savingRowId === row.id}
                  aria-label={`${row.title} の${groupItem.name}`}
                  onChange={(e) => onMove(row, e.target.value || null)}
                >
                  <option value="">未設定</option>
                  {(groupItem.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.value}</option>
                  ))}
                </select>
              )}
            </article>
          ))}

          {group.rows.length === 0 && (
            <p className={cn('rounded-note border border-dashed border-border px-2 py-3 text-center text-sub-sm text-muted-foreground',
              group.value && optionTone(groupItem, group.value))}>
              ここに移すと「{group.label}」になります
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
