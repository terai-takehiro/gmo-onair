/**
 * 日常業務のホーム (`/`) (v4)
 *
 * ── 3つの塊にした ───────────────────────────────────────────
 *
 * 以前は7枚のカードが同じ大きさで並んでいて、**どれが急ぐのかが分からない**
 * 画面だった。v4 のモックに合わせて、やることの種類でまとめる:
 *
 *   定期報告     決まった周期で出すもの (週・日)
 *   届いたもの   外から来て、こちらが仕分けるもの
 *   現場の受付   その日その場で人と向き合うもの
 *
 * 「タスク・依頼」だけは上に単独で置く。**期限があるのはここだけ**で、
 * 他の塊と同じ扱いにすると期限超過が埋もれる。
 *
 * ── 件数は「すでに数えているもの」を使う ────────────────────
 *
 * ホームで数え直さない。書類と情報は `GET /dailyops/alerts`
 * (サーバーが数えたもの)、タスクは `GET /dailyops/tasks/summary`、
 * カードは `GET /dailyops/security-cards/stats`。以前は書類と問い合わせの
 * **一覧を丸ごと取り寄せてから画面で数えて**いたので、「未処理」の定義が
 * 画面とサーバーの2か所にあった。
 *
 * 内覧会だけは一覧から数える (件数の口が無い)。数え方は
 * `inview/logic.ts` の `headOf()` — 受付ページと**同じ関数**を使う。
 */
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, CalendarCheck, ChevronRight, DoorOpen, FileText, Inbox, KeyRound, ListChecks,
  MessageSquareWarning, Newspaper, Sparkles,
} from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { useReports } from '@/lib/reportsApi';
import { useInviewList } from '@/lib/inviewApi';
import { useDailyopsAlerts } from '@/lib/inboxApi';
import { useSecurityCardStats } from '@/lib/securityCardApi';
import { useMyTaskSummary } from '@/lib/tasksApi';
import { useFeedbackTicketCounts } from '@/lib/feedbackTicketsApi';
import { formatDateJa, formatWeekJa, type OpsReport } from '@/lib/types';
import { headOf, todayKey } from './inview/logic';

/** カードに出す小さな札。`tone` は状態の色 (急ぎ = destructive) */
interface Mark { label: string; tone: string }

const MARK_TONE = {
  urgent: 'border-destructive-border bg-destructive-surface text-destructive',
  soon: 'border-warning-border bg-warning-surface text-warning',
  ai: 'border-ai-border bg-ai-surface text-ai',
  done: 'border-success-border bg-success-surface text-success',
  plain: 'bg-muted text-muted-foreground',
} as const;

export default function HomePage() {
  const weekly = useReports('weekly_activity', 1);
  const news = useReports('daily_news', 1);
  const inview = useInviewList({ upcoming: true });
  const alerts = useDailyopsAlerts();
  const cardStats = useSecurityCardStats();
  const tasks = useMyTaskSummary();
  const ticketCounts = useFeedbackTicketCounts();

  const ts = tasks.data;
  const taskMarks: Mark[] = [];
  if (ts?.overdue) taskMarks.push({ label: `期限超過 ${ts.overdue}`, tone: MARK_TONE.urgent });
  if (ts?.due_today) taskMarks.push({ label: `今日が期限 ${ts.due_today}`, tone: MARK_TONE.soon });
  if (ts?.unanswered_delegations) taskMarks.push({ label: `未返答の依頼 ${ts.unanswered_delegations}`, tone: MARK_TONE.plain });

  // 今後の回。人数は受付ページと同じ `headOf()` で数える (定義を1つにする)
  const today = todayKey();
  const upcoming = (inview.data ?? []).filter((r) => !r.session_date || r.session_date >= today);
  const upcomingHead = upcoming.reduce((a, r) => a + headOf(r), 0);

  const pendingDocs = alerts.data?.pendingFinanceDocs ?? 0;
  const unhandled = alerts.data?.unhandledInquiries ?? 0;
  const cs = cardStats.data;

  // バッジは絞り込んだ集合を数えているので、リンク先も同じ絞り込みで開く
  // （InviewPage/SecurityCardsPage 側は `?scope=`/`?filter=` を初期値として読む）。
  // 「貸出中」は「返却遅延」を含むので、どちらのバッジから来ても `filter=lent` でよい
  const cardsHref = cs?.lent ? '/security-cards?filter=lent' : '/security-cards';

  return (
    <div className="flex flex-col gap-5 p-3 lg:gap-6 lg:p-6">
      <PageHeader
        title="日常業務"
        sub="AI が集めて下書きし、人が確かめて仕上げる日々の仕事です"
      />

      <Tile
        to="/tasks"
        icon={ListChecks}
        title="タスク・依頼"
        description="案件と自分のタスクを、重要度 × 緊急度の順に。受けた依頼・出した依頼もここ"
        marks={taskMarks}
        empty="対応待ちのタスクはありません"
      />

      <Group title="定期報告" note="決まった周期で出すもの">
        <Tile
          to="/weekly"
          icon={CalendarCheck}
          title="ウィークリー活動報告"
          description="AI が週の活動を集計して文章にします。人がトピックを足して確定します"
          marks={reportMarks(weekly.data?.[0], 'week')}
          empty="週の報告はまだありません"
        />
        <Tile
          to="/news"
          icon={Newspaper}
          title="デイリーニュース報告"
          description="AI が業界のニュースを毎日集めます。分類と注目度（1〜5）を人が付けます"
          marks={reportMarks(news.data?.[0], 'day')}
          empty="今日のニュースはまだありません"
        />
      </Group>

      <Group title="届いたもの" note="外から来て、こちらが仕分けるもの">
        <Tile
          to="/inquiries"
          icon={Inbox}
          title="問い合わせ"
          description="届いた情報をタスク・案件・保留に仕分けます。見直す日が来ると戻ります"
          // 「未対応」= 未仕分け ＋ 見直しの日が来た「あとで見る」（migration 247）。
          // 画面の見出しと同じ数（サーバーが数えたもの）
          marks={unhandled ? [{ label: `本日対応 ${unhandled}件`, tone: MARK_TONE.ai }] : []}
          empty="本日対応はありません"
        />
        <Tile
          to="/finance"
          icon={FileText}
          title="受領書類"
          description="届いた請求書・注文書を確かめて、台帳（仕入・販管費）に入れます"
          marks={pendingDocs ? [{ label: `未処理 ${pendingDocs}件`, tone: MARK_TONE.soon }] : []}
          empty="未処理はありません"
          // **別のアプリへ移る**（`/budget/documents`）。画面が一度白くなるので、
          // 押す前に行き先のアプリ名を出す（左メニューの札と同じ言い方に揃えてある）
          appHint="財務管理"
        />
        <Tile
          to="/feedback-tickets"
          icon={MessageSquareWarning}
          title="フィードバックチケット"
          description="GMO ONAiR への要望・不具合を送り、対応状況を追いかけます"
          marks={ticketCounts.data && (ticketCounts.data.open + ticketCounts.data.in_progress)
            ? [{ label: `未対応 ${ticketCounts.data.open + ticketCounts.data.in_progress}件`, tone: MARK_TONE.soon }]
            : []}
          empty="未対応のチケットはありません"
        />
      </Group>

      <Group title="現場の受付" note="その日その場で人と向き合うもの">
        <Tile
          to="/inview?scope=upcoming"
          icon={DoorOpen}
          title="内覧会 来場予約"
          description="開催日ごとの名簿。Kairos3 のメールを AI が取り込み、当日の受付にも使います"
          marks={upcoming.length ? [{ label: `今後 ${upcoming.length}組 / ${upcomingHead}名`, tone: MARK_TONE.plain }] : []}
          empty="今後の予約はまだありません"
        />
        <Tile
          to={cardsHref}
          icon={KeyRound}
          title="セキュリティカード"
          description="GMOサムライスタジオ用賀の 24 枚の貸出履歴を追いかけます"
          marks={[
            ...(cs ? [{ label: `貸せる ${cs.available}`, tone: MARK_TONE.done }] : []),
            ...(cs?.lent ? [{ label: `貸出中 ${cs.lent}`, tone: MARK_TONE.soon }] : []),
            ...(cs?.overdue ? [{ label: `返却遅延 ${cs.overdue}`, tone: MARK_TONE.urgent }] : []),
          ]}
          empty="カードの数を集計中"
        />
      </Group>

      <div className="rounded-card border border-border bg-card p-4">
        <p className="text-cardtitle flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />AI との分担
        </p>
        <p className="text-sub mt-1 text-muted-foreground">
          報告は AI が決まった時間に作ります。AI が入れ直すのは
          <strong className="font-bold">本文だけ</strong>で、人が足した行（トピック・ニュース）には触れません。
          使い方はヘッダーの「?」から見られます。
        </p>
      </div>
    </div>
  );
}

/** 最新の報告から札を作る。**「無い」ことも情報**なので、無いときは空で返す */
function reportMarks(latest: OpsReport | undefined, unit: 'week' | 'day'): Mark[] {
  if (!latest) return [];
  const marks: Mark[] = [{
    label: unit === 'week' ? formatWeekJa(latest.period_key) : formatDateJa(latest.period_key),
    tone: MARK_TONE.plain,
  }];
  marks.push(latest.status === 'published'
    ? { label: '確定済み', tone: MARK_TONE.done }
    : { label: '下書き', tone: MARK_TONE.soon });
  if (!latest.reviewed_at) marks.push({ label: '未確認', tone: MARK_TONE.ai });
  return marks;
}

function Group({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-h2">{title}</h2>
        <span className="text-note text-muted-foreground">{note}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Tile({
  to, icon: Icon, title, description, marks, empty, appHint,
}: {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
  marks: Mark[];
  /** 札が1つも無いときに出す一言。**空白にしない** */
  empty: string;
  /**
   * **別のアプリへ移るタイル**に付ける行き先のアプリ名。
   * 押すと別バンドルへ全画面で移る（画面が一度白くなる）ので、
   * 黙って起こさずに名前を出す。左メニューの札と同じ言い方にする
   */
  appHint?: string;
}) {
  return (
    <Link
      to={to}
      className="min-h-tap group flex gap-3 rounded-card border border-border bg-card p-4 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary-surface-weak text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-cardtitle truncate">{title}</span>
          {appHint ? (
            <span className="text-badge inline-flex shrink-0 items-center gap-0.5 rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              {appHint}
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <span className="text-sub mt-1 block text-muted-foreground">{description}</span>
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          {marks.length > 0
            ? marks.map((m) => <TableBadge key={m.label} label={m.label} w={null} className={m.tone} />)
            : <span className="text-sub-sm text-muted-foreground">{empty}</span>}
        </span>
      </span>
    </Link>
  );
}
