/**
 * ウィークリー活動報告の入口 (`/weekly`) (v4)
 *
 * v4 で 一覧 と 中身 を **1画面 (master-detail)** にしたので、ここは
 * **いちばん新しい週へ送るだけ**になった。`/weekly` のブックマークを
 * 生かすために URL は残してある (消すと 404 になる)。
 *
 * 週の報告が1本も無いときだけ、ここが画面になる。何も無い理由と
 * 「先週ぶんを作る」ボタンを出す — 転送先が無いのに白紙を出さないため。
 */
import { Navigate, useNavigate } from 'react-router-dom';
import { CalendarCheck, Plus } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { useEnsureReport, useReports } from '@/lib/reportsApi';
import { usePermissions } from '@/hooks/usePermissions';
import { toDateStr } from '@/lib/types';

/** 先週の月曜日 (既定の対象週) */
function defaultWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = (dow === 0 ? -6 : 1 - dow) - 7;
  now.setDate(now.getDate() + diff);
  return toDateStr(now);
}

export default function WeeklyListPage() {
  const list = useReports('weekly_activity', 50);
  const { canEdit } = usePermissions();
  const ensure = useEnsureReport();
  const navigate = useNavigate();

  // 一覧はサーバーが period_key の新しい順で返す。先頭が最新の週
  const latest = list.data?.[0];
  if (latest) return <Navigate to={`/weekly/${latest.id}`} replace />;

  const createForLastWeek = () => {
    ensure.mutate({ kind: 'weekly_activity', period_key: defaultWeekStart() }, {
      onSuccess: (report) => navigate(`/weekly/${report.id}`),
      onError: (e) => notifyApiError('作れませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="ウィークリー活動報告"
        sub="全社で週1本（月曜はじまり）。AI の下書きに人がトピックを足して確定します"
        icon={<CalendarCheck className="h-5 w-5 text-primary" aria-hidden="true" />}
      />

      {list.isError ? (
        <ErrorPanel title="週の報告を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : (
        <EmptyState
          title="週の報告はまだ1本もありません"
          description="AI が毎週の定期実行で下書きを作ります。待てないときは、先週ぶんの箱を先に作れます。"
          action={canEdit ? (
            <Button onClick={createForLastWeek} disabled={ensure.isPending}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />先週ぶんを作る
            </Button>
          ) : undefined}
        />
      )}
    </div>
  );
}
