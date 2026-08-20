/**
 * ① ダッシュボード上辺の数字（GPM）— スマホ版（2026-08・v4ネイティブUI化）
 *
 * ── きっかけ（監査）────────────────────────────────────────
 *
 * `docs/v4-native-ui-audit-2026-08-20.md`: 「KPI帯（KpiStrip.tsx）はモバイルで
 * 単純に5枚が縦積みになるだけ」。PC の帯をそのまま縦に伸ばすと、いちばん見たい
 * 「動いているプロジェクト」に着くまでに5枚ぶん（約260px）スクロールすることになる。
 *
 * ── ウィジェット × 横スワイプにした ──────────────────────────
 *
 * iOS の「今日」ウィジェットのように**1枚ずつの独立したカード**にして、
 * 横に払って読む形にした（`client-v4/rail.ts` の掴んで滑らせるレール）。
 * 縦は最初の1枚ぶん（約90px）で済み、続きがあることは右端の溶け方で分かる。
 *
 * ── 中身は PC と1本化 ──────────────────────────────────────
 *
 * 数字の意味・並び・危険色の判定は `KpiStrip.tsx` の `kpiCells()` を読む。
 * 書き写すと、片方だけ直したときに同じ画面で数字の意味が食い違う。
 */
import { Link } from 'react-router-dom';
import { useRail } from '@gmo-onair/shared/src/client-v4/rail';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { kpiCells, KpiCellBody, type Cell, type GpmKpis } from './KpiStrip';
import type { GpmEstimateSummary } from '../../queries';

/** モックの「自動で届いたもの」レールと同じ考え方（`IntakeRail.tsx`）で幅を固定する */
const CARD_W = 'w-[168px]';  // ui-tokens-ok: レールのカードは 168px 固定

function KpiCard({ c }: { c: Cell }) {
  const body = (
    <span
      className={cn(
        'v4-press rounded-card block h-full border p-3.5',
        c.danger ? 'border-destructive-border bg-destructive-surface' : 'border-border bg-card',
      )}
    >
      <KpiCellBody c={c} />
    </span>
  );
  return c.to ? <Link to={c.to} className="block">{body}</Link> : body;
}

export function MobileKpiRail({ kpis, est }: { kpis: GpmKpis; est?: GpmEstimateSummary }) {
  const rail = useRail();
  const cells = kpiCells(kpis, est);

  return (
    <div
      ref={rail.ref}
      onScroll={rail.onScroll}
      style={rail.style}
      className="v4-rail -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      role="listbox"
      aria-label="プロジェクト管理の数字"
    >
      {cells.map((c) => (
        <div key={c.key} role="option" aria-selected={false} className={cn(CARD_W, 'shrink-0')}>
          <KpiCard c={c} />
        </div>
      ))}
    </div>
  );
}
