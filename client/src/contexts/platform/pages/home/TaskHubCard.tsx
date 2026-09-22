/**
 * トップページの「タスク」(v4・タブ統合版)
 *
 * ── きっかけ（ご指摘）──────────────────────────────────────────
 *
 * 「わたしのタスク」の「全部ひらく」を押すと必ず案件管理のタスク一覧
 * （`/sales/tasks/list`）に着くが、この一覧は **GLS-A（スタジオ案件）の
 * タスクだけ**を出す（`server/.../task-dashboard.routes.ts`）。一方でカード自身が
 * 数えているのは `project_tasks` の**個人タスク（案件に紐づかない）・GLS-A の
 * 案件タスク・GLS-B（プロジェクト管理）の工程タスクを混ぜたもの**
 * （`my-tasks.service.ts` の `listMyTasks`）。つまり押した先に、カードに出ていた
 * 個人タスクやプロジェクト管理のタスクは1件も出てこなかった。
 *
 * ── この回で直したこと ──────────────────────────────────────────
 *
 * ① **「全部ひらく」の行き先を、カードと同じ集合を実際に見られる場所に変えた。**
 *    `GET /dailyops/tasks/mine` は個人・案件・プロジェクトのタスクを混ぜて
 *    「自分に割り当てられたもの」を返す口で、これをそのまま一覧にしている画面が
 *    日常業務の「タスク・依頼」（`/daily/tasks`）に既にあった（マイタスク／依頼／
 *    投入ログ／チームの4タブ）。行き先をここへ変え、権限も一覧が要求する `sales`
 *    ではなく **`dailyops`** に合わせた（このカード自体が `dailyops` の人にしか
 *    出ないので、実質「常に押せる」になる）。別バンドルなので素の遷移で送る
 * ② **「わたしのタスク」と「お待たせ中」を1枚のカードにまとめ、タブで切り替える形にした。**
 *    2枚に分けていた理由（相手を待たせているものが自分の雑務に埋もれる）は
 *    タブで維持している——**中身を混ぜたわけではない**。トップの縦の長さを縮める
 *    ための整理で、`WaitingCard.tsx` / `MyTasksCard.tsx` はこの回で統合した
 * ③ **「お待たせ中」自体をやめるかどうかも検討したが、残す判断にした。**
 *    `GET /dashboard/inbox` は問い合わせ・受領書類・期限超過アクション・
 *    AI起票ネタの4種類を実データから数えており（常に0件になる作りではない）、
 *    やめる積極的な理由が実装からは出てこなかったため
 *
 * ── 根源整理 Phase 1（docs/core-redesign-plan.md §3-3）───────────────
 *
 * ④ **タブ名を「お待たせ中」から「受信箱」に改めた。** 4種は「お客様を待たせて
 *    いる」という1つの状態ではなく、性質も消し方も別々のもの（AI起票ネタ／
 *    期限超過／問い合わせ／書類）で、言葉だけで束ねると意味が読めなかったため。
 *    モックからの逸脱として `docs/v4-mock-deviations.md` に記録済み
 * ⑤ **種類ごとの節に分けて出す。** 4種を混ぜた1本のリストにしない —
 *    種類ごとに取るべき行動が違うため（0件の節は出さない）
 * ⑥ **行にその場のアクションを置いた。** AI起票ネタは「不要」（見送り＝AI の
 *    教師データになる・`inbox/useInboxActions.ts`）、期限超過は「済んだ」
 *    （既存の次回アクション完了の口）。開くだけの行を無くす
 * ⑦ **脚注の「残りN件」は counts（実数）から計算する。** `items` は種類ごとに
 *    上限つきなので、`items.length` から引くと同一カード内でバッジと食い違っていた
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCheck, Inbox, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { TaskDoneButton } from '@gmo-onair/shared/src/client-v4/taskDoneButton';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { InboxData, InboxOpenable } from '@/contexts/sales/pages/inbox/kinds';
import { InboxTab } from './InboxTab';
import type { MyTaskRow, MyTaskSummary } from './types';

type TabKey = 'mine' | 'waiting';

/** 期限を「7/31 17:00」で。**分まで出す**（イズム: 何月何日何時何分まで） */
function fmtDue(v: string | null): string {
  if (!v) return '期限なし';
  const d = new Date(v.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const SHOWN = 4;

export function TaskHubCard({
  canSeeDailyops, canSeeSales, data, can,
}: {
  /** 「自分のタスク」タブを出せるか（`GET /dailyops/tasks/*` が要る） */
  canSeeDailyops: boolean;
  /** 「受信箱」タブを出せるか（`sales` か `dailyops` のどちらか） */
  canSeeSales: boolean;
  data: InboxData | undefined;
  can: InboxOpenable;
}) {
  const showMine = canSeeDailyops;
  const showWaiting = canSeeSales || canSeeDailyops;
  // **`items.length` ではなく `counts.total`。** `items` は種類ごとに上限を掛けて
  // 返す一覧用データなので、溜まっている環境では実数より小さく出る
  const waitingCount = data?.counts.total ?? 0;

  const [tabState, setTab] = useState<TabKey>('mine');
  // **タブが1つしか出せない人には切替を出さない。** 選べないものを選ばせない
  const tab: TabKey = showMine && showWaiting ? tabState : (showMine ? 'mine' : 'waiting');

  return (
    <section className="rounded-card flex h-full flex-col border border-primary-border-strong bg-card p-4 lg:px-5">
      <div className="flex items-center gap-2">
        {showMine && showWaiting ? (
          <div className="flex items-center gap-1 rounded-control-lg border border-border p-0.5">
            <TabButton
              active={tab === 'mine'} onClick={() => setTab('mine')}
              icon={UserCheck} label="自分のタスク"
            />
            <TabButton
              active={tab === 'waiting'} onClick={() => setTab('waiting')}
              icon={Inbox} label="受信箱" count={waitingCount}
            />
          </div>
        ) : (
          <>
            {tab === 'mine'
              ? <UserCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              : <Inbox className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            <h3 className="text-cardtitle text-primary">{tab === 'mine' ? '自分のタスク' : '受信箱'}</h3>
            {tab === 'waiting' && waitingCount > 0 && (
              <span className="rounded-chip font-number inline-flex h-[22px] min-w-[22px] items-center justify-center bg-destructive px-1.5 text-sub-sm font-bold text-destructive-foreground">
                {waitingCount}
              </span>
            )}
          </>
        )}
      </div>

      <div className="mt-2.5 flex flex-1 flex-col">
        {tab === 'mine' ? <MineTab /> : <InboxTab data={data} can={can} />}
      </div>
    </section>
  );
}

function TabButton({
  active, onClick, icon: Icon, label, count,
}: {
  active: boolean; onClick: () => void; icon: typeof UserCheck; label: string; count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-tap rounded-control text-sub flex items-center gap-1.5 px-2.5 py-1.5 lg:min-h-0 ${
        active ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-surface-subtle'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
      {!!count && (
        <span className="rounded-chip font-number inline-flex h-4 min-w-4 items-center justify-center bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════
// 自分のタスク（旧 MyTasksCard の中身。枠と見出しだけ外に出した）
// ══════════════════════════════════════════════════

function MineTab() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  /** 対応済にできるか。`PATCH /dailyops/tasks/:id` が editor を要求する */
  const canComplete = hasPermission('dailyops', 'editor');

  const summary = useQuery<MyTaskSummary>({
    queryKey: queryKeys.dashboard.myTaskSummary(),
    queryFn: async () => (await api.get('/dailyops/tasks/summary')).data.data,
    staleTime: 60_000,
  });

  const mine = useQuery<{ data: MyTaskRow[] }>({
    queryKey: ['home', 'my-tasks'],
    queryFn: async () => (await api.get('/dailyops/tasks/mine', { params: { limit: 8 } })).data,
    staleTime: 60_000,
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/dailyops/tasks/${id}`, { is_completed: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['home', 'my-tasks'] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.myTaskSummary() });
      // 全案件のタスク一覧も同じタスクを別の鍵で持っている
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
    },
    onError: (e) => notifyApiError('対応済にできませんでした', e),
  });

  const rows = useMemo(() => mine.data?.data ?? [], [mine.data]);
  const s = summary.data;

  const chips = [
    { label: '期限超過', n: s?.overdue ?? 0, tone: 'border-destructive-border bg-destructive-surface text-destructive' },
    // 期限の言い方は `activityLog/dueState.ts` の `duePartsOf` と揃える（✕「今日まで」→ ○「本日」）
    { label: '本日', n: s?.due_today ?? 0, tone: 'border-warning-border bg-warning-surface text-warning' },
    { label: '返事待ちの依頼', n: s?.unanswered_delegations ?? 0, tone: 'border-border bg-surface-subtle text-secondary-foreground' },
  ];

  return (
    <>
      <div className="flex justify-end">
        {/* 別バンドル（`/daily/`）なので素の遷移で送る。行き先はこのカードと
            同じ集合（個人 + 案件 + プロジェクトのタスクを混ぜたもの）を出す画面 */}
        <a
          href="/daily/tasks"
          className="min-h-tap text-note flex items-center gap-0.5 font-bold text-primary hover:underline lg:min-h-0"
        >
          すべて開く<ArrowRight className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-1 flex gap-2">
        {chips.map((c) => (
          <span key={c.label} className={`rounded-control-lg min-w-0 flex-1 border px-2.5 py-1.5 ${c.tone}`}>
            <span className="font-number block text-h2 leading-tight">{c.n}</span>
            <span className="text-note block truncate text-muted-foreground">{c.label}</span>
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sub mt-3 text-secondary-foreground">
          {mine.isLoading ? '' : '自分に割り当てられた未対応のタスクはありません。'}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col">
          {rows.slice(0, SHOWN).map((t) => (
            <div key={t.id} className="flex items-start gap-2.5 border-t border-border-subtle py-2">
              <span className="min-w-0 flex-1">
                <span className="text-sub block [overflow-wrap:anywhere]">{t.title}</span>
                <span className="text-note block truncate text-muted-foreground">
                  {[t.gls_number, t.project_name, fmtDue(t.due_at)].filter(Boolean).join(' ・ ')}
                </span>
              </span>
              {t.is_overdue && (
                <span className="rounded-badge-xs inline-flex h-[22px] shrink-0 items-center bg-destructive-surface px-2 text-note font-bold text-destructive">
                  超過
                </span>
              )}
              {/*
                ⚠️ **対応済にできる人にだけ出す。** 読むだけの人に出すと押した先が 403。
                四角のチェックから**文字のボタン**に替えた（押すと何が起きるか読める）
              */}
              {canComplete && (
                <TaskDoneButton
                  done={false}
                  onToggle={() => complete.mutate(t.id)}
                  taskTitle={t.title}
                  disabled={complete.isPending}
                  size="sm"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// 受信箱タブの中身は `./InboxTab.tsx`（1ファイル400行の上限で分けた。
// 節分け・行アクションの理由もそちらの冒頭に書いてある）
