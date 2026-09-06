/**
 * デイリーニュース報告 (`/news`) (v4)
 *
 * AI が業界のニュースを毎日集め、人が「注目度 (1〜5)」を付けたり足したりする画面。
 *
 * ── v4.5.26 で「日ごとのページ」から「月ごとの1ページ」に集約した ───
 *
 * 以前は日付ナビで1日ぶんだけを表示しており、前の日を見るには1日ずつ戻る
 * しかなかった（過去分を見比べる用途に向いていなかった）。月単位で1ページに
 * 集約し、日付は表の中の見出し行（`NewsDayHeader`）として並べる、
 * ひと続きの「モダンな表」の形にした（`GET /dailyops/reports/items-by-month`）。
 *
 *   ・**機能はそのまま。** 絞り込みチップ・注目度・週報へ送る・編集・削除・
 *     「確認した」はすべて残す。絞り込みは月内の全行を対象に数える
 *   ・**「確認した」はレポート単位（＝日ごと）のまま。** 月をまたいでも
 *     「その日の記録に目を通したか」の意味は変わらないため、日付の見出し行に残した
 *   ・**「週報へ送る」の可否（送り先の週が確定済みか）は行ごとに判定する。**
 *     月をまたぐと行によって送り先の週が違うので、ページ単位の1つの値では表せない
 *     （サーバー側で行ごとに `weekly_locked` を計算して返す）
 *   ・**ニュースを追加する画面には日付欄を足した。** 「いま開いている日」が
 *     無くなったため、どの日の記録として登録するかを選べるようにした
 *     （既定値は今月を見ているときは今日、それ以外はその月の末日）
 *
 * ── AI からの投稿は変えていない ─────────────────────────────────
 *
 * `add_ops_report_items(kind='daily_news', period_key=<日付>)`（MCP）が既存の投稿経路
 * （`docs/mcp-server.md`）。月表示になっても行の追加先は「その日のレポート」のまま。
 *
 * ── UI崩れの調査で見つけた不具合の修正 ─────────────────────────
 *
 * `news/NewsRows.tsx` の `NewsRow` は `isMobile`（`lg`=1023px 境界）が false の
 * ときしか描画されないのに、内部に `sm`(640px) 境界のレスポンシブ指定
 * （`hideOnMobile` / `stackOnMobile`）が残っており、常にデスクトップ扱いで
 * 到達しないデッドコードになっていた。今回削除した（機能・見た目は変えていない —
 * 元々 1024px 以上でしか見えていなかった状態のまま）。
 * また、この画面の主アクション（「ニュースを追加」）は `PageHeader` 側の
 * `sm`(640px) 境界で PC/スマホの置き場所が切り替わるのに、日付ナビの帯は
 * `isMobile`（`lg`=1023px 境界）で `w-full` にしていたため、640〜1023px 幅で
 * ボタンが孤立して折り返されていた。ナビの帯も `sm` に揃えて直した。
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddItem, useEnsureReport, useReportItemsByMonth, useReviewReport } from '@/lib/reportsApi';
import { usePermissions } from '@/hooks/usePermissions';
import {
  addMonths, formatMonthJa, lastDayOfMonth, toDateStr, toMonthStr,
  type OpsReportDayGroup, type OpsReportItem,
} from '@/lib/types';
import { NewsForm, type NewsFields } from './news/NewsForm';
import { NewsCards } from './news/NewsCards';
import { NewsDayHeader, NewsRow, NewsRowsHeader } from './news/NewsRows';

type Chip = 'all' | 'picked' | 'ai' | 'human';

const CHIP_LABELS: Record<Chip, string> = {
  all: 'すべて',
  picked: '注目度あり',
  ai: 'AIの話題',
  human: '手動で追加',
};

/** チップの意味。**行の見た目ではなく DB の値で決める** (AIの話題 = `ai_related` の列) */
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
  const today = toDateStr(new Date());
  const currentMonth = toMonthStr(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [chip, setChip] = useState<Chip>('all');
  const [adding, setAdding] = useState(false);
  const [newDate, setNewDate] = useState(today);
  const monthData = useReportItemsByMonth('daily_news', month);
  const { canEdit } = usePermissions();
  const ensure = useEnsureReport();
  const review = useReviewReport();
  const addItem = useAddItem();

  const days = useMemo<OpsReportDayGroup[]>(() => monthData.data ?? [], [monthData.data]);
  const allItems = useMemo(() => days.flatMap((d) => d.items), [days]);
  const counts = useMemo(() => ({
    all: allItems.length,
    picked: allItems.filter((i) => matchesChip(i, 'picked')).length,
    ai: allItems.filter((i) => matchesChip(i, 'ai')).length,
    human: allItems.filter((i) => matchesChip(i, 'human')).length,
  }), [allItems]);
  const visibleDays = useMemo(
    () => days
      .map((d) => ({ ...d, items: d.items.filter((i) => matchesChip(i, chip)) }))
      .filter((d) => d.items.length > 0),
    [days, chip],
  );

  const startAdding = () => {
    // 見ている月に今日が無ければ、その月の末日を既定にする
    setNewDate(month === currentMonth ? today : lastDayOfMonth(month));
    setAdding(true);
  };

  const submitNew = async (fields: NewsFields) => {
    try {
      const existing = days.find((d) => d.period_key === newDate);
      const reportId = existing?.report_id
        ?? (await ensure.mutateAsync({ kind: 'daily_news', period_key: newDate })).id;
      await addItem.mutateAsync({ reportId, item: fields });
      setAdding(false);
      notifySuccess('ニュースを追加しました');
    } catch (e) {
      notifyApiError('追加できませんでした', e);
    }
  };

  const onReview = (reportId: string) => {
    review.mutate(reportId, {
      onSuccess: () => notifySuccess('確認しました'),
      onError: (e) => notifyApiError('確認できませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="デイリーニュース報告"
        sub="AI が業界のニュースを毎日集めます。人が注目度（1〜5）を付けたり、足したりします"
        primaryAction={canEdit && !adding ? (
          <Button onClick={startAdding}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />ニュースを追加
          </Button>
        ) : undefined}
      >
        {/*
          月を選ぶ。**先の月は選べない** (まだ起きていないニュースは無い)。
          **端末のカレンダーに任せる**（自作の日付ホイールは作らない・
          `client-v4/mobile.ts` の `duePresets()` と同じ決めごと）。
          `PageHeader` の主アクションは `sm`(640px) で PC/スマホの置き場所が
          切り替わるので、ここの帯も同じ `sm` に揃える（`isMobile`＝`lg`(1023px)
          に揃えると 640〜1023px 幅でボタンが孤立して折り返される）。
        */}
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Button variant="outline" size="icon" className="shrink-0" onClick={() => setMonth(addMonths(month, -1))} aria-label="前の月">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Input
            type="month"
            value={month}
            max={currentMonth}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label="月"
            className="min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none"
          />
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={month >= currentMonth}
            aria-label="次の月"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          {month !== currentMonth && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setMonth(currentMonth)}>今月</Button>
          )}
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-cardtitle">{formatMonthJa(month)}</span>
        <span className="text-sub text-muted-foreground">{allItems.length}件 ・ {days.length}日</span>
      </div>

      {allItems.length > 0 && (
        <FilterChips
          label="ニュースを絞り込む"
          items={(Object.keys(CHIP_LABELS) as Chip[]).map((k) => ({
            key: k, label: CHIP_LABELS[k], count: counts[k],
          }))}
          value={chip}
          onChange={(k) => setChip(k as Chip)}
        />
      )}

      {monthData.isError ? (
        <ErrorPanel title="この月のニュースを読み込めませんでした" error={monthData.error} onRetry={() => monthData.refetch()} />
      ) : monthData.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : (
        <div className={isMobile ? undefined : 'rounded-card border border-border bg-card'}>
          {days.length === 0 ? (
            <EmptyState
              className={isMobile ? undefined : 'border-0 bg-transparent'}
              icon={<Sparkles />}
              title={`${formatMonthJa(month)} のニュースはまだありません`}
              description={month === currentMonth
                ? 'AI が毎日集めます。待てないときは「ニュースを追加」から自分で入れられます。'
                : 'この月は AI が集めた記録も、人が足した記録もありません。'}
            />
          ) : visibleDays.length === 0 ? (
            <NoSearchResults
              className={isMobile ? undefined : 'border-0 bg-transparent'}
              activeFilters={[`絞り込み: ${CHIP_LABELS[chip]}`]}
              onClearFilters={() => setChip('all')}
            />
          ) : (
            <PullToRefresh onRefresh={monthData.refetch} disabled={!isMobile}>
              {!isMobile && <NewsRowsHeader canEdit={canEdit} />}
              {visibleDays.map((day) => (
                <div key={day.period_key}>
                  <NewsDayHeader
                    day={day}
                    canEdit={canEdit}
                    onReview={() => onReview(day.report_id)}
                    /*
                      `review` は月内の全日で1つの mutation を共有するので、
                      `isPending` だけを見ると押していない日の「確認した」まで
                      一緒に無効化される。押した対象（`variables`）と見出しの
                      `report_id` が一致するときだけ無効化する。
                    */
                    reviewing={review.isPending && review.variables === day.report_id}
                  />
                  {isMobile ? (
                    <NewsCards items={day.items} canEdit={canEdit} />
                  ) : (
                    day.items.map((item) => (
                      <NewsRow key={item.id} item={item} canEdit={canEdit} />
                    ))
                  )}
                </div>
              ))}
            </PullToRefresh>
          )}

          {canEdit && adding && (
            <NewsForm
              dateValue={newDate}
              onDateChange={setNewDate}
              dateMax={today}
              onCancel={() => setAdding(false)}
              onSubmit={submitNew}
              submitting={addItem.isPending || ensure.isPending}
            />
          )}
        </div>
      )}

      <p className="text-note text-muted-foreground">
        「注目度」の数字は、ウィークリー活動報告に書くときの目印です。
        各行の<strong className="font-bold">送るボタン</strong>を押すと、
        その日が入る週のウィークリー活動報告へ写せます（報告側に「ニュース由来」と出ます）。
        <strong className="font-bold">自動では送られません</strong> — 選ぶのは人です。
        送り先の週のウィークリー活動報告が確定済みのときは、その行だけ送れません
        （確定済みの週報の画面で「確定を取り消す」を押すと送れるようになります）。
      </p>
    </div>
  );
}
