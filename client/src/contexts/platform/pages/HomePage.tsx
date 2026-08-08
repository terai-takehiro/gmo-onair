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
 *
 * ── PC とスマホの違いは「形」で、並びはモックと同じ ──────────
 *
 * モックはどちらも **挨拶 → アプリ → イベントで使うもの → 今日** の順です。
 * M3 でスマホだけ「今日」を先に出していましたが、その理由は
 * **アプリのタイルが1列に落ちて 1,676px あった**ことでした。
 * スマホのタイルを**モックの形（2列の正方形・イベントはピル）**に戻したので
 * 理由が消え、**並びをモックに戻しました**（`home/AppTiles.tsx`）。
 */
import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { APPS } from '@gmo-onair/shared/src/client/apps';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useAuth } from '@/contexts/platform/AuthContext';
import { TaskIntakeBox } from '@/contexts/tasks/components/TaskIntakeBox';
import type { InboxData } from '@/contexts/sales/pages/inbox/kinds';
import { AppTiles, EventTiles, type TileApp } from './home/AppTiles';
import { MobileAiBar } from './home/MobileAiBar';
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
 * 案件の本番の日に開くものです。
 *
 * ⚠️ **消してはいけません。** `visibleApps()` は凍結4アプリを既定で外すので、
 * **上辺バーのアプリ切替にも左メニューにも凍結アプリは出ていません**。
 * つまり**押して開ける場所はトップのタイルだけ**で、消すと Qシート・技術資料・
 * 計時LIVE・リアルタイムCG が URL 直打ちでしか開けなくなります（放送が止まる）。
 */
const DAILY_KEYS = ['sales', 'budget', 'gpm', 'studio', 'dailyops', 'equipment', 'admin'];

/** 「最終更新 07/31 08:04」（モック）。**数字の出どころは取得の時刻** */
function updatedAt(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function HomePage() {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  /**
   * **形をスマホとPCで入れ替えるための判定。**
   *
   * `useIsMobile()` で早期 return しないこと（同じ部品の中で分岐すると
   * 幅が変わったときにフックの数が変わって React が落ちる）。ここは
   * **どちらの形の部品を描くか**を渡すだけに使う。
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

  /**
   * **「最終更新 MM/DD HH:mm」**（モック）。
   *
   * 出どころは**この画面が数字を取ってきた時刻**です（react-query の
   * `dataUpdatedAt`）。サーバー側に「集計した時刻」は無いので、
   * **持っていない時刻を作らず、持っている時刻の意味で書きます** —
   * 画面の数字がいつのものかは、これで正しく言えます。
   */
  const lastLoaded = Math.max(
    inbox.dataUpdatedAt ?? 0,
    badges.dataUpdatedAt ?? 0,
    schedule.dataUpdatedAt ?? 0,
    summary.dataUpdatedAt ?? 0,
  );

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

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 p-3 lg:gap-6 lg:p-6">
      {/* ── 挨拶。**数えられた件数だけを書く** ───────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1">{greeting}、{currentUser?.name} さん</h1>
          {canCount && (
            waitingTotal === 0 && myOverdue === 0 ? (
              <p className="text-sub mt-1 text-secondary-foreground">
                待たせているものも、期限を過ぎたものもありません。
              </p>
            ) : isMobile ? (
              /**
               * **スマホはチップ**（モックの `お待たせ 3件 ・ 期限切れ 2件`）。
               * 文章にすると 375px で2行になり、挨拶の下が読み飛ばされる。
               * **押せるようにしてある** — 件数を見た人が次にやるのは「開く」なので、
               * 数字を読んでからメニューを探し直すのは1手だけ無駄
               */
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {waitingTotal > 0 && (
                  <CountChip label="お待たせ" n={waitingTotal} onClick={() => navigate('/sales/inbox')} />
                )}
                {myOverdue > 0 && (
                  <CountChip label="期限切れ" n={myOverdue} onClick={() => navigate('/sales/tasks/list')} />
                )}
              </div>
            ) : (
              /**
               * **PC は文章**（モック:「お客様を待たせているものが 3件、
               * 自分の期限を過ぎたものが 2件 あります。」）。
               * 幅があるので1行に収まり、**チップより何の件数かがはっきりする**。
               * 数字は押せる（行き先はチップと同じ）
               */
              <p className="text-sub mt-1 text-secondary-foreground">
                {waitingTotal > 0 && (
                  <>
                    お客様を待たせているものが{' '}
                    <CountLink n={waitingTotal} onClick={() => navigate('/sales/inbox')} />
                  </>
                )}
                {waitingTotal > 0 && myOverdue > 0 && '、'}
                {myOverdue > 0 && (
                  <>
                    自分の期限を過ぎたものが{' '}
                    <CountLink n={myOverdue} onClick={() => navigate('/sales/tasks/list')} />
                  </>
                )}
                {' '}あります。
              </p>
            )
          )}
        </div>
        {/* **いつの数字かを書く**（モック右上）。取得できていないうちは出さない。
            **スマホには出さない** — 375px では挨拶の下に1行まるごと足すことになり、
            モックのスマホにも無い（PC は右端の空きに収まる） */}
        {!isMobile && lastLoaded > 0 && (
          <span className="text-sub shrink-0 text-muted-foreground">最終更新 {updatedAt(lastLoaded)}</span>
        )}
      </div>

      {/* スマホは「AIに任せる」を挨拶の直下に1本（モック）。中身は押すと開く */}
      {isMobile && <MobileAiBar canIntake={canSeeDailyops} canPaste={canSeeSales} />}

      {/* ── アプリ ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3.5">
        <SectionHeading
          mobile={isMobile}
          title="アプリ"
          note="使えるものだけ並びます。数字は「あなたが押せば片づくもの」の件数です"
        />
        <AppTiles apps={tiles} mobile={isMobile} />

        <div className="border-t border-dashed border-border pt-3.5">
          <SectionHeading
            mobile={isMobile}
            level={3}
            title="イベントで使うもの"
            note="案件の本番でだけ開きます。日々の業務アプリとは別の並びです"
          />
          <div className="mt-2.5">
            <EventTiles mobile={isMobile} />
          </div>
        </div>
      </section>

      {/* ── 今日 ─────────────────────────────────────────────── */}
      {hasToday && (
      <section className="flex flex-col gap-3.5">
        <SectionHeading
          mobile={isMobile}
          title="今日"
          note="あなたの秘書。AI は下書きまでで、押すまで登録しません"
          action={
            canSeeDailyops ? (
              <button
                type="button"
                onClick={() => navigate('/sales/tasks/list')}
                className="min-h-tap text-note flex items-center gap-0.5 font-bold text-primary hover:underline lg:min-h-0"
              >
                自分のタスクを全部ひらく<ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            ) : null
          }
        />

        {/* AI に任せる。**投げるのは1秒で終わる行為なので入口の最上部**
            （奥に置くと「あとでいいか」になり、口頭のまま消える）。
            **スマホでは挨拶の下の青いバーの中**にあるので、ここには出さない */}
        {!isMobile && canSeeDailyops && <TaskIntakeBox />}

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

      <p className="text-note pt-2 text-center text-muted-foreground">
        GMO ONAiR v{__APP_VERSION__}
      </p>
    </div>
  );
}

/**
 * 節の見出し。**スマホは字間 .1em の小見出し**（モック 12px/800）、
 * **PC は `text-h2`**（19px/800）。
 *
 * 375px で PC と同じ大きさの見出しを使うと、見出しだけで縦を食って
 * 中身の密度が落ちます（実装はここが PC と同じになっていました）。
 * 見出しの大きさが変わっても**読み上げの段（h2 / h3）は変えません**。
 */
function SectionHeading({
  mobile,
  title,
  note,
  action,
  level = 2,
}: {
  mobile: boolean;
  title: string;
  note: string;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Tag className={mobile ? 'v4-eyebrow' : level === 2 ? 'text-h2' : 'text-cardtitle'}>{title}</Tag>
      {/* **説明はスマホでは出さない。** 見出しの下に2行の説明が続くと、
          押すものに着くまでの距離がそのぶん伸びる（モックも出していない） */}
      {!mobile && <span className="text-note text-muted-foreground">{note}</span>}
      {action && (
        <>
          <div className="flex-1" />
          {action}
        </>
      )}
    </div>
  );
}

/**
 * 挨拶の下の件数（PC の文章の中）。**赤くして押せるようにする**。
 * 0 件のときは呼び出し側が出さない — 「0件」を赤で出すと目を引くだけで何も起きない。
 */
function CountLink({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="font-number font-bold text-destructive hover:underline">
      {n}件
    </button>
  );
}

/** 挨拶の下の件数チップ（スマホ。モックの `お待たせ 3件 ・ 期限切れ 2件`） */
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
