/**
 * 営業レビュー — 失注分析タブ (v4)
 *
 * 計算は旧実装のまま（`sales-analytics.service.ts` の `getLostReasonAnalysis`）。
 */
import { Hash, Wallet, Scale } from 'lucide-react';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { manYen } from '@gmo-onair/shared/src/client/ui/numbers';
import { formatDate } from '@/lib/format';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Panel } from './Panel';
import { Strip, type StripItem } from './Strip';
import type { LostAnalysis } from './types';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function LostPanel({ lost, year }: { lost: LostAnalysis; year: number }) {
  const kpis: StripItem[] = [
    { key: 'count', label: '失注件数', icon: Hash, value: String(lost.total_lost), unit: '件' },
    { key: 'amount', label: '失注金額合計', icon: Wallet, value: manYen(lost.total_lost_amount) },
    { key: 'avg', label: '平均失注金額', icon: Scale, value: manYen(lost.avg_lost_amount) },
  ];

  const trend = lost.monthly_trend;
  const maxTrend = Math.max(1, ...trend.map((t) => t.count ?? 0));

  return (
    <div className="flex flex-col gap-3.5">
      <Strip items={kpis} />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <Panel title="失注理由の内訳">
          {lost.total_lost === 0 ? (
            <EmptyState title="失注データがありません" description="選んだ期間に失注案件がありません。" />
          ) : (
            <div className="flex flex-col gap-3">
              {lost.reasons.map((r) => {
                const pct = lost.total_lost > 0 ? Math.round((r.count / lost.total_lost) * 100) : 0;
                return (
                  <div key={r.reason}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-list truncate">{r.reason || '理由未設定'}</span>
                      <span className="text-note shrink-0 text-muted-foreground">{r.count}件（{pct}%）</span>
                    </div>
                    <span className="relative flex h-5 overflow-hidden rounded bg-muted">
                      <span className="v4-bar h-full rounded bg-destructive/70" style={{ width: `${pct}%` }} />
                      <span className="font-number absolute inset-0 flex items-center justify-end px-2 text-note">
                        {manYen(r.total_amount)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title={`月別失注推移（${year}年）`}>
          {trend.length === 0 ? (
            <EmptyState title="月別の推移データがありません" />
          ) : (
            <div className="flex flex-col gap-2">
              {MONTHS.map((m) => {
                const d = trend.find((t) => parseInt(t.month) === m);
                const count = d?.count ?? 0;
                const amount = d?.total_amount ?? 0;
                const w = (count / maxTrend) * 100;
                return (
                  <div key={m} className="flex items-center gap-3">
                    <span className="text-note w-8 shrink-0 text-right">{m}月</span>
                    <span className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                      {w > 0 && <span className="v4-bar block h-full rounded bg-destructive/70" style={{ width: `${w}%` }} />}
                    </span>
                    <span className="font-number text-note w-12 shrink-0 text-right">{count}件</span>
                    <span className="font-number text-note hidden w-20 shrink-0 text-right text-muted-foreground sm:block">
                      {amount > 0 ? manYen(amount) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {lost.lessons.length > 0 && (
        <Panel title="教訓・学び">
          <div className="flex flex-col gap-2">
            {lost.lessons.map((l) => (
              <div key={l.id} className="rounded-note border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-list truncate font-bold">
                      {l.gls_number || l.code} {l.name}
                    </p>
                    <p className="text-note text-muted-foreground">
                      {l.customer_short_name || l.customer_name} ・ {formatDate(l.lost_at)} ・ {l.lost_reason}
                    </p>
                  </div>
                  <MoneyCell value={l.expected_amount} width={96} className="shrink-0 text-destructive" />
                </div>
                <p className="text-sub mt-1.5 rounded-note bg-surface-subtle p-2">{l.lessons_learned}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
