/**
 * デイリーニュース報告 (`/news`) (v4)
 *
 * AI が業界のニュースを毎日集め、人が「採用 (1〜5)」を付けたり足したりする画面。
 *
 * ── v4 で変えたところ ────────────────────────────────────────
 *
 * ・**表と カード の二重実装をやめた** (`news/NewsRows.tsx` の1本に)。
 *   列幅も 52px / 64px / 90px / 180px の直書きから7段に寄せた
 * ・**絞り込みチップを足した。** 20件を超える日があり、
 *   「採用が付いているものだけ見たい」「AI 活用のものだけ見たい」が
 *   目で拾う作業になっていた。**押す前に件数が見える**形にする
 * ・`window.confirm` を `confirmAction` に置き換えた (削除は元に戻せない)
 *
 * ── 「週報に送る」(モックのボタン・migration 167) ────────────
 *
 * 行の右にあります。押すと**その日が属する週の週報へ写します**
 * （移すのではなく写す — ニュースはその日の記録として残り続けるため）。
 * 週は**ニュースの日付**で決まるので、金曜のぶんを月曜に送っても
 * 先週の週報に入ります。2回押しても増えません。
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddItem, useEnsureReport, useReportByPeriod, useReviewReport } from '@/lib/reportsApi';
import { usePermissions } from '@/hooks/usePermissions';
import { addDays, formatDateJa, toDateStr, weekStartOf, type OpsReportItem } from '@/lib/types';
import { NewsForm, type NewsFields } from './news/NewsForm';
import { NewsCards } from './news/NewsCards';
import { NewsRow, NewsRowsHeader } from './news/NewsRows';

type Chip = 'all' | 'picked' | 'ai' | 'human';

const CHIP_LABELS: Record<Chip, string> = {
  all: 'すべて',
  picked: '採用',
  ai: 'AI活用',
  human: '人が足したもの',
};

/** チップの意味。**行の見た目ではなく DB の値で決める** (AI活用 = `ai_related` の列) */
function matchesChip(item: OpsReportItem, chip: Chip): boolean {
  switch (chip) {
    case 'picked': return item.pick != null;
    case 'ai': return !!item.ai_related;
    case 'human': return item.source !== 'ai';
    default: return true;
  }
}

export default function DailyNewsPage() {
  const isMobile = useIsMobile();
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [chip, setChip] = useState<Chip>('all');
  const [adding, setAdding] = useState(false);
  const report = useReportByPeriod('daily_news', date);
  /*
   * 送り先の週報が**確定済みかどうか**。確定した週報には足せません
   * （サーバーが断ります）。引かずにボタンだけ出すと、押した人には
   * 「壊れた」ようにしか見えないので、**押す前に理由を出します**。
   */
  const weekly = useReportByPeriod('weekly_activity', weekStartOf(date));
  const weeklyLocked = weekly.data?.status === 'published';
  const { canEdit } = usePermissions();
  const ensure = useEnsureReport();
  const review = useReviewReport();
  const addItem = useAddItem();
  const today = toDateStr(new Date());

  const items = useMemo(() => report.data?.items ?? [], [report.data]);
  const counts = useMemo(() => ({
    all: items.length,
    picked: items.filter((i) => matchesChip(i, 'picked')).length,
    ai: items.filter((i) => matchesChip(i, 'ai')).length,
    human: items.filter((i) => matchesChip(i, 'human')).length,
  }), [items]);
  const visible = useMemo(() => items.filter((i) => matchesChip(i, chip)), [items, chip]);

  const submitNew = async (fields: NewsFields) => {
    try {
      const reportId = report.data?.id ?? (await ensure.mutateAsync({ kind: 'daily_news', period_key: date })).id;
      await addItem.mutateAsync({ reportId, item: fields });
      setAdding(false);
      notifySuccess('ニュースを足しました');
    } catch (e) {
      notifyApiError('足せませんでした', e);
    }
  };

  const onReview = () => {
    if (!report.data) return;
    review.mutate(report.data.id, {
      onSuccess: () => notifySuccess('確認済みにしました'),
      onError: (e) => notifyApiError('確認済みにできませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="デイリーニュース報告"
        sub="AI が業界のニュースを毎日集めます。人が採用（1〜5）を付けたり、足したりします"
        primaryAction={canEdit && !adding ? (
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />ニュースを足す
          </Button>
        ) : undefined}
      >
        {/*
          日付を選ぶ。**先の日付は選べない** (まだ起きていないニュースは無い)。
          **端末のカレンダーに任せる**（自作の日付ホイールは作らない・
          `client-v4/mobile.ts` の `duePresets()` と同じ決めごと）。
          スマホは PC と同じ幅固定の小さな欄のままだった（v4ネイティブUI監査
          2026-08-20 指摘）ので、**帯いっぱいに広げ、今日へ戻る近道を足した**。
        */}
        <div className={cn('flex items-center gap-1.5', isMobile && 'w-full')}>
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => setDate(addDays(date, -1))} aria-label="前の日">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="日付"
            className={isMobile ? 'min-w-0 flex-1' : 'w-[9.5rem]'}
          />
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setDate(addDays(date, 1))}
            disabled={date >= today}
            aria-label="次の日"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {isMobile && date !== today && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setDate(today)}>今日</Button>
          )}
        </div>
      </PageHeader>

      {/* その日の状態 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-cardtitle">{formatDateJa(date)}</span>
        {report.data && (
          report.data.reviewed_at
            ? <TableBadge label="確認済み" w={null} className="border-success-border bg-success-surface text-success" />
            : <TableBadge label="未確認" w={null} className="border-ai-border bg-ai-surface text-ai" />
        )}
        {report.data && canEdit && !report.data.reviewed_at && (
          <Button variant="outline" onClick={onReview} disabled={review.isPending}>
            <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden="true" /> 確認済みにする
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <FilterChips
          label="ニュースを絞り込む"
          items={(Object.keys(CHIP_LABELS) as Chip[]).map((k) => ({
            key: k, label: CHIP_LABELS[k], count: counts[k],
          }))}
          value={chip}
          onChange={(k) => setChip(k as Chip)}
        />
      )}

      {report.isError ? (
        <ErrorPanel title="この日のニュースを読み込めませんでした" error={report.error} onRetry={() => report.refetch()} />
      ) : report.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : (
        <div className={isMobile ? undefined : 'rounded-card border border-border bg-card'}>
          {items.length === 0 ? (
            <EmptyState
              className={isMobile ? undefined : 'border-0 bg-transparent'}
              icon={<Sparkles />}
              title={`${formatDateJa(date)} のニュースはまだありません`}
              description={date === today
                ? 'AI が毎日集めます。待てないときは「ニュースを足す」から自分で入れられます。'
                : 'この日は AI が集めた記録も、人が足した記録もありません。'}
            />
          ) : visible.length === 0 ? (
            <NoSearchResults
              className={isMobile ? undefined : 'border-0 bg-transparent'}
              activeFilters={[`絞り込み: ${CHIP_LABELS[chip]}`]}
              onClearFilters={() => setChip('all')}
            />
          ) : isMobile ? (
            <PullToRefresh onRefresh={report.refetch}>
              <NewsCards items={visible} canEdit={canEdit} weeklyLocked={weeklyLocked} />
            </PullToRefresh>
          ) : (
            <div className="flex flex-col">
              <NewsRowsHeader canEdit={canEdit} />
              {visible.map((item) => (
                <NewsRow key={item.id} item={item} canEdit={canEdit} weeklyLocked={weeklyLocked} />
              ))}
            </div>
          )}

          {canEdit && adding && (
            <NewsForm
              onCancel={() => setAdding(false)}
              onSubmit={submitNew}
              submitting={addItem.isPending || ensure.isPending}
            />
          )}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        「採用」の数字は、週報に書くときの目印です。
        各行の<strong className="font-bold">送るボタン</strong>を押すと、
        その日が入る週のウィークリー活動報告へ写せます（週報側に「ニュース由来」と出ます）。
        <strong className="font-bold">自動では送られません</strong> — 選ぶのは人です。
        {weeklyLocked && (
          <> この日が入る週の週報は<strong className="font-bold">確定済み</strong>なので、
          いまは送れません（週報の画面で「確定を解く」を押すと送れるようになります）。</>
        )}
      </p>
    </div>
  );
}
