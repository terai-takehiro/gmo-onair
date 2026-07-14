import { Link } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, CircleDashed, ChevronRight, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useReports, useEnsureReport } from '@/lib/reportsApi';
import { usePermissions } from '@/hooks/usePermissions';
import { formatWeekJa, toDateStr } from '@/lib/types';

/** 先週の月曜日 (既定の対象週) */
function defaultWeekStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const diff = (dow === 0 ? -6 : 1 - dow) - 7;
  now.setDate(now.getDate() + diff);
  return toDateStr(now);
}

export default function WeeklyListPage() {
  const { data: reports, isLoading } = useReports('weekly_activity', 50);
  const { canEdit } = usePermissions();
  const ensure = useEnsureReport();
  const navigate = useNavigate();

  const hasDefaultWeek = reports?.some((r) => r.period_key === defaultWeekStart());

  const createForDefaultWeek = async () => {
    const report = await ensure.mutateAsync({ kind: 'weekly_activity', period_key: defaultWeekStart() });
    navigate(`/weekly/${report.id}`);
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            ウィークリー活動報告
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">全社で週 1 本 (月曜始まり)。AI の下書きにトピックを追記して確定します。</p>
        </div>
        {canEdit && !isLoading && !hasDefaultWeek && (
          <Button size="sm" onClick={createForDefaultWeek} disabled={ensure.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            先週のレポートを作成
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : !reports?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            レポートはまだありません。AI の定期実行を待つか、「先週のレポートを作成」から始められます。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Link key={r.id} to={`/weekly/${r.id}`} className="block group">
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{formatWeekJa(r.period_key)}</span>
                      {r.status === 'published' ? (
                        <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> 確定済み
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                          <CircleDashed className="h-3 w-3" /> 下書き
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {r.title || '週次活動報告'}
                      {typeof r.item_count !== 'undefined' && ` ・ トピック ${r.item_count} 件`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
