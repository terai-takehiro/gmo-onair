import { Link } from 'react-router-dom';
import { CalendarCheck, Newspaper, ChevronRight, Sparkles, CheckCircle2, CircleDashed, DoorOpen, Users, FileText, Inbox, KeyRound, AlertTriangle, ListChecks, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useReports } from '@/lib/reportsApi';
import { useInviewList } from '@/lib/inviewApi';
import { useFinanceDocs, useInquiries } from '@/lib/inboxApi';
import { useSecurityCardStats } from '@/lib/securityCardApi';
import { useMyTaskSummary } from '@/lib/tasksApi';
import { MENUS, formatDateJa, formatWeekJa, type OpsReport } from '@/lib/types';
import { PageTitle } from '@gmo-onair/shared/src/client/ui';

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
  const financeDocs = useFinanceDocs();
  const pendingFinance = (financeDocs.data ?? []).filter((d) => d.status !== 'processed' && d.status !== 'rejected').length;
  const inquiries = useInquiries();
  const unhandledInquiries = (inquiries.data ?? []).filter((q) => !q.handled_at).length;
  const cardStats = useSecurityCardStats();
  const taskSummary = useMyTaskSummary();
  const ts = taskSummary.data;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div>
        <PageTitle>日常業務</PageTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          AI エージェントと協働する日々の定型業務メニュー。AI が生成・収集し、人が確認して仕上げます。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* タスク・依頼 — 期限は何月何日何時何分まで。件数だけを出す */}
        <a href="/tasks?scope=me" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-semibold text-sm truncate">タスク・依頼</h2>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    案件と個人のタスクを重要度 × 緊急度の順に。受けた依頼・出した依頼もここで
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    {ts && (ts.overdue > 0 || ts.due_today > 0 || ts.unanswered_delegations > 0) ? (
                      <>
                        {ts.overdue > 0 && (
                          <Badge variant="outline" className="gap-1 border-destructive text-destructive">
                            <AlertTriangle className="h-3 w-3" /> 期限超過 {ts.overdue}
                          </Badge>
                        )}
                        {ts.due_today > 0 && (
                          <Badge variant="outline" className="gap-1 border-warning text-warning-strong">
                            <Clock className="h-3 w-3" /> 今日が期限 {ts.due_today}
                          </Badge>
                        )}
                        {ts.unanswered_delegations > 0 && (
                          <Badge variant="outline" className="gap-1 border-ai text-ai">
                            未返答の依頼 {ts.unanswered_delegations}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">待たせているものはありません</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </a>

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
                              <Badge variant="outline" className="gap-1 border-success text-success">
                                <CheckCircle2 className="h-3 w-3" /> 公開済み
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 border-warning text-warning-strong">
                                <CircleDashed className="h-3 w-3" /> 下書き
                              </Badge>
                            )}
                            {!latest.reviewed_at && (
                              <Badge variant="outline" className="gap-1 border-ai text-ai">
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

        {/* 見積 / 請求書 */}
        <Link to="/finance" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-semibold text-sm truncate">見積 / 請求書</h2>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">メール受信の見積・請求・注文書を AI が取込。確認→承認→処理完了で管理</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    {pendingFinance > 0 ? (
                      <Badge variant="outline" className="gap-1 border-warning text-warning-strong"><CircleDashed className="h-3 w-3" /> 未処理 {pendingFinance}件</Badge>
                    ) : <span className="text-muted-foreground">未処理はありません</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* その他問い合わせ */}
        <Link to="/inquiries" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-semibold text-sm truncate">その他問い合わせ</h2>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">スパム・営業を除いた有益なメールを AI が分類・重要度づけ</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    {unhandledInquiries > 0 ? (
                      <Badge variant="outline" className="gap-1 border-ai text-ai"><Sparkles className="h-3 w-3" /> 未対応 {unhandledInquiries}件</Badge>
                    ) : <span className="text-muted-foreground">未対応はありません</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* スタジオ セキュリティカード */}
        <Link to="/security-cards" className="group">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-semibold text-sm truncate">セキュリティカード</h2>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">GMOサムライスタジオ用賀のセキュリティカード24枚の貸出・返却を管理</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="outline" className="gap-1 border-success text-success"><CheckCircle2 className="h-3 w-3" /> 利用可能 {cardStats.data?.available ?? '—'}</Badge>
                    {(cardStats.data?.lent ?? 0) > 0 && (
                      <Badge variant="outline" className="gap-1 border-warning text-warning-strong"><Users className="h-3 w-3" /> 貸出中 {cardStats.data?.lent}</Badge>
                    )}
                    {(cardStats.data?.overdue ?? 0) > 0 && (
                      <Badge variant="outline" className="gap-1 border-destructive text-destructive"><AlertTriangle className="h-3 w-3" /> 期限超過 {cardStats.data?.overdue}</Badge>
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
            <Sparkles className="h-5 w-5 shrink-0 text-ai mt-0.5" />
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
