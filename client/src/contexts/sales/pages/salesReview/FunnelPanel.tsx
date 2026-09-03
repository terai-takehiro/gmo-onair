/**
 * 営業レビュー — ファネル分析タブ (v4)
 *
 * 計算は旧実装のまま（`sales-analytics.service.ts` の `getFunnelAnalysis`）。
 * 変えたのは並べ方だけ: KPI は帯（`Strip`）に、ステージ別の棒は
 * `platform/pages/salesDashboard/StagePanel.tsx` と同じ色使い（状態の色トークン、生のパレットは使わない）。
 */
import { Link } from 'react-router-dom';
import { BarChart3, TrendingUp, TrendingDown, Target, ArrowRight } from 'lucide-react';
import { Num, manYen } from '@gmo-onair/shared/src/client/ui/numbers';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { ProjectStageLabels, type ProjectStage } from '@/types';
import { Panel } from './Panel';
import { Strip, type StripItem } from './Strip';
import type { FunnelData } from './types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 受注に近い順。ネタから完了・失注までの全段（一覧のチップと違い、ここは終了も出す） */
const ORDER: ProjectStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost'];

/** 棒の色。状態の色トークンから選ぶ（`StagePanel.tsx` と同じ考え方） */
const BAR: Record<ProjectStage, string> = {
  neta: 'bg-muted-foreground/30',
  d_hold: 'bg-primary/30',
  c_proposal: 'bg-primary/60',
  b_verbal: 'bg-primary',
  a_won: 'bg-success',
  r_delivered: 'bg-warning',
  s_completed: 'bg-success/70',
  e_lost: 'bg-destructive/70',
};

export function FunnelPanel({ funnel, year }: { funnel: FunnelData; year: number }) {
  const byStage = new Map(funnel.stage_counts.map((s) => [s.stage, s]));
  const rows = ORDER.map((stage) => ({
    stage,
    count: Number(byStage.get(stage)?.count ?? 0),
    amount: Number(byStage.get(stage)?.total_amount ?? 0),
    conversion: funnel.conversions.find((c) => c.from === stage),
  }));
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  const kpis: StripItem[] = [
    { key: 'total', label: 'ヨミ総数', icon: BarChart3, value: String(funnel.total_count), unit: '件' },
    { key: 'win', label: '受注率', icon: TrendingUp, value: String(funnel.win_rate), unit: '%' },
    { key: 'loss', label: '失注率', icon: TrendingDown, value: String(funnel.loss_rate), unit: '%' },
    { key: 'dwell', label: '平均滞留', icon: Target, value: String(funnel.avg_dwell_days), unit: '日' },
  ];

  const trend = funnel.monthly_trend;
  const maxTrend = Math.max(1, ...trend.map((t) => (t.won_count ?? 0) + (t.lost_count ?? 0)));

  return (
    <div className="flex flex-col gap-3.5">
      <Strip items={kpis} />

      <Panel title="ステージ別パイプライン">
        <div className="flex flex-col gap-1">
          {rows.map((r) => (
            <div key={r.stage}>
              <Link
                to={r.stage === 'neta' ? '/sales/projects?view=seed' : `/sales/projects?stage=${r.stage}`}
                className="rounded-note flex min-h-tap items-center gap-3 px-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[34px]"
              >
                <span className="text-list w-28 shrink-0 truncate">{ProjectStageLabels[r.stage]}</span>
                <span className="h-6 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                  <span
                    className={`v4-bar block h-full rounded ${BAR[r.stage]}`}
                    style={{ width: `${Math.max((r.count / maxCount) * 100, r.count > 0 ? 3 : 0)}%` }}
                  />
                </span>
                <span className="font-number text-list w-10 shrink-0 text-right"><Num value={r.count} /></span>
                <span className="font-number text-sub w-24 shrink-0 text-right text-muted-foreground">
                  {r.amount > 0 ? manYen(r.amount) : '—'}
                </span>
              </Link>
              {r.conversion && (
                <div className="ml-28 flex items-center gap-1.5 py-0.5 pl-4">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span className="text-note text-muted-foreground">
                    → {ProjectStageLabels[r.conversion.to]}への遷移率:{' '}
                    <span className="font-number font-bold text-foreground">{r.conversion.rate}%</span>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {trend.length > 0 && (
        <Panel title={`月次受注推移（${year}年）`}>
          <div className="flex flex-col gap-2">
            {MONTHS.map((m) => {
              const d = trend.find((t) => parseInt(t.month) === m);
              const won = d?.won_count ?? 0;
              const lost = d?.lost_count ?? 0;
              const wonAmount = d?.won_amount ?? 0;
              const wonW = (won / maxTrend) * 100;
              const lostW = (lost / maxTrend) * 100;
              return (
                <div key={m} className="flex items-center gap-3">
                  <span className="text-note w-8 shrink-0 text-right">{m}月</span>
                  <span className="flex h-4 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                    {wonW > 0 && <span className="h-full bg-success" style={{ width: `${wonW}%` }} />}
                    {lostW > 0 && <span className="h-full bg-destructive/70" style={{ width: `${lostW}%` }} />}
                  </span>
                  <span className="text-note w-28 shrink-0 text-right text-muted-foreground">
                    <span className="font-number font-bold text-success">{won}</span>受注{' '}
                    <span className="font-number text-destructive">{lost}</span>失注
                  </span>
                  <span className="font-number text-note hidden w-20 shrink-0 text-right text-muted-foreground sm:block">
                    {wonAmount > 0 ? manYen(wonAmount) : '—'}
                  </span>
                </div>
              );
            })}
            <div className="mt-1 flex items-center gap-4 border-t border-border-faint pt-2 text-note text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-success" />受注</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-destructive/70" />失注</span>
            </div>
          </div>
        </Panel>
      )}

      {trend.length === 0 && (
        <EmptyState title="月次の推移データがありません" description="通年の絞り込みに切り替えると月ごとの推移が出ます。" />
      )}
    </div>
  );
}
