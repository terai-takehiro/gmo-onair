/**
 * 料金表の場所タブと、空の場所の始め方（v4 大③・モックの ⑧ 上辺）
 *
 * ── 空の場所を「壊れている」と読ませない ────────────────────
 *
 * 渋谷・青山は本当に料金が未定です。ふつうの `EmptyState`（「まだありません」）
 * だけだと、**入っているはずのものが消えた**ように読めます。
 * ここでは「この場所の料金はまだ決まっていません」と言い切り、
 * **始め方を2つ**出します。
 */
import { Building2, Copy, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { PricingLocation } from './locations';

export function LocationTabs({
  locations, value, onChange,
}: {
  locations: PricingLocation[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (locations.length <= 1) return null;
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="場所">
      {locations.map((l) => {
        const on = l.id === value;
        return (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(l.id)}
            className={cn(
              'rounded-control min-h-tap flex min-w-[9rem] flex-col items-start gap-0.5 border px-3.5 py-2 text-left lg:min-h-[48px]',
              on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
            )}
          >
            <span className="text-sub font-bold">{l.name}</span>
            <span className={cn('font-number text-note', on ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
              {/* **0 件でも数字を出す。** 「未登録」とだけ書くと、
                  読み込めていないのか本当に無いのかが分からない */}
              {l.item_count > 0 ? `${l.item_count} 品目` : '料金は未定'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EmptyTable({
  locationName, sources, canEdit, copying, onCopy, onStartEmpty,
}: {
  locationName: string;
  /** 写せる元。**中身のある場所だけ**（空を写しても意味が無い） */
  sources: PricingLocation[];
  canEdit: boolean;
  copying: boolean;
  onCopy: (fromId: string) => void;
  onStartEmpty: () => void;
}) {
  return (
    <section className="rounded-card flex flex-col items-center gap-3 border border-border bg-card px-4 py-10 text-center">
      <span className="rounded-control-lg inline-flex h-12 w-12 items-center justify-center bg-surface-subtle">
        <Building2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-cardtitle">{locationName} の料金はまだ決まっていません</h2>
        <p className="text-sub mt-1 text-muted-foreground">
          料金表は場所ごとに別です。ほかの場所の値段がここに出ることはありません。
        </p>
      </div>

      {canEdit && (
        <div className="mt-1 flex flex-col items-center gap-2 sm:flex-row">
          {sources.map((s) => (
            <Button key={s.id} variant="outline" disabled={copying} onClick={() => onCopy(s.id)}>
              {copying
                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {s.name} の料金表を写す
            </Button>
          ))}
          <Button onClick={onStartEmpty}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />空から作る
          </Button>
        </div>
      )}

      {canEdit && sources.length > 0 && (
        <p className="text-note max-w-md text-muted-foreground">
          写したあと、<strong className="font-bold">金額はこの場所のぶんだけ直せます</strong>
          （元の場所の料金は変わりません）。写せるのは空のときだけです — 2回写すと同じ品目が2つ並び、
          どちらを選んだかで金額が変わってしまいます。
        </p>
      )}
    </section>
  );
}
