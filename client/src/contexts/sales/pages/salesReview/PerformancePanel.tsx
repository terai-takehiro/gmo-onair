/**
 * 営業レビュー — 営業評価タブ (v4)
 *
 * 計算は旧実装のまま（`sales-analytics.service.ts` の `getPerformanceReview`）。
 * 表を `Row` / `RowSlot` / `MoneyCell` に置き換えた（列幅は7段から選ぶ・生パレット無し）。
 * **この画面は PC 専用**（`pcOnlyScreens.ts`）なのでスマホ用カードは持たない。
 */
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Row, RowHeader, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { Num } from '@gmo-onair/shared/src/client/ui/numbers';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Panel } from './Panel';
import type { PerformanceRow } from './types';

function achievementTone(rate: number): string {
  if (rate >= 100) return 'bg-success-surface text-success';
  if (rate >= 70) return 'bg-warning-surface text-warning';
  return 'bg-destructive-surface text-destructive';
}

function AchievementBar({ rate }: { rate: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('v4-bar block h-full rounded-full', rate >= 100 ? 'bg-success' : rate >= 70 ? 'bg-warning' : 'bg-destructive')}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </span>
      <span className={cn('rounded-badge shrink-0 px-2 py-0.5 text-note font-bold', achievementTone(rate))}>
        {rate}%
      </span>
    </div>
  );
}

export function PerformancePanel({
  performance, canSetTarget, onOpenTarget,
}: { performance: PerformanceRow[]; canSetTarget: boolean; onOpenTarget: () => void }) {
  const team = performance.reduce(
    (acc, p) => ({
      target_amount: acc.target_amount + p.target_amount,
      won_amount: acc.won_amount + p.won_amount,
      won_count: acc.won_count + p.won_count,
      total_count: acc.total_count + p.total_count,
    }),
    { target_amount: 0, won_amount: 0, won_count: 0, total_count: 0 },
  );
  const teamRate = team.target_amount > 0 ? Math.round((team.won_amount / team.target_amount) * 1000) / 10 : 0;
  const teamWinRate = team.total_count > 0 ? Math.round((team.won_count / team.total_count) * 1000) / 10 : 0;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {performance.length > 0 && (
          <p className="text-sub text-muted-foreground">
            チーム合計: <MoneyCell value={team.won_amount} width={96} className="inline-flex" /> /{' '}
            <MoneyCell value={team.target_amount} width={96} className="inline-flex" />（{teamRate}%）
          </p>
        )}
        {canSetTarget && (
          <Button size="sm" onClick={onOpenTarget} className="ml-auto">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />目標設定
          </Button>
        )}
      </div>

      <Panel title="担当者別 営業評価">
        {performance.length === 0 ? (
          <EmptyState title="まだ担当者別の実績がありません" description="営業目標を決めるか、ヨミを登録すると出てきます。" />
        ) : (
          <div className="overflow-x-auto">
            <RowHeader>
              <RowMain>担当者</RowMain>
              <RowSlot w={128} align="right">目標金額</RowSlot>
              <RowSlot w={128} align="right">受注金額</RowSlot>
              <RowSlot w={160}>達成率</RowSlot>
              <RowSlot w={72} align="right">ヨミ数</RowSlot>
              <RowSlot w={72} align="right">受注数</RowSlot>
              <RowSlot w={72} align="right">受注率</RowSlot>
              <RowSlot w={128} align="right">平均単価</RowSlot>
            </RowHeader>
            {performance.map((p) => (
              <Row key={p.user_id} density="table" divider>
                <RowMain><RowTitle>{p.user_name}</RowTitle></RowMain>
                <MoneyCell value={p.target_amount} width={128} />
                <MoneyCell value={p.won_amount} width={128} className="font-bold" />
                <RowSlot w={160}><AchievementBar rate={p.achievement_rate} /></RowSlot>
                <RowSlot w={72} align="right"><Num value={p.total_count} /></RowSlot>
                <RowSlot w={72} align="right"><Num value={p.won_count} /></RowSlot>
                <RowSlot w={72} align="right"><Num value={p.win_rate} unit="%" /></RowSlot>
                <MoneyCell value={p.avg_deal_size} width={128} />
              </Row>
            ))}
            <Row density="table" className="border-t-2 border-border font-bold">
              <RowMain><RowTitle>チーム合計</RowTitle></RowMain>
              <MoneyCell value={team.target_amount} width={128} />
              <MoneyCell value={team.won_amount} width={128} />
              <RowSlot w={160}><AchievementBar rate={teamRate} /></RowSlot>
              <RowSlot w={72} align="right"><Num value={team.total_count} /></RowSlot>
              <RowSlot w={72} align="right"><Num value={team.won_count} /></RowSlot>
              <RowSlot w={72} align="right"><Num value={teamWinRate} unit="%" /></RowSlot>
              <RowSlot w={128} />
            </Row>
          </div>
        )}
      </Panel>
    </div>
  );
}
