/**
 * ラック図の左の一覧（v4 大④・モックの左カラム）
 *
 * ── 12本を横に並べるのをやめた ──────────────────────────────
 *
 * これまでは**ラックを全部横に並べて**、右へスクロールして目的の1本を探す形でした。
 * 12本あると1本が画面に収まらず、**どのラックを見ているかも分からなくなります**
 * （見出しは各ラックの上に小さく出るだけ）。
 *
 * モックのとおり **左に一覧・右に1本** にしました。一覧には
 * 実装U／総U の帯を出すので、**どこが埋まっているか**が一目で分かります。
 *
 * **印刷は今までどおり全部のラックを出します** — 画面で1本ずつ見るのと、
 * 紙に全部並べるのは別の用途です。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';

export interface RackSummary {
  id: string;
  name: string;
  units: number;
  used: number;
  branchName: string | null;
  where: string | null;
}

/** 実装U ／ 総U から帯の色を決める。**満杯に近いほど濃く**（足せないことが分かる） */
function barTone(ratio: number): string {
  if (ratio >= 0.9) return 'bg-destructive';
  if (ratio >= 0.7) return 'bg-warning';
  return 'bg-primary';
}

export function RackList({
  racks, value, onChange,
}: {
  racks: RackSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[296px]">
      {racks.map((r) => {
        const on = r.id === value;
        const ratio = r.units > 0 ? r.used / r.units : 0;
        return (
          <button
            key={r.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(r.id)}
            className={cn(
              'rounded-card border px-3.5 py-3 text-left',
              on ? 'border-primary bg-primary-surface' : 'border-border bg-card',
            )}
          >
            <span className="flex items-center gap-2">
              <span className="text-list min-w-0 flex-1 truncate font-bold">{r.name}</span>
              <span className="font-number text-note w-14 shrink-0 text-right text-muted-foreground">
                {r.units}U
              </span>
            </span>

            {(r.branchName || r.where) && (
              <span className="mt-1.5 flex items-center gap-1.5">
                {r.branchName && (
                  <span className="rounded-note text-badge inline-flex h-5 shrink-0 items-center justify-center bg-surface-subtle px-1.5 font-bold text-secondary-foreground">
                    {r.branchName}
                  </span>
                )}
                <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">{r.where}</span>
              </span>
            )}

            <span className="mt-2 flex items-center gap-2">
              <span className="block h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={cn('block h-2 rounded-full', barTone(ratio))} style={{ width: `${Math.round(ratio * 100)}%` }} />
              </span>
              <span className="font-number text-note w-[74px] shrink-0 text-right text-muted-foreground">
                実装 {r.used}U
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
