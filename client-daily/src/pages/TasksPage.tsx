// タスク・依頼 — 1 ページ 4 タブ (要件 D8)。
//
// 要件: docs/archive/2026/2026-07-25-collaboration-and-personal-agent.md (D2 / D3 / D8)
//
// 投入口は案件管理アプリのトップ (投げるのは 1 秒で終わる行為なので入口に置く)。
// こちらは**格納先と棚卸し**。腰を据えて優先順位を見直す場所。
//
// GMO イズムに従う点:
//   - 目標達成10カ条 1-1「期限は何月何日何時何分まで」→ 期限は必ず分まで表示・入力する
//   - 同 1-1「期限はできるだけ短く」→ クイック選択を短い順に並べる
//   - 同 9-5「報告は数字で行え」→ チームタブは件数だけ
//   - 同 10-3「指示をしたら完了させるまでがリーダーの仕事」
//     → 出した依頼で反応が無いものを依頼者に見せ、差し戻しは決着するまで残す
//
// タブごとの中身は `pages/tasks/` に分けてある（1ファイル400行の上限）:
//   MyTasksTab / DelegationsTab / TeamTab / IntakeLogTab

import { ListChecks, Inbox, Send, Users } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { cn } from '@/lib/utils';
import { IntakeLogTab } from './tasks/IntakeLogTab';
import { MyTasksTab } from './tasks/MyTasksTab';
import { DelegationsTab } from './tasks/DelegationsTab';
import { TeamTab } from './tasks/TeamTab';

type TabKey = 'mine' | 'delegations' | 'intake' | 'team';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'mine', label: 'マイタスク', icon: ListChecks },
  { key: 'delegations', label: '依頼', icon: Send },
  { key: 'intake', label: '投入ログ', icon: Inbox },
  { key: 'team', label: 'チーム', icon: Users },
];

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : 'mine';
  const setTab = (k: TabKey) => setParams(k === 'mine' ? {} : { tab: k }, { replace: true });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader
        icon={<ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />}
        title="タスク・依頼"
        sub="案件のタスクと個人のタスクを混ぜて、重要度 × 緊急度の順に並べます。期限は何月何日何時何分まで入れてください。"
      />

      {/* タブ。横スクロールでモバイルでも全部に届く */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max items-center gap-1 border-b border-border pb-px">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'min-h-tap lg:min-h-0 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-list transition-colors',
                  active
                    ? 'border-b-2 border-primary bg-primary/10 text-primary'
                    : 'border-b-2 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'mine' && <MyTasksTab />}
      {tab === 'delegations' && <DelegationsTab />}
      {tab === 'intake' && <IntakeLogTab />}
      {tab === 'team' && <TeamTab />}
    </div>
  );
}
