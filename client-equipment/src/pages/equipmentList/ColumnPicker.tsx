/**
 * 「出す列」を選ぶ引き出し (機材台帳)。
 *
 * カスタム列 (利用者が作る列) があるので、ケーブル・コネクタのように
 * 列を固定にはできません。ここだけは出し入れを残しています。
 */
import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, RotateCcw, Settings2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnhancedCheckbox } from '@gmo-onair/shared/src/client/ui/enhanced-checkbox';
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { COL_DEFS } from './types';
import type { ColumnPrefs } from './useColumnPrefs';

export function ColumnPicker({ open, onOpenChange, prefs, customColumns, onManageCustom }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: ColumnPrefs;
  customColumns: CustomColumn[];
  onManageCustom: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onOpenChange]);

  const allCustomIds = customColumns.map((c) => c.id);

  return (
    <div className="relative" ref={ref}>
      <Button variant={open ? 'default' : 'outline'} onClick={() => onOpenChange(!open)}>
        <SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden="true" />出す列
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-card border border-border bg-card p-2 shadow-lg">
          <div className="flex items-center justify-between px-1 pb-1.5">
            <p className="text-th text-muted-foreground">出す列</p>
            <button
              type="button"
              className="flex items-center gap-0.5 text-note text-muted-foreground hover:text-foreground"
              onClick={prefs.reset}
            >
              <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />既定に戻す
            </button>
          </div>

          {prefs.colOrder.map((key, idx) => {
            const col = COL_DEFS.find((c) => c.key === key);
            if (!col) return null;
            return (
              <div key={col.key} className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-muted">
                <EnhancedCheckbox
                  checked={prefs.visibleCols.has(col.key)}
                  onCheckedChange={() => prefs.toggleCol(col.key)}
                  id={`col-${col.key}`}
                />
                <label htmlFor={`col-${col.key}`} className="flex-1 cursor-pointer select-none text-sub">
                  {col.label}
                </label>
                <div className="flex gap-0.5">
                  <button
                    type="button" aria-label={`${col.label} を上へ`}
                    className="rounded-badge-xs p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-20"
                    disabled={idx === 0} onClick={() => prefs.moveCol(key, 'up')}
                  >
                    <ArrowUp className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button" aria-label={`${col.label} を下へ`}
                    className="rounded-badge-xs p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-20"
                    disabled={idx === prefs.colOrder.length - 1} onClick={() => prefs.moveCol(key, 'down')}
                  >
                    <ArrowDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}

          {customColumns.length > 0 && (
            <>
              <div className="my-1.5 border-t border-border" />
              <p className="px-1 pb-1 text-th text-muted-foreground">自分で作った列</p>
              {customColumns.map((col, idx) => (
                <div key={col.id} className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-muted">
                  <EnhancedCheckbox
                    checked={prefs.visibleCustomCols.has(col.id)}
                    onCheckedChange={() => prefs.toggleCustomCol(col.id)}
                    id={`custom-col-${col.id}`}
                  />
                  <label
                    htmlFor={`custom-col-${col.id}`}
                    className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 text-sub"
                  >
                    <span className="flex-1 truncate">{col.name}</span>
                    <span className="shrink-0 text-note text-muted-foreground">
                      {col.scope === 'shared' ? '共' : '個'}
                    </span>
                  </label>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button" aria-label={`${col.name} を上へ`}
                      className="rounded-badge-xs p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-20"
                      disabled={idx === 0} onClick={() => prefs.moveCustomCol(col.id, 'up', allCustomIds)}
                    >
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button" aria-label={`${col.name} を下へ`}
                      className="rounded-badge-xs p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-20"
                      disabled={idx === customColumns.length - 1}
                      onClick={() => prefs.moveCustomCol(col.id, 'down', allCustomIds)}
                    >
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="mt-1.5 border-t border-border pt-1.5">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-sub text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => { onOpenChange(false); onManageCustom(); }}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />自分で作る列を管理する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
