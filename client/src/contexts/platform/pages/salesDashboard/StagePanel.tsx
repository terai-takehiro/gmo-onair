/**
 * 「ステージ別」(v4 ①)
 *
 * 受注に近い順に、件数と想定金額を並べます。**棒の長さは金額**です
 * (件数にすると、小さい案件が多いステージが太く見えて判断を誤ります)。
 *
 * 金額は `expected_amount` (想定額) の合計で、`GET /dashboard/pipeline` が返します。
 * **案件一覧のボードと同じ数字**です — v4 でボードを一覧の「見え方」に畳んだとき、
 * 一覧が確定売上・ボードが想定金額を足していて数字が合わない問題を直しました。
 *
 * 棒の色はステージのバッジと**同じ進み具合の並び** (灰 → 淡い青 → 青 → 緑)。
 * 生のパレットは使わず、状態の色トークンから選びます。
 */
import { Link } from 'react-router-dom';
import { manYen } from '@gmo-onair/shared/src/client/ui/numbers';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { STAGE_CHIPS } from '@/contexts/sales/pages/projectList/stages';
import type { ProjectStage } from '@/types';
import { Panel } from './Panel';
import type { PipelineStage } from './types';

/** 受注に近い順。**ここに出すのは進行中のステージだけ** (完了・失注は動かないので出さない) */
const ORDER: ProjectStage[] = ['a_won', 'b_verbal', 'c_proposal', 'd_hold', 'neta'];

const BAR: Record<string, string> = {
  a_won: 'bg-success',
  b_verbal: 'bg-primary',
  c_proposal: 'bg-primary/60',
  d_hold: 'bg-primary/30',
  neta: 'bg-muted-foreground/30',
};

function labelOf(stage: ProjectStage): string {
  return STAGE_CHIPS.find((c) => c.stages.length === 1 && c.stages[0] === stage)?.label ?? stage;
}

export function StagePanel({ stages }: { stages: PipelineStage[] }) {
  const by = new Map(stages.map((s) => [s.stage, s]));
  const rows = ORDER.map((stage) => ({
    stage,
    label: labelOf(stage),
    count: Number(by.get(stage)?.count ?? 0),
    amount: Number(by.get(stage)?.total_amount ?? 0),
  }));
  // 棒の基準は**この画面に出ている中の最大額**。全社の総額を基準にすると全部が細くなる
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const total = rows.reduce((n, r) => n + r.count, 0);

  return (
    <Panel title="ステージ別" note="受注に近い順。棒は金額の大きさです" to="/sales/projects?view=board" toLabel="ボードで見る">
      {total === 0 ? (
        <EmptyState title="進行中の案件がありません" description="ネタを入れると、ここに積み上がっていきます。" />
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((r) => (
            <Link
              key={r.stage}
              to={`/sales/projects?stage=${r.stage}`}
              className="rounded-note flex min-h-tap items-center gap-3 px-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[34px]"
            >
              <span className="text-list w-[6.5rem] shrink-0 truncate">{r.label}</span>
              <span className="font-number text-list w-8 shrink-0 text-right">{r.count}</span>
              <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className={`v4-bar block h-full rounded-full ${BAR[r.stage]}`}
                  style={{ width: `${Math.round((r.amount / max) * 100)}%` }}
                />
              </span>
              {/* 金額は右端で桁を揃える。**万円まで**に丸めるのは、ここで見たいのが大小だけだから */}
              <span className="font-number text-sub w-24 shrink-0 text-right text-muted-foreground">
                {r.amount > 0 ? manYen(r.amount) : '—'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}
