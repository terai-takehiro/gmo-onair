import { Link } from 'react-router-dom';
import { CalendarCheck, Newspaper, ChevronRight, Sparkles, CheckCircle2, CircleDashed, DoorOpen, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useReports } from '@/lib/reportsApi';
import { useInviewList } from '@/lib/inviewApi';
import { MENUS, formatDateJa, formatWeekJa, type OpsReport } from '@/lib/types';

const MENU_ICONS: Record<string, React.ElementType> = {
  CalendarCheck,
  Newspaper,
};

export default function HomePage() {
  const weekly = useReports('weekly_activity', 1);
  const news = useReports('daily_news', 1);
  const inviewUpcoming = useInviewList({ upcoming: true });
  const latestByKind: Record<string, OpsReport | undefined> = {
    weekly_activity: weekly.data?.[0],
    daily_news: news.data?.[0],
  };
  const upcomingInviewCount = inviewUpcoming.data?.length ?? 0;
  const upcomingInviewHeadcount = (inviewUpcoming.data ?? []).reduce((a, r) => a + (r.party_size || 1), 0);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">日常業務</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI エージェントと協働する日々の定型業務メニュー。AI が生成・収集し、人が確認して仕上げます。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MENUS.map((menu) => {
          const Icon = MENU_ICONS[menu.icon] ?? CalendarCheck;
          const latest = latestByKind[menu.kind];
          return (
            <Link key={menu.kind} to={menu.path} className="group">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h2 className="font-semibold text-sm truncate">{menu.label}</h2>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{menu.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                        {latest ? (
                          <>
                            <span className="text-muted-foreground">
                              最新: {menu.kind === 'weekly_activity' ? formatWeekJa(latest.period_key) : formatDateJa(latest.period_key)}
                            </span>
                            {latest.status === 'published' ? (
                              <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> 公開済み
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                                <CircleDashed className="h-3 w-3" /> 下書き
                              </Badge>
                            )}
                            {!latest.reviewed_at && (
                              <Badge variant="outline" className="gap-1 border-violet-300 text-violet-700">
                                <Sparkles className="h-3 w-3" /> 未確認
                              </Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">レポートはまだありません</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {/* 内覧会 来場予約 (レポート型ではない独立メニュー) */}
        <Link to="/inview" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <DoorOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-semibold text-sm truncate">内覧会 来場予約</h2>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    定期内覧会の回ごとの参加者名簿。Kairos3 のメールを AI が取り込み・当日受付にも
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    {upcomingInviewCount > 0 ? (
                      <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                        <Users className="h-3 w-3" /> 今後 {upcomingInviewCount}組 / {upcomingInviewHeadcount}名
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">今後の予約はまだありません</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 shrink-0 text-violet-500 mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground text-sm mb-1">AI エージェントとの協働について</p>
              <p>
                レポートは GMO ONAiR の MCP サーバー経由で AI エージェントが定期投稿します。
                AI の再投稿はレポート本文のみを更新し、人が追記した行 (トピック・ニュース) には触れません。
                詳しい使い方はヘッダーの「?」から利用マニュアルを参照してください。
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
