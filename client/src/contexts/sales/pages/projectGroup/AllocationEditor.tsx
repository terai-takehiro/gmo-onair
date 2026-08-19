/**
 * 分け方の選択 ＋ プレビュー（`useAllocation.ts` の見た目側） (v4)
 *
 * 会計用語「按分」は画面に出さない（`docs/wording.md`）。「分け方」「分けた額」と書く
 */
import { CurrencyInput } from '@/components/ui/currency-input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import type { useAllocation } from './useAllocation';

export function AllocationEditor({
  label, alloc, total,
}: {
  /** 「分け方」だけだと何を分けるのか分からないので画面ごとに名指しする（例: 仕入金額） */
  label: string;
  alloc: ReturnType<typeof useAllocation>;
  total: number;
}) {
  if (alloc.preview.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sub font-bold">{label}の分け方</span>
        <div
          role="radiogroup" aria-label={`${label}の分け方`}
          className="inline-flex overflow-hidden rounded-control border border-border"
        >
          {([['equal', '均等に分ける'], ['custom', '任意の比率']] as const).map(([v, text], i) => (
            <button
              key={v} type="button" role="radio" aria-checked={alloc.mode === v}
              onClick={() => alloc.setMode(v)}
              className={`min-h-tap px-3 text-sub lg:min-h-[36px] ${i > 0 ? 'border-l border-border' : ''} ${
                alloc.mode === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground'
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-note space-y-2 border border-border p-3">
        {alloc.preview.map((a) => (
          <div key={a.project_id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sub">
              <span className="font-number mr-1 text-primary">{a.gls_number}</span>
              {a.name}
            </span>
            {alloc.mode === 'custom' ? (
              <CurrencyInput
                value={alloc.custom[a.project_id] || 0}
                onChange={(v) => alloc.setCustom((prev) => ({ ...prev, [a.project_id]: v }))}
                className="w-36 shrink-0"
              />
            ) : (
              <Money value={a.allocated_amount} className="shrink-0 font-bold" />
            )}
          </div>
        ))}
        {alloc.mode === 'custom' && (
          <div className="flex items-center justify-between border-t border-border-faint pt-2 text-sub">
            <span className="font-bold">分けた額の合計</span>
            <span className="flex items-center gap-1">
              <Money value={alloc.previewTotal} className={alloc.previewTotal !== total ? 'text-destructive' : 'font-bold'} />
              <span className="text-muted-foreground">/</span>
              <Money value={total} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
