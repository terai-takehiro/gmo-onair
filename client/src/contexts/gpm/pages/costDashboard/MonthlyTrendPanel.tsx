/**
 * 月次コスト推移（コスト側ダッシュボード）
 * — 2026年10月の事業再編・P3（`docs/reorg-2026-10-plan.md` §4.7）
 *
 * `GET /gpm/cost-dashboard` の `monthly_trend`（確定した仕入を
 * `recognition_date` の月で束ねた合計）を簡易な棒グラフで見せる。
 *
 * ── グラフ描画ライブラリはこのリポジトリに無い ─────────────────
 *
 * `recharts` / `chart.js` の類はどのアプリにも入っていない。案件管理
 * ダッシュボードの「ステージ別」（`platform/pages/salesDashboard/StagePanel.tsx`）
 * と同じ「棒の長さ＝金額・横に伸ばす」考え方をそのまま流用する。
 * **縦棒（月を横に並べる）にしなかったのは `.v4-bar` のため** —
 * `tokens-v4.css` の `.v4-bar` は `scaleX`（左端から幅を伸ばす）アニメーションで、
 * 縦方向の高さには効かない。横棒ならこの既存アニメーションをそのまま使える。
 *
 * 月は新しい順に並べ替えない（**サーバーが返す昇順のまま** — 時系列として
 * 上から下へ読む表なので、一覧のように新しい順に直すと読み違える）。
 */
import { TrendingUp } from 'lucide-react';
import { formatMonth } from '@gmo-onair/shared/src/client/format';
import { manYen } from '@gmo-onair/shared/src/client/ui/numbers';
import type { CostMonthlyTrendPoint } from '../../queries';
import { Panel } from '../dashboard/Panel';

export function MonthlyTrendPanel({ trend }: { trend: CostMonthlyTrendPoint[] }) {
  const max = Math.max(1, ...trend.map((t) => t.total));

  return (
    <Panel
      title="月次コスト推移"
      note="確定した仕入の計上月ベース"
      icon={<TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />}
    >
      {trend.length === 0 ? (
        <p className="text-sub text-muted-foreground">確定した仕入がまだありません。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {trend.map((t) => (
            <div key={t.month} className="flex items-center gap-3">
              <span className="text-list w-24 shrink-0 truncate">{formatMonth(t.month)}</span>
              <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="v4-bar block h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((t.total / max) * 100)}%` }}
                />
              </span>
              <span className="font-number text-sub w-28 shrink-0 text-right text-muted-foreground">
                {manYen(t.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
