/**
 * 絞り込み・並べ替え・表示する列（ビューごと・設計 §6-⑩）
 *
 * ⚠️ **ここで決めたものは保存され、開いた人全員に同じに見えます。**
 *    個人ごとの絞り込みは残しません（判断3c の「ビューの設定は保存される」）。
 *
 * ⚠️ **当てるのはサーバー**（`wiki-view-apply.ts`）。ここは**設定を作るだけ**で、
 *    行を絞る計算は持ちません（画面とサーバーで結果が違う状態を作らないため）。
 */
import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import type {
  WikiItem,
  WikiPropValue,
  WikiView,
  WikiViewFilter,
  WikiViewSort,
} from '@gmo-onair/shared/src/wiki/types';
import { FILTER_OP_LABEL, opNeedsValue, opsFor } from './dbView';

const FIELD = 'min-h-tap w-full rounded-control border border-border bg-card px-2 text-sub text-foreground focus:border-primary focus:outline-none lg:h-9 lg:min-h-0';
const SECTION = 'text-cardtitle text-foreground';

export interface DatabaseRulesSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  view: WikiView;
  views: WikiView[];
  items: WikiItem[];
  saving: boolean;
  onSave: (views: WikiView[]) => void;
}

/** 条件の値の入力。型に合う入れ方を出す（日付に文字を打たせない） */
function ValueInput({
  item, value, onChange,
}: {
  item: WikiItem;
  value: WikiPropValue | undefined;
  onChange: (v: WikiPropValue) => void;
}) {
  if (item.type === 'checkbox') {
    return (
      <select className={FIELD} value={value === true ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === 'yes')}>
        <option value="yes">はい</option>
        <option value="no">いいえ</option>
      </select>
    );
  }
  if (item.type === 'select' || item.type === 'multi_select') {
    return (
      <select className={FIELD} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">選んでください</option>
        {(item.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.value}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      className={FIELD}
      type={item.type === 'date' ? 'date' : item.type === 'number' ? 'number' : 'text'}
      value={value === undefined || value === null || typeof value === 'object' ? '' : String(value)}
      aria-label="条件の値"
      onChange={(e) => onChange(item.type === 'number' ? Number(e.target.value) : e.target.value)}
    />
  );
}

export default function DatabaseRulesSheet({
  open, onOpenChange, view, views, items, saving, onSave,
}: DatabaseRulesSheetProps) {
  const [filters, setFilters] = useState<WikiViewFilter[]>([]);
  const [sorts, setSorts] = useState<WikiViewSort[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setFilters(view.filters ?? []);
    setSorts(view.sorts ?? []);
    setColumns(view.columns ?? []);
  }, [open, view]);

  if (!open) return null;

  const byId = new Map(items.map((it) => [it.id, it]));
  const shown = columns.length > 0 ? columns : items.map((it) => it.id);

  const submit = () => {
    const next: WikiView = { ...view };
    // **空のときは持たせない**（サーバーも空のときは項目ごと落とす）
    if (filters.length > 0) next.filters = filters; else delete next.filters;
    if (sorts.length > 0) next.sorts = sorts; else delete next.sorts;
    if (columns.length > 0 && columns.length < items.length) next.columns = columns;
    else delete next.columns;

    const exists = views.some((v) => v.id === view.id);
    onSave(exists ? views.map((v) => (v.id === view.id ? next : v)) : [...views, next]);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${view.name} の表示`}
      sub="絞り込み・並べ替え・出す列を決めます。開いた人全員に同じに見えます。"
      size="md"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button disabled={saving} onClick={submit}>保存</Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-5">
        {items.length === 0 && (
          <p className="text-sub text-muted-foreground">
            項目がまだありません。右の「項目」で列を追加すると、ここで絞り込めます。
          </p>
        )}

        {/* 絞り込み */}
        <section className="flex flex-col gap-2">
          <h3 className={SECTION}>絞り込み</h3>
          {filters.map((f, i) => {
            const item = byId.get(f.itemId);
            const ops = item ? opsFor(item) : [];
            return (
              <div key={`${f.itemId}-${i}`} className="flex flex-wrap items-center gap-1.5">
                <select
                  className={`${FIELD} sm:w-[160px]`}
                  value={f.itemId}
                  aria-label="絞り込む項目"
                  onChange={(e) => {
                    const nextItem = byId.get(e.target.value);
                    const op = nextItem ? opsFor(nextItem)[0] : 'contains';
                    setFilters((prev) => prev.map((x, j) => (j === i ? { itemId: e.target.value, op } : x)));
                  }}
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>

                <select
                  className={`${FIELD} sm:w-[128px]`}
                  value={f.op}
                  aria-label="条件"
                  onChange={(e) => {
                    const op = e.target.value as WikiViewFilter['op'];
                    setFilters((prev) => prev.map((x, j) => (j === i ? { ...x, op } : x)));
                  }}
                >
                  {ops.map((op) => (
                    <option key={op} value={op}>{FILTER_OP_LABEL[op]}</option>
                  ))}
                </select>

                {item && opNeedsValue(f.op) && (
                  <span className="min-w-0 flex-1 sm:w-[160px] sm:flex-none">
                    <ValueInput
                      item={item}
                      value={f.value}
                      onChange={(v) => setFilters((prev) => prev.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                    />
                  </span>
                )}

                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="この絞り込みを削除"
                  onClick={() => setFilters((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={items.length === 0}
            onClick={() => {
              const first = items[0];
              if (first) setFilters((prev) => [...prev, { itemId: first.id, op: opsFor(first)[0] }]);
            }}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            絞り込みを追加
          </Button>
        </section>

        {/* 並べ替え */}
        <section className="flex flex-col gap-2">
          <h3 className={SECTION}>並べ替え</h3>
          {sorts.map((s, i) => (
            <div key={`${s.itemId}-${i}`} className="flex flex-wrap items-center gap-1.5">
              <select
                className={`${FIELD} sm:w-[160px]`}
                value={s.itemId}
                aria-label="並べ替える項目"
                onChange={(e) => setSorts((prev) => prev.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
              >
                {items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
              <select
                className={`${FIELD} sm:w-[128px]`}
                value={s.dir}
                aria-label="並び順"
                onChange={(e) => setSorts((prev) => prev.map((x, j) => (j === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}
              >
                <option value="asc">小さい順</option>
                <option value="desc">大きい順</option>
              </select>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="この並べ替えを削除"
                onClick={() => setSorts((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            disabled={items.length === 0}
            onClick={() => {
              const first = items[0];
              if (first) setSorts((prev) => [...prev, { itemId: first.id, dir: 'asc' }]);
            }}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            並べ替えを追加
          </Button>
          <p className="text-sub-sm text-muted-foreground">
            何も入れないときは、行を追加した順に並びます。
          </p>
        </section>

        {/* 表示する列 */}
        <section className="flex flex-col gap-2">
          <h3 className={SECTION}>表に出す列</h3>
          {items.map((it) => (
            <label key={it.id} className="flex min-h-tap items-center gap-2 text-sub text-foreground lg:min-h-0">
              <input
                type="checkbox"
                className="h-4 w-4 rounded-control border-border accent-primary"
                checked={shown.includes(it.id)}
                onChange={(e) => {
                  const base = shown;
                  const next = e.target.checked ? [...base, it.id] : base.filter((c) => c !== it.id);
                  // 定義の順に揃える（チェックした順にすると列が入れ替わって見える）
                  setColumns(items.map((x) => x.id).filter((id) => next.includes(id)));
                }}
              />
              {it.name}
            </label>
          ))}
          <p className="text-sub-sm text-muted-foreground">
            すべてに印を付けると、項目を追加したときにも自動で列が増えます。
          </p>
        </section>
      </div>
    </Sheet>
  );
}
