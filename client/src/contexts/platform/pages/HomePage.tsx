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
 *   AI 活動フィード   → `/sales/ai-activity`（**その後この画面ごと削除・ご指示**。
 *                       監査ログに過ぎず、AIが触ったかは案件一覧・案件詳細が上位互換）
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
 * ── PC とスマホで変えるのは「形」だけ ──────────────────────
 *
 * タイルの形はモックのとおり **PC は横長3列 / スマホは2列の正方形**、
 * イベントは **PC は小さいタイル / スマホはピル**にします（`home/AppTiles.tsx`）。
 *
 * **並びは PC・スマホとも 挨拶 → AI → アプリ → 今日**（モック `v4-live`）。
 * M3 / M7 ではスマホだけ「今日」を先に出していましたが、
 * **モックに合わせるというご判断でアプリを先に戻しました**。
 * AI バーの直下がアプリタイルになります。
 *
 * ── 節の見出しと説明文を出さない（モック `v4-live`）──────────
 *
 * 「アプリ」「今日」の見出しは**どちらも出しません**。タイルを見れば
 * アプリの並びだと分かり、カードを見れば今日のことだと分かるので、
 * 見出しは縦を食っているだけでした。**「イベントで使うもの」だけは残します** —
 * 上のタイルと見た目が違う理由が、見出しが無いと読み取れないためです。
 */
import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { APPS } from '@gmo-onair/shared/src/client/apps';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useAuth } from '@/contexts/platform/AuthContext';
import { TaskIntakeBox } from '@/contexts/tasks/components/TaskIntakeBox';
import {
  inboxAllHrefOf, isCrossApp, type InboxData, type InboxOpenable,
} from '@/contexts/sales/pages/inbox/kinds';
import { AppTiles, EventTiles, type TileApp } from './home/AppTiles';
import { MobileAiBar } from './home/MobileAiBar';
import { TodayCard } from './home/TodayCard';
import { TaskHubCard } from './home/TaskHubCard';
import { Greeting } from './home/Greeting';
import { Reveal } from './home/Reveal';
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
    // `studio` は権限モデル単純化で `sales` に統合済み
    enabled: canSeeSales,
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
  // ⚠️ **権限だけで決めない。** 受信箱は `sales` か `dailyops` のどちらかで開きますが、
  // **中身は持っている権限のぶんだけ**返ります。取れていない（読み込み中・失敗）ときに
  // 数字を出すと、**数えていないのに「0件です」と言い切る**ことになります
  // （`dailyops` だけの人はこの口が 403 で、お待たせ中がいつも「ありません」でした）
  const canCount = (canSeeSales || canSeeDailyops) && !!inbox.data;

  /**
   * **受信箱の1件をどこで開けるか。** ⚠️ 案件作成に固定しないこと —
   * `dailyops` だけの人は案件作成（`sales` の editor）を開けないので、
   * **API の 403 を画面の「権限がありません」に移し替えただけ**になります
   * （レビューでの指摘）。判定は `inbox/kinds.ts` の1か所。
   */
  const openable: InboxOpenable = useMemo(() => ({
    intake: hasPermission('sales', 'editor'),
    inquiries: canSeeDailyops,
    // `budget` は権限モデル単純化で `sales` に統合済み
    documents: canSeeSales || canSeeDailyops,
  }), [hasPermission, canSeeSales, canSeeDailyops]);
  const waitingHref = inboxAllHrefOf(openable)?.href ?? null;
  // 「期限切れ」の行き先は日常業務の「タスク・依頼」（`/daily/tasks`）。
  // ⚠️ **以前は `/sales/tasks/list` に固定していたが、あれは GLS-A の案件タスクだけを
  // 出す一覧で、`myOverdue`（`/dailyops/tasks/summary` の `overdue`）は個人タスクや
  // プロジェクト管理のタスクも数えているので食い違っていた**（ユーザー指摘で発覚）。
  // 求める権限も `sales` ではなく `dailyops`（数字を出している口と同じ）
  const overdueHref = canSeeDailyops ? '/daily/tasks' : null;
  /** **別バンドルへは素の遷移**（`/daily/` は日常業務アプリ・ルーターでは動けない） */
  const go = (href: string) => {
    if (isCrossApp(href)) window.location.href = href; else navigate(href);
  };
  // 「今日」の3枚が1枚も出ないなら、節ごと出さない（見出しだけ残ると壊れて見える）
  // `studio` は権限モデル単純化で `sales` に統合済みなので canSeeSales と重複する
  const hasToday = canSeeDailyops || canSeeSales;

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
      // **数えていない側にタイルの数字を出さない。** 応答の `sales.visible` /
      // `dailyops.visible` は「サーバーが数えたか」で、権限の写しではない
      // （権限はあるが応答がまだ来ていない、も数えていない側）
      sales: inbox.data?.sales?.visible ? { n: salesWaiting, urgent: true } : undefined,
      dailyops: inbox.data?.dailyops?.visible ? { n: dailyWaiting, urgent: true } : undefined,
      budget: badges.data?.budget !== undefined ? { n: badges.data.budget } : undefined,
      studio: badges.data?.studio !== undefined ? { n: badges.data.studio } : undefined,
      equipment: badges.data?.equipment !== undefined ? { n: badges.data.equipment, urgent: true } : undefined,
    };
    return APPS
      .filter((a) => DAILY_KEYS.includes(a.key))
      .filter((a) => !a.permissionModule || hasPermission(a.permissionModule))
      .map((a) => ({ ...a, badge: badge[a.key]?.n, urgent: badge[a.key]?.urgent }));
  }, [badges.data, salesWaiting, dailyWaiting, inbox.data, hasPermission]);

  // ── アプリ（見出しは出さない・モック `v4-live`）────────────────
  const appsSection = (
    <Reveal>
      <section className="flex flex-col gap-3.5">
        {/* **読み込み中は骨組みを出す。** 空白のまま数字だけ後から入ると、
            タイルが増えたように見えて押し間違える */}
        {badges.isLoading && !badges.data
          ? <TileSkeleton mobile={isMobile} />
          : <AppTiles apps={tiles} mobile={isMobile} />}

        <div className="border-t border-dashed border-border pt-3.5">
          {/* **ここだけ見出しを残す。** 上のタイルと見た目が違う理由は、
              見出しが無いと読み取れない（説明文はモックどおり出さない） */}
          <SectionHeading mobile={isMobile} level={3} title="イベントで使うもの" />
          <div className="mt-2.5">
            <EventTiles mobile={isMobile} />
          </div>
        </div>
      </section>
    </Reveal>
  );

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 p-3 lg:gap-6 lg:p-6">
      {/* ── 挨拶。**数えられた件数だけを書く** ───────────────────── */}
      <Greeting
        greeting={greeting}
        userName={currentUser?.name}
        mobile={isMobile}
        canCount={canCount}
        onWaiting={waitingHref ? () => go(waitingHref) : undefined}
        onOverdue={overdueHref ? () => go(overdueHref) : undefined}
        waitingTotal={waitingTotal}
        myOverdue={myOverdue}
        lastLoaded={lastLoaded}
      />

      {/* スマホは「AIに任せる」を挨拶の直下に1本（モック）。押すとシートが開く */}
      {isMobile && <MobileAiBar canIntake={canSeeDailyops} canOpenProject={canSeeSales} />}

      {/* **PC・スマホとも アプリ → 今日**（モック `v4-live`）。
          M3 / M7 ではスマホだけ「今日」を先に出していたが、モックに戻した */}
      {appsSection}

      {/* ── 今日（見出しは出さない・モック `v4-live`）───────────── */}
      {hasToday && (
      <Reveal>
      <section className="flex flex-col gap-3.5">
        {/* AI に任せる。**投げるのは1秒で終わる行為なので入口の最上部**
            （奥に置くと「あとでいいか」になり、口頭のまま消える）。
            **スマホでは挨拶の下の青いバーの中**にある（モックの ①）ので、ここには出さない */}
        {!isMobile && canSeeDailyops && <TaskIntakeBox canOpenProject={canSeeSales} />}

        {/* ⚠️ **旧「自分のタスクを全部ひらく」（PC のみ）は削除した。**
            `わたしのタスク`／`お待たせ中` を1枚の `TaskHubCard` に統合し、
            カード自身が「全部ひらく」を持つようになったので、
            外に置いていたこのボタンは常に二重になっていた（M7 のときはスマホだけの
            二重に気づいて隠していたが、実は PC でも同じ理由で二重だった） */}

        {inbox.isLoading && !inbox.data ? (
          <Delayed><SkeletonRows rows={4} /></Delayed>
        ) : (
          /* **並びは 今日の予定 → タスク**（`わたしのタスク`／`お待たせ中` は
             `TaskHubCard` の中でタブとして並ぶ。中身は変えていない — まとめただけ */
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {canSeeSales && <TodayCard days={schedule.data} />}
            {(canSeeSales || canSeeDailyops) && (
              <TaskHubCard canSeeDailyops={canSeeDailyops} canSeeSales={canSeeSales} data={inbox.data} can={openable} />
            )}
          </div>
        )}
      </section>
      </Reveal>
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
 * ⚠️ **いま使っているのは「イベントで使うもの」1か所だけです。**
 * 「アプリ」「今日」の見出しはモック `v4-live` に合わせて出さなくしました。
 * **説明文（`note`）は全部やめました** — 出していたのは PC だけで、
 * 毎日開く画面で毎日同じ説明を読ませることになっていたためです。
 * 見出しの大きさが変わっても**読み上げの段（h2 / h3）は変えません**。
 */
function SectionHeading({
  mobile,
  title,
  action,
  level = 2,
}: {
  mobile: boolean;
  title: string;
  action?: ReactNode;
  level?: 2 | 3;
}) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Tag className={mobile ? 'v4-eyebrow' : level === 2 ? 'text-h2' : 'text-cardtitle'}>{title}</Tag>
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
 * アプリタイルの骨組み（読み込み中）。**枚数は本物と同じ 7 枚**にする —
 * 少なく出すと、数字が来た瞬間に下の「今日」が押し下げられて押し間違える。
 */
function TileSkeleton({ mobile }: { mobile: boolean }) {
  const n = 7;
  return (
    <div
      className={mobile ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3'}
      aria-hidden="true"
    >
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className={cn('v4-skeleton rounded-app block', mobile ? 'h-[92px]' : 'h-[96px]')} />
      ))}
    </div>
  );
}
