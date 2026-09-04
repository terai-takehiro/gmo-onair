/**
 * 営業見通し（パイプライン）— ① 財務ダッシュボードのサブセクション（2026-09 依頼）
 *
 * ── 何のためのカードか ────────────────────────────────────────
 *
 * ご依頼:「案件を『受注済』にしないと売上への反映や仕入登録ができないため、
 * 受注前案件を含めた営業見通し・売上見込み・粗利見込みを把握しづらい」。
 * 売上・仕入の新規登録は v4.5.23 で全フェーズ（失注を除く）に既に開放済み
 * （`project.service.ts` の `getRegisterableProjects`）。このカードは、
 * そうやって**フェーズを問わず登録された売上・仕入予定額**を、
 *   ① パイプライン総額（フェーズに関係なく100%で合算）
 *   ② 確度加味見込み（フェーズごとの確度を掛けて合算）
 * の2通りで見せる。集計は `GET /pipeline-forecast`（`pipeline-forecast.service.ts`）
 * が出す——`ProfitFlow`/`monthly-summary.service.ts` と同じく**画面では足し算し直さない**。
 *
 * ── 実績（`ProfitFlow`）とは別軸 ────────────────────────────────
 *
 * `ProfitFlow` の「売上」は**確定売上だけ**（`revenues.status='confirmed'`）を、
 * 選んだ期間で数える「実績」。このカードは**状態も期間も問わず**、失注以外の
 * 全案件に登録されている売上・仕入をフェーズの確度で重みづけた「見通し」——
 * 数え方も期間も違う2つの数字なので、混ざらないように別カードにしてある。
 *
 * ── 確度は設定「お金のルール」から調整できる ──────────────────
 *
 * 初期値（E10%/D25%/C50%/B80%/A100%）はご依頼どおりだが、`project_stage_probabilities`
 * テーブルに持ち、`設定 > お金のルール`（`StageProbabilities.tsx`）から変えられる。
 * ここでは値そのものは持たず、サーバーが返す `byStage`（未使用だが将来の内訳表示に
 * 備えて保持）／`weighted` を出すだけにする。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';

interface ForecastTotals {
  revenue: number;
  purchase: number;
  grossProfit: number;
  /** 粗利率（0〜1の割合）。売上見込みが0のときは null（算出できない） */
  grossMarginRate: number | null;
}

interface PipelineForecastData {
  total: ForecastTotals;
  weighted: ForecastTotals;
}

type ForecastMode = 'total' | 'weighted';

const MODE_LABEL: Record<ForecastMode, string> = { total: '総額', weighted: '確度加味' };

function pctLabel(rate: number | null): string {
  return rate == null ? '—' : `${(rate * 100).toFixed(1)}％`;
}

export function PipelineForecast({ projectId }: { projectId: string }) {
  const [forecastMode, setForecastMode] = useState<ForecastMode>('weighted');

  const q = useQuery<PipelineForecastData>({
    queryKey: ['pipeline-forecast', projectId],
    queryFn: async () => (await api.get('/pipeline-forecast', {
      params: projectId ? { project_id: projectId } : {},
    })).data.data,
  });

  if (q.isError) {
    return (
      <ErrorPanel title="営業見通しを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
    );
  }
  if (q.isLoading || !q.data) {
    return <Delayed><SkeletonRows rows={2} /></Delayed>;
  }

  const t = q.data[forecastMode];

  return (
    <section className="rounded-card flex flex-col gap-3 border border-border bg-card p-3 lg:px-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-primary-surface">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <span className="text-cardtitle">営業見通し（パイプライン）</span>
        </div>
        <div
          role="group"
          aria-label="集計方法"
          className="rounded-control inline-flex shrink-0 overflow-hidden border border-border"
        >
          {(['total', 'weighted'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setForecastMode(m)}
              aria-pressed={forecastMode === m}
              className={cn(
                'min-h-tap px-3 text-sub lg:min-h-[32px]',
                forecastMode === m
                  ? 'bg-primary font-bold text-primary-foreground'
                  : 'text-secondary-foreground hover:bg-muted',
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-note border border-border-faint bg-surface-subtle p-3">
          <div className="text-note text-muted-foreground">売上見込み</div>
          <Money value={t.revenue} inline className="text-h2 font-bold" />
        </div>
        <div className="rounded-note border border-border-faint bg-surface-subtle p-3">
          <div className="text-note text-muted-foreground">仕入見込み</div>
          <Money value={t.purchase} inline className="text-h2 font-bold" />
        </div>
        <div className="rounded-note border border-border-faint bg-surface-subtle p-3">
          <div className="text-note text-muted-foreground">粗利見込み</div>
          <Money value={t.grossProfit} inline negativeIsDanger className="text-h2 font-bold" />
        </div>
        <div className="rounded-note border border-border-faint bg-surface-subtle p-3">
          <div className="text-note text-muted-foreground">粗利率</div>
          <div className={cn(
            'font-number text-h2 font-bold',
            t.grossMarginRate != null && t.grossMarginRate < 0 && 'text-destructive',
          )}
          >
            {pctLabel(t.grossMarginRate)}
          </div>
        </div>
      </div>

      <p className="text-note text-muted-foreground">
        {forecastMode === 'total'
          ? '案件フェーズに関係なく、登録済みの売上・仕入予定額をそのまま合算しています（失注は含みません）。'
          : '案件フェーズごとの確度（設定「お金のルール」で調整できます）を掛けて合算しています。'}
        {' '}
        期間の絞り込みとは関係なく、いま生きている案件の見通しです（ダッシュボード上部の「損益の流れ」は確定売上ベースの実績で、こちらとは別軸です）。
      </p>
    </section>
  );
}
