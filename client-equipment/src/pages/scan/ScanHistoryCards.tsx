/**
 * さっき読んだもの — スマホ（カード積み）
 *
 * PC の `Row` 表をそのまま縮めない（このプロジェクトの決めごと）。
 * 見つかった／見つからなかったを**色と印で先に見分けられる**カードにする —
 * 現場で読み終えた直後にざっと確かめる画面なので、文字を読む前に
 * 「これは開ける・これは貼り直しが要る」が分かる形にする
 * （`production/pages/holds/HoldCards.tsx` と同じ考え方）。
 */
import { CheckCircle2, History, TriangleAlert } from 'lucide-react';
import { Delayed, EmptyState, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { hm, type ScanRow } from './useScanHistory';

export function ScanHistoryCards({
  rows, isLoading, onOpen,
}: {
  rows: ScanRow[];
  isLoading: boolean;
  onOpen: (equipmentId: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="scan-history-m">
      <div className="v4-eyebrow flex items-center gap-1.5 text-muted-foreground">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        <h2 id="scan-history-m">さっき読んだもの</h2>
      </div>

      {isLoading ? (
        <Delayed><div className="flex flex-col gap-2"><SkeletonCard /><SkeletonCard /></div></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState title="まだ読んでいません" description="カメラで読むか、ID を打つとここに残ります。" />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const found = !!r.equipment_id;
            const body = (
              <>
                <span className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  found ? 'bg-success-surface text-success' : 'bg-warning-surface text-warning',
                )}>
                  {found
                    ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    : <TriangleAlert className="h-5 w-5" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-list block truncate font-bold">
                    {r.equipment_name ?? '見つかりませんでした'}
                  </span>
                  <span className="text-sub mt-0.5 block truncate text-muted-foreground">
                    <span className="font-number">{r.raw_code}</span>
                    {r.unit_number != null && ` ・ No.${r.unit_number}`}
                  </span>
                </span>
                <span className="font-number text-sub-sm shrink-0 text-muted-foreground">{hm(r.scanned_at)}</span>
              </>
            );
            const cls = cn(
              'rounded-card flex min-h-tap items-center gap-3 border p-3 text-left',
              found
                ? 'border-border bg-card active:bg-muted'
                : 'border-warning-border bg-warning-surface',
            );
            return found ? (
              <button key={r.id} type="button" className={cls} onClick={() => onOpen(r.equipment_id as string)}>
                {body}
              </button>
            ) : (
              <div key={r.id} className={cls}>{body}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}
