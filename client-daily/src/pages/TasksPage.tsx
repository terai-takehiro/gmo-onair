/**
 * タスク・依頼 — 1 ページ 4 タブ（要件 D8）
 *
 * 要件: docs/archive/2026/2026-07-25-collaboration-and-personal-agent.md (D2 / D3 / D8 / D9)
 * 設計の正: [docs/design/v4/mockups/tasks-redesign/](../../../docs/design/v4/mockups/tasks-redesign/)
 *
 * 書き留める入口は案件管理アプリのトップ（書き留めるのは 1 秒で終わる行為なので入口に置く）。
 * こちらは**格納先と見直し**。腰を据えて優先順位を見直す場所。
 *
 * GMO イズムに従う点:
 *   - 目標達成10カ条 1-1「期限は何月何日何時何分まで」→ 期限は必ず分まで表示・入力する
 *   - 同 1-1「期限はできるだけ短く」→ クイック選択を短い順に並べる
 *   - 同 9-5「報告は数字で行え」→ チームタブは件数だけ
 *   - 同 10-3「指示をしたら完了させるまでがリーダーの仕事」
 *     → 出した依頼で反応が無いものを依頼者に見せ、差し戻しは決着するまで残す
 *
 * ── 2026-09 の作り直しで直したこと ──────────────────────────
 *
 * ① **主操作をタブごとに変えた。** マイタスク＝タスクを追加／依頼＝**依頼する**。
 *    作り直す前、依頼タブには依頼を作る操作が**1つも無く**、手で1件出す唯一の道は
 *    マイタスクの「追加」で担当者を自分以外に変えることだった（選ぶまでそれが
 *    依頼になると分からない）。**依頼の画面の主操作は「依頼する」**。
 * ② **ページ幅を他の画面に合わせた。** `mx-auto max-w-5xl p-4 sm:p-6` は
 *    このアプリで**この画面だけ**で、他の11画面はすべて全幅（`p-3 lg:p-6`）だった。
 * ③ **タブに件数を付けた。** 「依頼」に出すのは**あなたの番**の件数
 *    （受けたのに返していない ＋ 出したが差し戻されて決めていない）。
 *    未完了の総数を出すと、相手が動いている最中のものまで自分の宿題に見える。
 *
 * タブごとの中身は `pages/tasks/` に分けてある（1ファイル400行の上限）:
 *   MyTasksTab / DelegationsTab / TeamTab / IntakeLogTab
 */
import { useState } from 'react';
import { ListChecks, Inbox, Plus, Send, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { isMyTurn, useMyDelegations, useMyTasks } from '@/lib/tasksApi';
import { IntakeLogTab } from './tasks/IntakeLogTab';
import { MyTasksTab } from './tasks/MyTasksTab';
import { DelegationsTab } from './tasks/DelegationsTab';
import { TeamTab } from './tasks/TeamTab';
import { RequestDialog } from './tasks/RequestDialog';
import { TaskCreateDialog } from './tasks/TaskDialogs';

type TabKey = 'mine' | 'delegations' | 'intake' | 'team';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'mine', label: 'マイタスク', icon: ListChecks },
  { key: 'delegations', label: '依頼', icon: Send },
  { key: 'intake', label: 'メモ履歴', icon: Inbox },
  { key: 'team', label: 'チーム', icon: Users },
];

const SUBS: Record<TabKey, string> = {
  mine: '案件のタスクと個人のタスクを混ぜて、重要度 × 緊急度の順に並べます。期限は何月何日何時何分まで入れてください。',
  delegations: '人に頼んだ仕事と、人から頼まれた仕事。指示をしたら完了させるまでが依頼者の仕事です。',
  intake: '書き留めた文の全文と、そこから生まれたタスクを残しています。あとから遡って見直せます。',
  team: '誰に仕事が偏っているかを見て配り直す画面です。件数だけを出し、タスクの内容は出しません。',
};

export default function TasksPage() {
  const { canEdit } = usePermissions();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : 'mine';
  const setTab = (k: TabKey) => setParams(k === 'mine' ? {} : { tab: k }, { replace: true });

  /** 依頼するダイアログ。チームタブからは相手を決めた状態で開く */
  const [request, setRequest] = useState<{ assignee?: string } | null>(null);
  const [addTask, setAddTask] = useState(false);

  /*
   * **件数はタブの見出しに要る。** マイタスクを開いている人にも
   * 「依頼で自分の番が何件あるか」が見えていないと、依頼タブは開かれない。
   * 取得の鍵は各タブと同じなので、react-query が1回にまとめる
   * （`include_completed` / `include_done` の真偽まで合わせてある）。
   */
  const myTasks = useMyTasks({ include_completed: true });
  const received = useMyDelegations('received', true);
  const sent = useMyDelegations('sent', true);

  const counts: Partial<Record<TabKey, number>> = {
    mine: (myTasks.data?.tasks ?? []).filter((t) => !t.is_completed).length,
    delegations: (received.data ?? []).filter((t) => isMyTurn(t, 'received')).length
      + (sent.data ?? []).filter((t) => isMyTurn(t, 'sent')).length,
  };

  const primaryAction = !canEdit ? undefined
    : tab === 'delegations' ? (
      <Button onClick={() => setRequest({})}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />依頼する
      </Button>
    ) : tab === 'mine' ? (
      <Button onClick={() => setAddTask(true)}>
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />タスクを追加
      </Button>
    ) : undefined;

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        icon={<ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />}
        title="タスク・依頼"
        sub={SUBS[tab]}
        primaryAction={primaryAction}
      />

      {/* タブ。横スクロールでモバイルでも全部に届く */}
      <div className="-mx-3 overflow-x-auto px-3 lg:mx-0 lg:px-0">
        <div className="flex w-max items-center gap-1 border-b border-border pb-px">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'min-h-tap text-list flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 transition-colors lg:min-h-0',
                  active
                    ? 'border-b-2 border-primary bg-primary-surface-weak text-primary'
                    : 'border-b-2 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t.label}
                {/* **依頼の件数は「あなたの番」**。0 のときは数字を出さない（0 は読ませる情報ではない） */}
                {count !== undefined && count > 0 && (
                  <span className={cn(
                    'font-number text-sub-sm font-bold',
                    t.key === 'delegations' ? 'text-destructive' : active ? 'text-primary' : 'text-muted-foreground',
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'mine' && <MyTasksTab />}
      {tab === 'delegations' && <DelegationsTab />}
      {tab === 'intake' && <IntakeLogTab />}
      {tab === 'team' && <TeamTab onRequest={(assignee) => setRequest({ assignee })} canEdit={canEdit} />}

      {request && <RequestDialog assignee={request.assignee} onClose={() => setRequest(null)} />}
      {addTask && <TaskCreateDialog onClose={() => setAddTask(false)} />}
    </div>
  );
}
