/**
 * ① ダッシュボード上辺の数字 — スマホ版（iOS ウィジェット風）
 *
 * ── きっかけ（監査）────────────────────────────────────────
 *
 * `docs/v4-native-ui-audit-2026-08-20.md` equipment-dashboard:
 * 「KPIタイルはPC・スマホ同じ形の角丸カードで、macOS/iOSアプリらしい
 * 差別化されたウィジェット表現が無い」。
 *
 * ── ウィジェット × 横スワイプにした ──────────────────────────
 *
 * PC の2×2グリッドとは別に、スマホだけ**1枚ずつ独立したカードを
 * 横に払って読む形**にした（`client-v4/rail.ts` の掴んで滑らせるレール）。
 * `gpm/pages/dashboard/MobileKpiRail.tsx` と同じ部品・同じ考え方
 * （iOS の「今日」ウィジェットのように読む）。
 *
 * 中身（値・色・行き先）は `kpiCells.ts` の `buildKpiCells()` を
 * PC のグリッド（`Tile`）と共有する。ここでは並べて描くだけ。
 */
import { Link } from 'react-router-dom';
import { useRail } from '@gmo-onair/shared/src/client-v4/rail';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { KpiCell } from './kpiCells';

const CARD_W = 'w-[168px]'; // ui-tokens-ok: レールのカードは168px固定（GPMダッシュボードと同じ幅）

const TONE_CARD: Record<KpiCell['tone'], string> = {
  plain: 'border-border bg-card',
  warning: 'border-warning-border bg-warning-surface',
  danger: 'border-destructive-border bg-destructive-surface',
};

const TONE_TEXT: Record<KpiCell['tone'], string> = {
  plain: 'text-foreground',
  warning: 'text-warning',
  danger: 'text-destructive',
};

export function KpiRail({ cells }: { cells: KpiCell[] }) {
  const rail = useRail();
  return (
    <div
      ref={rail.ref}
      onScroll={rail.onScroll}
      style={rail.style}
      className="v4-rail -mx-3 flex gap-2 overflow-x-auto px-3 pb-1"
      role="listbox"
      aria-label="機材の状況"
    >
      {cells.map((c) => {
        const Icon = c.icon;
        return (
          <div key={c.key} role="option" aria-selected={false} className={cn(CARD_W, 'shrink-0')}>
            <Link
              to={c.to}
              className={cn('v4-press rounded-card flex h-full flex-col gap-2 border p-3.5', TONE_CARD[c.tone])}
            >
              <span className="flex items-center gap-1.5 text-sub text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {c.label}
              </span>
              <span className="flex items-baseline gap-1">
                <span className={cn('font-number text-h1', TONE_TEXT[c.tone])}>
                  {c.value.toLocaleString('ja-JP')}
                </span>
                <span className="text-sub text-muted-foreground">{c.unit}</span>
              </span>
              <span className="text-note truncate text-muted-foreground">{c.sub}</span>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
