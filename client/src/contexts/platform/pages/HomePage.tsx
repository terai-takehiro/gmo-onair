/**
 * トップページ (v4)
 *
 * **上＝アプリの入口 ／ 下＝自分の今日。** ログイン直後に開く画面です。
 *
 * ── 旧トップから落としたもの（と、その行き先）──────────────────
 *
 * 旧トップは 1,273 行あり、KPI・営業ダッシュボード・AI活動フィード・直近の案件・
 * クイックアクセスまで載っていました。**同じ数字が各アプリのダッシュボードにも
 * あり、二重に見ていました**（トップの KPI は財務ダッシュボードと同じ中身）。
 * v4 のトップは「どのアプリに行くか」と「自分の今日」に絞ります。
 *
 *   今月の主要指標   → 財務ダッシュボード `/budget/dashboard`
 *   営業ダッシュボード → 案件管理ダッシュボード `/sales/dashboard`
 *   AI 活動フィード   → `/sales/ai-activity`
 *   直近の案件       → 案件一覧 `/sales/projects`
 *   クイックアクセス   → 各アプリの左メニュー
 *   システム管理     → 設定 `/settings`
 *
 * ── 数字は数えられるものだけ ────────────────────────────────
 *
 * アプリタイルの数字は「**あなたが押せば片づくもの**」の件数です。
 * 案件管理・日常業務は受信箱（`/dashboard/inbox`）が数えているものを使い、
 * 財務・カレンダー・機材は `/dashboard/app-badges` で数えます。
 * **設定とプロジェクト管理には数字を出しません**（前者は片づける物という概念が無く、
 * 後者はまだ画面がありません）。
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ClipboardPaste, Mic } from 'lucide-react';
import api from '@/lib/api';
import { APPS } from '@gmo-onair/shared/src/client/apps';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useAuth } from '@/contexts/platform/AuthContext';
import { TaskIntakeBox } from '@/contexts/tasks/components/TaskIntakeBox';
import { MobileIntake } from './home/MobileIntake';
import type { InboxData } from '@/contexts/sales/pages/inbox/kinds';
import { AppTiles, EventTiles, type TileApp } from './home/AppTiles';
import { WaitingCard } from './home/WaitingCard';
import { TodayCard } from './home/TodayCard';
import { MyTasksCard } from './home/MyTasksCard';
import type { AppBadges, MyTaskSummary, ScheduleDay } from './home/types';

/**
 * 日々の業務アプリ（イベント用と外部リンクを除いたもの）。**並びはモックのまま**。
 *
 * **プロジェクト管理 (`gpm`) はモックどおり並びに入れています。**
 * 権限 (`gpm`) を持つ人にだけ出ます（タイルの絞り込みは `visibleApps` が権限で行う）。
 *
 * **制作資料 (`qsheet`) と技術資料 (`techsheet`) はここから外し、
 * 「イベントで使うもの」の段へ移しました**（M3）。どちらも凍結アプリで、
 * 案件の本番の日に開くものです。375px では大きいタイルが1列に落ちるので、
 * 9枚あると**「今日」に着くまで 2.5 画面ぶんこすることになっていました**
 * （実測 1,676px）。
 *
 * ⚠️ **消してはいけません。** `visibleApps()` は凍結4アプリを既定で外すので、
 * **上辺バーのアプリ切替にも左メニューにも凍結アプリは出ていません**。
 * つまり**押して開ける場所はトップのタイルだけ**で、消すと Qシート・技術資料・
 * 計時LIVE・リアルタイムCG が URL 直打ちでしか開けなくなります（放送が止まる）。
 *
 * ⚠️ **この配列は「出す・出さない」だけを決めます。並び順は決めません** —
 * 下の `tiles` は `APPS.filter(...)` なので、**描かれる順は `apps.ts` の
 * `APPS` の順**です。ここを並べ替えてもタイルは動きません
 * （プロジェクト管理を `apps.ts` で案件管理の隣へ移したのはそのため）。
 */
const DAILY_KEYS = ['sales', 'gpm', 'budget', 'studio', 'dailyops', 'equipment', 'admin'];

export default function HomePage() {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  /**
   * **スマホでは「今日」を先に出す**（M3）。
   *
   * PC は横3列なのでアプリのタイルが2〜3段に収まりますが、375px では1列に落ちて
   * **「今日」に着くまで 1,676px（2.5 画面ぶん）こする**ことになっていました（実測）。
   * 外にいる人が開きたいのは自分のタスクと予定で、アプリの入口は下タブと
   * 上辺バーのアプリ切替からも行けます。**並べ替えるだけで、消していません。**
   */
  const isMobile = useIsMobile();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'おはようございます' : 'お疲れさまです';

  const canSeeSales = hasPermission('sales');
  const canSeeDailyops = hasPermission('dailyops');

  const inbox = useQuery<InboxData>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get('/dashboard/inbox')).data.data,
    staleTime: 30_000,
    enabled: canSeeSales || canSeeDailyops,
  });

  const badges = useQuery<AppBadges>({
    queryKey: ['dashboard', 'app-badges'],
    queryFn: async () => (await api.get('/dashboard/app-badges')).data.data,
    staleTime: 60_000,
  });

  const schedule = useQuery<ScheduleDay[]>({
    queryKey: queryKeys.dashboard.weeklySchedule(),
    queryFn: async () => (await api.get('/dashboard/weekly-schedule')).data.data,
    staleTime: 60_000,
    enabled: hasPermission('studio'),
  });

  const summary = useQuery<MyTaskSummary>({
    queryKey: queryKeys.dashboard.myTaskSummary(),
    queryFn: async () => (await api.get('/dailyops/tasks/summary')).data.data,
    staleTime: 60_000,
    enabled: canSeeDailyops,
  });

  const counts = inbox.data?.counts;
  // 受信箱は案件管理と日常業務の両方のものが1本になっている。
  // **どちらのアプリで片づけるか**で振り分ける（同じ件を2つのタイルに数えない）
  const salesWaiting = (counts?.overdue_action ?? 0) + (counts?.ai_project ?? 0);
  const dailyWaiting = (counts?.inquiry ?? 0) + (counts?.finance_doc ?? 0);
  const waitingTotal = inbox.data?.items.length ?? 0;
  const myOverdue = summary.data?.overdue ?? 0;
  // **数えられていないときは書かない。** 受信箱は `sales`、タスクは `dailyops` が要る。
  // どちらも無い人に「0件です」と書くと、**見えていないだけなのに「無い」と言い切る**ことになる
  const canCount = canSeeSales || canSeeDailyops;
  // 「今日」の3枚が1枚も出ないなら、節ごと出さない（見出しだけ残ると壊れて見える）
  const hasToday = canSeeDailyops || canSeeSales || hasPermission('studio');

  const tiles: TileApp[] = useMemo(() => {
    const badge: Record<string, { n: number; urgent?: boolean } | undefined> = {
      sales: canSeeSales ? { n: salesWaiting, urgent: true } : undefined,
      dailyops: canSeeDailyops ? { n: dailyWaiting, urgent: true } : undefined,
      budget: badges.data?.budget !== undefined ? { n: badges.data.budget } : undefined,
      studio: badges.data?.studio !== undefined ? { n: badges.data.studio } : undefined,
      equipment: badges.data?.equipment !== undefined ? { n: badges.data.equipment, urgent: true } : undefined,
    };
    return APPS
      .filter((a) => DAILY_KEYS.includes(a.key))
      .filter((a) => !a.permissionModule || hasPermission(a.permissionModule))
      .map((a) => ({ ...a, badge: badge[a.key]?.n, urgent: badge[a.key]?.urgent }));
  }, [badges.data, salesWaiting, dailyWaiting, canSeeSales, canSeeDailyops, hasPermission]);

  // ── アプリ ─────────────────────────────────────────────────
  const appsSection = (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-h2">アプリ</h2>
        <span className="text-note text-muted-foreground">
          使えるものだけ並びます。数字は「あなたが押せば片づくもの」の件数です
        </span>
      </div>
      <AppTiles apps={tiles} />
      <EventTiles />
    </section>
  );

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 p-3 lg:gap-6 lg:p-6">
      {/* ── 挨拶。**数えられた件数だけを書く** ───────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {/* **スマホでは名前を出さない**（M7）。自分の端末なので誰かは分かっており、
              「おはようございます、○○ さん」は 390px で2行になって 140px 使っていた */}
          <h1 className="text-h1">{greeting}{isMobile ? '' : `、${currentUser?.name} さん`}</h1>
          {canCount && (
            waitingTotal === 0 && myOverdue === 0 ? (
              <p className="text-sub mt-1 text-secondary-foreground">
                待たせているものも、期限を過ぎたものもありません。
              </p>
            ) : (
              /**
               * **モックの形（`お待たせ 3件 ・ 期限切れ 2件`）に合わせた。**
               * 文章にすると 375px で2行になり、挨拶の下が読み飛ばされる。
               * **押せるようにしてある** — 件数を見た人が次にやるのは「開く」なので、
               * 数字を読んでからメニューを探し直すのは1手だけ無駄。
               * 数えられない種類（権限が無い）は `canCount` ごと出さない
               */
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {waitingTotal > 0 && (
                  <CountChip label="お待たせ" n={waitingTotal} onClick={() => navigate('/sales/inbox')} />
                )}
                {myOverdue > 0 && (
                  <CountChip label="期限切れ" n={myOverdue} onClick={() => navigate('/sales/tasks/list')} />
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* **PC はアプリが先、スマホは「今日」が先。** 中身は同じものを並べ替えるだけ */}
      {!isMobile && appsSection}

      {/* ── 今日 ─────────────────────────────────────────────── */}
      {hasToday && (
      <section className="flex flex-col gap-3.5">
        {/*
          **スマホでは見出しだけにする**（M7）。
          ・「AI は下書きまでで…」は畳んだ入口のほうに書いてある（二重にしない）
          ・「自分のタスクを全部ひらく」は `MyTasksCard` の「全部ひらく」と
            **同じ行き先で二重**だったので、スマホでは出さない
        */}
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-h2">今日</h2>
          {!isMobile && (
            <span className="text-note text-muted-foreground">
              AI は下書きまでで、押すまで登録しません
            </span>
          )}
          <div className="flex-1" />
          {canSeeDailyops && !isMobile && (
            <button
              type="button"
              onClick={() => navigate('/sales/tasks/list')}
              className="min-h-tap text-note flex items-center gap-0.5 font-bold text-primary hover:underline lg:min-h-0"
            >
              自分のタスクを全部ひらく<ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* AI に任せる。**投げるのは1秒で終わる行為なので入口の最上部**
            （奥に置くと「あとでいいか」になり、口頭のまま消える）。
            スマホは**場所はそのまま・大きさだけ1行**に畳む（約 500px → 72px） */}
        {canSeeDailyops && (isMobile ? <MobileIntake /> : <TaskIntakeBox />)}

        {/*
            スマホの「貼って送る」（モックの ① にある **貼る・撮る**）。
            **スマホにだけ出す** — PC には受付の作業台（`/sales/inbox`）があり、
            そちらのほうができることが多い。外にいるときの1段目だけをここに置く。
            **「撮る」は出さない** — 名刺を読む口が無い（`InquiryQuickPage` に理由）
        */}
        {canSeeSales && (
          <div className="flex flex-col gap-2 lg:hidden">
            {([
              { to: '/sales/inbox/new', icon: ClipboardPaste, label: '電話・その他を貼る', sub: '聞いた話をそのまま送る。整理は PC で' },
              { to: '/sales/record', icon: Mic, label: '打合せを録音する', sub: '文字起こしは裏で走ります' },
            ] as const).map((e) => (
              <button
                key={e.to}
                type="button"
                onClick={() => navigate(e.to)}
                className="rounded-card min-h-tap flex w-full items-center gap-3 border border-dashed border-primary-border bg-primary-surface-weak px-4 py-3 text-left"
              >
                <e.icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="text-list block text-primary">{e.label}</span>
                  <span className="text-note block text-muted-foreground">{e.sub}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {inbox.isLoading && !inbox.data ? (
          <Delayed><SkeletonRows rows={4} /></Delayed>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            {canSeeDailyops && <MyTasksCard />}
            {(canSeeSales || canSeeDailyops) && <WaitingCard data={inbox.data} />}
            {hasPermission('studio') && <TodayCard days={schedule.data} />}
          </div>
        )}
      </section>
      )}

      {isMobile && appsSection}

      <p className="text-note pt-2 text-center text-muted-foreground">
        GMO ONAiR v{__APP_VERSION__}
      </p>
    </div>
  );
}

/**
 * 挨拶の下の件数チップ（モックの `お待たせ 3件 ・ 期限切れ 2件`）。
 * **0 件のときは呼び出し側が出さない** — 「0件」を赤で出すと目を引くだけで何も起きない。
 */
function CountChip({ label, n, onClick }: { label: string; n: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-badge min-h-tap inline-flex items-center gap-1.5 border border-destructive-border bg-destructive-surface px-2.5 py-1 text-sub text-destructive lg:min-h-0"
    >
      {label}
      <span className="font-number font-bold">{n}件</span>
    </button>
  );
}
