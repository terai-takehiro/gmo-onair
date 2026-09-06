/**
 * ② 案件管理 ダッシュボード（スマホ・モックの端末枠 2枚目）
 *
 * ── PC の6枚を縦に積みません ────────────────────────────────
 *
 * PC の ① は受付・KPI 5つ・動いている案件・期限超過・止まっている・
 * ステージ別・今週の現場の**7つの塊**です。375px で縦に積むと
 * スクロールが7画面ぶんになり、朝いちばんに開く画面としては使えません。
 *
 * モックが端末枠に描いているのは**3つだけ**です:
 *
 *   ① 案件受付（メールから取り込む／電話・その他を貼る／打合せを録音する）
 *   ② 進行中の案件 ・ 止まっている ・ 自分のタスクがある案件
 *   ③ `一覧 →`
 *
 * ── 受付の3つは全部「もうある画面」 ────────────────────────
 *
 * M2 で ⑦ 電話・その他を貼る（`/sales/inbox/new`）と
 * ⑤ 打合せを録音（`/sales/record`）を作ったので、
 * **モックの3つがそのまま実在の画面に当たります**。
 * PC 側は**見出しの右のボタン1つ**になりました（`IntakeButton`）。こちらは
 * スマホなので、届いたもの・貼る・録音の3行を残しています —
 * ここでは使い回さず、スマホで使うものだけを並べます。
 *
 * ── 「自分のタスクがある案件」の数え方 ────────────────────────
 *
 * **⑧ やること と同じ問い合わせ**（`useTaskDashboard`）から数えます。
 * 自分が担当で未完了のタスクを持つ**案件の数**（タスクの数ではない）。
 * 新しい口を作ると、⑧ と数が食い違ったときにどちらが正か決められません。
 *
 * ── pull-to-refresh・「止まっている」のドリルダウン（M11） ─────────
 *
 * **上に引っ張ると再取得する**（`client-v4/pullToRefresh.tsx`）。3本の問い合わせ
 * （案件の数字・受信箱・自分のタスク）をまとめて引き直す。
 *
 * **「止まっている」だけは押すとシートで中身を見せる。** 他の2つ（進行中の案件・
 * 自分のタスクがある案件）は一覧へ絞り込んで送るだけで十分だが、「止まっている」
 * は PC 版（`StuckPanel`）が**理由付きの一覧**（何日止まっているか・なぜ止まって
 * いると見なすか）を持っており、それをスマホでは1件も見せずに一覧へ飛ばしていた —
 * 押した先で同じ絞り込み一覧を自分でもう一度探すことになる。`overview` クエリが
 * 既に持っている `stuck` 配列（PC 版と同じ）をそのままシートに出す（新しい問い合わせは
 * 増やさない）。シートの下端に「一覧で見る」を残し、1件ずつ開く以外の道も塞がない。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Inbox, ClipboardPaste, Mic, ChevronRight, ArrowRight, Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, SkeletonRows, ErrorPanel, EmptyState } from '@gmo-onair/shared/src/client/states';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useTaskDashboard } from '@/contexts/tasks/hooks/useProjectTasks';
import { intakeCountOf, type InboxData } from '@/contexts/sales/pages/inbox/kinds';
import { TodaySalesCard, TODAY_SALES_KEY } from './TodaySalesCard';
import type { SalesOverview } from './types';

export function MobileSalesDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser, hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const [stuckOpen, setStuckOpen] = useState(false);

  const overview = useQuery<SalesOverview>({
    // **PC と同じ鍵。** 別にすると、幅を変えただけで数字が入れ替わる
    queryKey: ['dashboard', 'sales-overview'],
    queryFn: async () => (await api.get('/dashboard/sales-overview')).data.data,
  });

  const inbox = useQuery<InboxData>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get('/dashboard/inbox')).data.data,
    staleTime: 30_000,
  });

  const tasks = useTaskDashboard();
  const myProjects = useMemo(() => {
    const mine = (tasks.data?.tasks ?? []).filter(
      (t) => !t.is_completed && t.assigned_to === currentUser?.id && t.project_id,
    );
    // **案件の数**（タスクの数ではない）。同じ案件に3つあっても1件
    return new Set(mine.map((t) => t.project_id)).size;
  }, [tasks.data, currentUser?.id]);

  // **PC の「自動取込案件を確認」と同じ数え方**（`intakeCountOf`）。
  // 受信箱の4種類の合計（`counts.total`）を出していたので、押した先の
  // 案件作成に並ぶ件数と一致していなかった
  const waiting = intakeCountOf(inbox.data);
  const kpi = overview.data?.kpi;

  // 「今日の営業」は部品（`TodaySalesCard`）が自分で問い合わせを持つので、
  // ここからは鍵で落とすだけ（refetch の関数を配って回すより取り違えが起きない）
  const refresh = () => Promise.all([
    overview.refetch(), inbox.refetch(), tasks.refetch(),
    qc.invalidateQueries({ queryKey: TODAY_SALES_KEY }),
  ]);

  return (
    <div className="flex flex-col gap-3.5 p-3">
      <PageHeader
        title="ダッシュボード"
        sub="案件はみんなで見ます。個人の持ち物にはしません"
        primaryAction={
          canEdit ? (
            <Button className="w-full sm:w-auto" onClick={() => navigate('/sales/projects/new')}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />案件を作成
            </Button>
          ) : undefined
        }
      />

      <PullToRefresh onRefresh={refresh}>
      <div className="flex flex-col gap-3.5">
      {/* ── ⓪ 今日の営業（docs/core-redesign-plan.md Phase 2 ①） ──────
          PC と同じ部品を最上部に。モックの3ブロックより先に置くのは、
          これが「開いた瞬間に押す先が決まる枚」だから（PC 側と同じ判断）。
          部品は 375px でも1カラムで成立する（Row が縦積みに折り返す） */}
      <TodaySalesCard />

      {/* ── ① 案件受付 ─────────────────────────────────────── */}
      <section className="rounded-card border border-primary-border bg-card p-3.5">
        <h2 className="text-cardtitle mb-2.5 flex items-center gap-2">
          案件受付
          {waiting !== null && waiting > 0 && (
            <span className="rounded-chip font-number inline-flex h-6 min-w-[24px] items-center justify-center bg-destructive px-2 text-sub-sm font-bold text-destructive-foreground">
              {waiting}
            </span>
          )}
        </h2>
        <div className="flex flex-col gap-2">
          <IntakeRow
            icon={Inbox}
            label="メールから取り込む"
            sub="自動で届いたものを見る"
            onOpen={() => navigate('/sales/projects/new')}
          />
          {canEdit && (
            <IntakeRow
              icon={ClipboardPaste}
              label="電話・その他を貼る"
              sub="聞いた話をその場で受付に送る"
              onOpen={() => navigate('/sales/inbox/new')}
            />
          )}
          {canEdit && (
            <IntakeRow
              icon={Mic}
              label="打合せを録音する"
              sub="録って AI に渡す"
              onOpen={() => navigate('/sales/record')}
            />
          )}
        </div>
      </section>

      {/* ── ② 数字3つ ─────────────────────────────────────── */}
      {overview.isError ? (
        <ErrorPanel title="案件の数を読み込めませんでした" error={overview.error} onRetry={() => overview.refetch()} />
      ) : !kpi ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : (
        <div className="flex flex-col gap-2">
          <CountRow
            label="進行中の案件"
            n={kpi.active_projects}
            onOpen={() => navigate('/sales/projects')}
          />
          <CountRow
            label="止まっている"
            sub={`${overview.data?.stuck_days ?? 7}日以上 動きがありません`}
            n={kpi.stuck_projects}
            urgent={kpi.stuck_projects > 0}
            onOpen={() => setStuckOpen(true)}
          />
          {/* **タスクが読めないときは出さない。** 0 と「読めなかった」は別のこと */}
          {tasks.isError ? (
            <p className="text-note text-muted-foreground">
              自分のタスクがある案件は、いま数えられませんでした。
            </p>
          ) : tasks.data ? (
            <CountRow
              label="自分のタスクがある案件"
              sub="担当が自分で、まだ終わっていないもの"
              n={myProjects}
              onOpen={() => navigate('/sales/tasks/list')}
            />
          ) : (
            <Delayed><SkeletonRows rows={1} /></Delayed>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/sales/projects')}
        className="rounded-card min-h-tap flex items-center justify-center gap-1.5 border border-border bg-card px-4 py-3 text-list"
      >
        案件の一覧を見る<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>

      <p className="text-note text-muted-foreground">
        ステージ別の金額・今週の現場は<strong className="font-bold">PC のダッシュボード</strong>に
        出ます（横に並べて比べる画面なので、375px には載せていません）。
      </p>
      </div>
      </PullToRefresh>

      {/*
        ── 「止まっている」のドリルダウン（M11） ──────────────────
        `overview` が既に持っている `stuck`（PC 版 `StuckPanel` と同じ配列）を
        そのままシートに出す。新しい問い合わせは増やさない。
      */}
      <Sheet
        open={stuckOpen}
        onOpenChange={setStuckOpen}
        title="止まっている案件"
        sub={`${overview.data?.stuck_days ?? 7}日以上 動きがないもの`}
        footer={
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setStuckOpen(false); navigate('/sales/projects?sort=last_move'); }}
          >
            一覧で見る
          </Button>
        }
      >
        {(overview.data?.stuck.length ?? 0) === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" aria-hidden="true" />}
            title="止まっている案件はありません"
            description={`進行中の案件はすべて ${overview.data?.stuck_days ?? 7}日以内に動いています。`}
          />
        ) : (
          overview.data?.stuck.map((p) => (
            <Row key={p.id} divider interactive onClick={() => { setStuckOpen(false); navigate(`/sales/projects/${p.id}`); }}>
              <RowSlot w={56} align="center">
                <span className="flex flex-col items-center leading-none">
                  <span className="font-number text-lg font-bold text-destructive">{p.days}</span>
                  <span className="text-sub-sm text-muted-foreground">日</span>
                </span>
              </RowSlot>
              <RowMain>
                <RowTitle>{p.name}</RowTitle>
                <RowSub>{[p.customer_name, p.why].filter(Boolean).join(' ・ ')}</RowSub>
              </RowMain>
            </Row>
          ))
        )}
      </Sheet>
    </div>
  );
}

function IntakeRow({
  icon: Icon, label, sub, onOpen,
}: { icon: typeof Inbox; label: string; sub: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-control min-h-tap flex items-center gap-3 border border-border bg-card px-3.5 py-3 text-left"
    >
      <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
        <Icon className="h-[18px] w-[18px] text-secondary-foreground" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-list block truncate">{label}</span>
        <span className="text-note block truncate text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
    </button>
  );
}

/** 数字の1行。**押すと中身が見える先へ行く**（数だけ出して終わりにしない） */
function CountRow({
  label, sub, n, urgent, onOpen,
}: { label: string; sub?: string; n: number; urgent?: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rounded-card min-h-tap flex items-center gap-3 border border-border bg-card px-4 py-3 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="text-list block">{label}</span>
        {sub && <span className="text-note block text-muted-foreground">{sub}</span>}
      </span>
      <span className={cn('font-number text-h2 shrink-0', urgent && 'text-destructive')}>{n}</span>
      <span className="text-note shrink-0 text-muted-foreground">件</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
    </button>
  );
}
