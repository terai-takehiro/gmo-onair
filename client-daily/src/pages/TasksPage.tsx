// タスク・依頼 — 1 ページ 4 タブ (要件 D8)。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (D2 / D3 / D8)
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

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ListChecks, LayoutGrid, List, Users, Inbox, Plus, Loader2, Check, X, MessageCircle,
  Clock, AlertTriangle, ChevronRight, Sparkles, Pencil, Send, UserPlus, Undo2, Trash2, Eye, EyeOff,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import {
  useMyTasks, useMyDelegations, useTaskIntakes, useTaskIntake, useTeamLoad, useAssignees,
  useUpdateTask, useRespondDelegation, useResolveDelegation, useCreateTask,
  CELL_ACTION, LEVEL_LABELS, DELEGATION_LABELS,
  formatDue, toLocalInput, fromLocalInput, daysSinceRequested, scoreTone,
  type MyTask, type TaskIntake,
} from '@/lib/tasksApi';

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
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ListChecks className="h-5 w-5 text-primary" />タスク・依頼
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          案件のタスクと個人のタスクを混ぜて、重要度 × 緊急度の順に並べます。
          期限は何月何日何時何分まで入れてください。
        </p>
      </div>

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
                  'min-h-tap lg:min-h-0 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2 text-sm font-medium transition-colors',
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

// ══════════════════════════════════════════════════
// マイタスク
// ══════════════════════════════════════════════════

/** 9 マスの並び。上が重要、左が緊急。位置に意味があるので固定 */
const CELL_GRID: string[][] = [
  ['3x3', '3x2', '3x1'],
  ['2x3', '2x2', '2x1'],
  ['1x3', '1x2', '1x1'],
];

function MyTasksTab() {
  const { canEdit } = usePermissions();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<MyTask | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useMyTasks({ include_completed: showDone });
  const tasks = data?.tasks ?? [];
  const canOpenProject = data?.canOpenProject ?? false;

  const open = tasks.filter((t) => !t.is_completed);
  const top3 = open.slice(0, 3);

  // 健康診断: 「重要 高 × 緊急 低」が 0 件なら目の前の火消しだけをしている (要件 D2)
  const planCount = open.filter((t) => t.priority_cell === '3x1').length;
  const junkCount = open.filter((t) => t.priority_score === 1).length;

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* 今日やること 3 件 — 常に最上部に置く */}
      {top3.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs font-semibold text-primary">まずこの 3 件</p>
            <div className="mt-2 space-y-1.5">
              {top3.map((t, i) => (
                <div key={t.id} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <span className={cn(t.is_overdue && 'font-medium text-red-700')}>
                        {formatDue(t.due_at)}{t.is_overdue ? '（期限超過）' : ''}
                      </span>
                      <span>{CELL_ACTION[t.priority_cell] ?? ''}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <ViewBtn active={view === 'list'} onClick={() => setView('list')} icon={List}>スコア順</ViewBtn>
          <ViewBtn active={view === 'board'} onClick={() => setView('board')} icon={LayoutGrid}>9 マス</ViewBtn>
        </div>
        <button
          onClick={() => setShowDone((v) => !v)}
          className={cn('min-h-tap lg:min-h-0 rounded-md px-3 py-1.5 text-sm', showDone ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent')}
        >
          完了も表示
        </button>
        <span className="text-xs text-muted-foreground">未完了 {open.length} 件</span>
        {canEdit && (
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" />追加
          </Button>
        )}
      </div>

      {/* 健康診断 (イズム: 緊急に流されて重要が後回しになるのを防ぐ) */}
      {open.length > 0 && planCount === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            「重要 高 × 緊急 低（予定を取って守る）」が 0 件です。
            目の前の火消しだけになっていないか見てください。
          </span>
        </div>
      )}
      {junkCount >= 5 && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span>「やらない候補（スコア 1）」が {junkCount} 件あります。棚卸ししてください。</span>
        </div>
      )}

      {tasks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          タスクはありません。案件管理アプリのトップの投入欄から書き留められます。
        </CardContent></Card>
      ) : view === 'list' ? (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} t={t} canEdit={canEdit} canOpenProject={canOpenProject} onEdit={() => setEditing(t)} />
          ))}
        </div>
      ) : (
        <NineCellBoard tasks={open} canEdit={canEdit} onEdit={setEditing} />
      )}

      {editing && <TaskEditDialog task={editing} onClose={() => setEditing(null)} />}
      {adding && <TaskCreateDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function ViewBtn({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'min-h-tap lg:min-h-0 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        active ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent'
      )}
    >
      <Icon className="h-4 w-4" />{children}
    </button>
  );
}

/**
 * 9 マスボード。**位置に意味がある**ので並びは固定。
 * 375px には 3 列が入らないため横スクロールにする (要件 D8)。
 */
function NineCellBoard({ tasks, canEdit, onEdit }: {
  tasks: MyTask[]; canEdit: boolean; onEdit: (t: MyTask) => void;
}) {
  const byCell = useMemo(() => {
    const m: Record<string, MyTask[]> = {};
    for (const t of tasks) (m[t.priority_cell] ??= []).push(t);
    return m;
  }, [tasks]);

  return (
    // 列幅はモバイルでは **固定 220px**。`1fr` にすると w-max (max-content) の下で
    // トラックが中身の最長テキストまで膨らみ (実測 766px)、スクロールコンテナが
    // その幅を認識できず「緊急 中 / 緊急 低 に横スクロールで到達できない」状態になる。
    // sm 以上は画面に 3 列入るので 1fr で等分する。
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="w-max min-w-full sm:w-full">
        <div className="mb-1.5 grid grid-cols-[52px_repeat(3,220px)] gap-2 text-center text-[11px] font-semibold text-muted-foreground sm:grid-cols-[52px_repeat(3,minmax(0,1fr))]">
          <div />
          <div>緊急 高</div><div>緊急 中</div><div>緊急 低</div>
        </div>
        <div className="space-y-2">
          {CELL_GRID.map((row, ri) => (
            <div key={ri} className="grid grid-cols-[52px_repeat(3,220px)] gap-2 sm:grid-cols-[52px_repeat(3,minmax(0,1fr))]">
              <div className="flex items-center justify-center text-[11px] font-semibold text-muted-foreground">
                重要 {LEVEL_LABELS[3 - ri]}
              </div>
              {row.map((cell) => {
                const list = byCell[cell] ?? [];
                const score = Number(cell[0]) * Number(cell[2]);
                return (
                  // min-w-0 が無いと grid item の自動最小サイズが min-content になり、
                  // nowrap な truncate テキストがトラックを押し広げてしまう
                  <div key={cell} className="min-w-0 rounded-lg border border-border bg-card p-2">
                    <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                      <span className={cn('shrink-0 rounded border px-1.5 py-0.5 font-number text-[11px] font-bold', scoreTone(score))}>
                        {score}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">{CELL_ACTION[cell]}</span>
                    </div>
                    {list.length === 0 ? (
                      <p className="py-2 text-center text-[11px] text-muted-foreground/60">—</p>
                    ) : (
                      <div className="space-y-1">
                        {list.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => canEdit && onEdit(t)}
                            className="block w-full min-w-0 rounded border border-border/60 bg-background px-2 py-1.5 text-left transition-colors hover:bg-accent"
                          >
                            <p className="truncate text-xs font-medium">{t.title}</p>
                            <p className={cn('mt-0.5 truncate text-[10px]', t.is_overdue ? 'font-medium text-red-700' : 'text-muted-foreground')}>
                              {formatDue(t.due_at)}
                              {t.gls_number && <span className="ml-1">{t.gls_number}</span>}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskRow({ t, canEdit, canOpenProject, onEdit }: {
  t: MyTask; canEdit: boolean; canOpenProject: boolean; onEdit: () => void;
}) {
  const update = useUpdateTask();
  return (
    <Card className={cn(t.is_completed && 'opacity-60', t.is_overdue && 'border-red-200')}>
      <CardContent className="flex items-start gap-2.5 p-3">
        {canEdit && (
          <button
            onClick={() => update.mutate({ id: t.id, patch: { is_completed: !t.is_completed } })}
            disabled={update.isPending}
            className={cn(
              'v4-tap mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
              t.is_completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40 hover:border-primary'
            )}
            title={t.is_completed ? '未完了に戻す' : '完了にする'}
          >
            {t.is_completed && <Check className="h-3.5 w-3.5" />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded border px-1.5 py-0.5 font-number text-[11px] font-bold', scoreTone(t.priority_score))}>
              {t.priority_score}
            </span>
            <span className="text-[11px] text-muted-foreground">{CELL_ACTION[t.priority_cell]}</span>
            {t.gls_number && (
              canOpenProject ? (
                <a
                  href={`/sales/projects/${t.project_id}`}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:underline"
                  title={t.project_name ?? undefined}
                >
                  {t.gls_number}
                </a>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={t.project_name ?? undefined}>
                  {t.gls_number}
                </span>
              )
            )}
            {t.requester_id && t.delegation_status && (
              <Badge variant="outline" className="text-[10px]">
                {DELEGATION_LABELS[t.delegation_status]}
              </Badge>
            )}
            {t.visibility === 'private' && (
              <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                <EyeOff className="h-3 w-3" />自分だけ
              </span>
            )}
            {t.source?.startsWith('intake') && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">
                <Sparkles className="h-3 w-3" />AI作成
              </span>
            )}
          </div>
          <p className={cn('mt-1 text-sm font-medium', t.is_completed && 'line-through')}>{t.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className={cn('flex items-center gap-0.5', t.is_overdue && 'font-medium text-red-700')}>
              <Clock className="h-3 w-3" />{formatDue(t.due_at)}{t.is_overdue ? '（期限超過）' : ''}
            </span>
            <span>重要 {LEVEL_LABELS[t.importance]} × 緊急 {LEVEL_LABELS[t.urgency]}</span>
            {t.requester_name && <span>{t.requester_name} さんから</span>}
          </p>
        </div>
        {canEdit && (
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onEdit} title="編集">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════
// 依頼
// ══════════════════════════════════════════════════

function DelegationsTab() {
  const { canEdit } = usePermissions();
  const [includeDone, setIncludeDone] = useState(false);
  const { data: received, isLoading: l1 } = useMyDelegations('received', includeDone);
  const { data: sent, isLoading: l2 } = useMyDelegations('sent', includeDone);

  if (l1 || l2) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => setIncludeDone((v) => !v)}
        className={cn('min-h-tap lg:min-h-0 rounded-md px-3 py-1.5 text-sm', includeDone ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent')}
      >
        完了した依頼も表示
      </button>

      <section>
        <h2 className="mb-2 text-sm font-semibold">受けた依頼 <span className="text-muted-foreground">{(received ?? []).length}</span></h2>
        {(received ?? []).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">受けた依頼はありません。</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(received ?? []).map((t) => <ReceivedRow key={t.id} t={t} canEdit={canEdit} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">出した依頼 <span className="text-muted-foreground">{(sent ?? []).length}</span></h2>
        <p className="mb-2 text-xs text-muted-foreground">
          指示をしたら完了させるまでが依頼者の仕事です。反応が無いものと差し戻されたものを上に出しています。
        </p>
        {(sent ?? []).length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">出した依頼はありません。</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {(sent ?? []).map((t) => <SentRow key={t.id} t={t} canEdit={canEdit} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function ReceivedRow({ t, canEdit }: { t: MyTask; canEdit: boolean }) {
  const respond = useRespondDelegation();
  const [noteFor, setNoteFor] = useState<'declined' | 'consulting' | null>(null);
  const [note, setNote] = useState('');
  const unanswered = t.delegation_status === 'requested';

  return (
    <Card className={cn(unanswered && 'border-violet-200 bg-violet-50/40', t.is_overdue && 'border-red-200')}>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded border px-1.5 py-0.5 font-number text-[11px] font-bold', scoreTone(t.priority_score))}>
            {t.priority_score}
          </span>
          {t.delegation_status && (
            <Badge variant="outline" className={cn('text-[10px]', unanswered && 'border-violet-300 text-violet-700')}>
              {DELEGATION_LABELS[t.delegation_status]}
            </Badge>
          )}
          {t.gls_number && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.gls_number}</span>}
        </div>
        <p className="mt-1 text-sm font-medium">{t.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          {t.requester_name && <span>{t.requester_name} さんから</span>}
          <span className={cn('flex items-center gap-0.5', t.is_overdue && 'font-medium text-red-700')}>
            <Clock className="h-3 w-3" />{formatDue(t.due_at)}{t.is_overdue ? '（期限超過）' : ''}
          </span>
        </p>
        {t.description && (
          <p className="mt-1.5 whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs text-muted-foreground">{t.description}</p>
        )}

        {canEdit && unanswered && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" className="h-8 gap-1 text-xs" disabled={respond.isPending}
                onClick={() => respond.mutate({ id: t.id, decision: 'accepted' })}>
                <Check className="h-3.5 w-3.5" />受ける
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                onClick={() => { setNoteFor('consulting'); setNote(''); }}
                title="依頼者に差し戻して相談します（消えません）">
                <MessageCircle className="h-3.5 w-3.5" />相談
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                onClick={() => { setNoteFor('declined'); setNote(''); }}
                title="依頼者に差し戻します（消えません）">
                <X className="h-3.5 w-3.5" />辞退
              </Button>
            </div>
            {noteFor && (
              <div className="mt-2 space-y-1.5 rounded-lg border border-border bg-muted/30 p-2">
                <Label className="text-xs">
                  {noteFor === 'declined' ? '辞退の理由' : '相談したいこと'}（依頼者に差し戻されます）
                </Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder={noteFor === 'declined' ? '例: 同じ期限で別の本番が入っています' : '例: 期限を1日ずらせますか'} />
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-8 text-xs" disabled={respond.isPending}
                    onClick={() => respond.mutate({ id: t.id, decision: noteFor, note }, { onSuccess: () => setNoteFor(null) })}>
                    差し戻す
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setNoteFor(null)}>やめる</Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SentRow({ t, canEdit }: { t: MyTask; canEdit: boolean }) {
  const resolve = useResolveDelegation();
  const { data: users } = useAssignees();
  const { currentUser } = useAuth();
  const [reassignTo, setReassignTo] = useState('');
  const bounced = t.delegation_status === 'declined' || t.delegation_status === 'consulting';
  const stale = t.delegation_status === 'requested' ? (daysSinceRequested(t.requested_at) ?? 0) : 0;

  return (
    <Card className={cn(bounced && 'border-amber-300 bg-amber-50/40', t.is_overdue && 'border-red-200')}>
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded border px-1.5 py-0.5 font-number text-[11px] font-bold', scoreTone(t.priority_score))}>
            {t.priority_score}
          </span>
          {t.delegation_status && (
            <Badge variant="outline" className={cn('text-[10px]', bounced && 'border-amber-400 text-amber-800')}>
              {bounced ? `差し戻し（${DELEGATION_LABELS[t.delegation_status]}）` : DELEGATION_LABELS[t.delegation_status]}
            </Badge>
          )}
          {t.gls_number && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t.gls_number}</span>}
        </div>
        <p className="mt-1 text-sm font-medium">{t.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          <span>{t.assigned_to_name ?? '担当者不明'} さんへ</span>
          <span className={cn('flex items-center gap-0.5', t.is_overdue && 'font-medium text-red-700')}>
            <Clock className="h-3 w-3" />{formatDue(t.due_at)}{t.is_overdue ? '（期限超過）' : ''}
          </span>
        </p>

        {/* 滞留: 見たけれど答えない状態は依頼者側に見せて催促の判断をさせる (要件 D3) */}
        {stale >= 3 && (
          <p className="mt-1.5 flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-900">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {stale} 日間反応がありません。声をかけてください。
          </p>
        )}

        {t.description && (
          <p className="mt-1.5 whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs text-muted-foreground">{t.description}</p>
        )}

        {/* 差し戻しは依頼者が決着をつけるまで残る (消さない) */}
        {canEdit && bounced && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-background p-2">
            <p className="text-xs font-medium">この依頼をどうしますか</p>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: t.id, action: 'take_over' })}>
                <Undo2 className="h-3.5 w-3.5" />自分でやる
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={resolve.isPending || !reassignTo}
                onClick={() => resolve.mutate({ id: t.id, action: 'reassign', assigned_to: reassignTo })}>
                <UserPlus className="h-3.5 w-3.5" />振り直す
              </Button>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">相手を選ぶ…</option>
                {(users ?? []).filter((u) => u.id !== currentUser?.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-destructive" disabled={resolve.isPending}
                onClick={() => { if (confirm('この依頼を取り下げます。よろしいですか？')) resolve.mutate({ id: t.id, action: 'withdraw' }); }}>
                <Trash2 className="h-3.5 w-3.5" />取り下げる
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════
// 投入ログ — 後から遡ってレビューする画面
// ══════════════════════════════════════════════════

/**
 * ⚠️ **5つとも書くこと**（レビューでの指摘 #77）。前の版は録音の2つ
 * （`transcribing` / `failed`）が抜けており、`?? it.status` に落ちて
 * **投入ログに英語のまま**（`transcribing`）出ていました。
 * 応答は `as TaskIntake[]` で受けるので**型チェックには出ません**。
 */
const INTAKE_STATUS_LABELS: Record<string, string> = {
  pending: '確認待ち', committed: '登録済み', discarded: '破棄',
  transcribing: '文字起こし中', failed: '文字起こし失敗',
};
const INTAKE_KIND_LABELS: Record<string, string> = {
  freeform: 'ひとこと', minutes: '議事録', mail: 'メール', chat: 'チャット', other: 'その他',
};

function IntakeLogTab() {
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useTaskIntakes({ all });

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  const list = data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        投げたテキストは切り詰めずに全文残しています。タスクの元になった発言まで遡れます。
      </p>
      <div className="flex items-center gap-1.5 text-sm">
        <button onClick={() => setAll(false)} className={cn('rounded-md px-3 py-1.5', !all ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent')}>自分の投入</button>
        <button onClick={() => setAll(true)} className={cn('rounded-md px-3 py-1.5', all ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent')}>全員の投入</button>
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          投入はまだありません。案件管理アプリのトップの投入欄から書き留められます。
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map((it) => <IntakeRow key={it.id} it={it} onOpen={() => setOpenId(it.id)} />)}
        </div>
      )}

      {openId && <IntakeDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function IntakeRow({ it, onOpen }: { it: TaskIntake; onOpen: () => void }) {
  const pending = it.status === 'pending';
  return (
    <Card className={cn(pending && 'border-sky-200 bg-sky-50/40')}>
      <CardContent className="p-3">
        <button onClick={onOpen} className="w-full text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px]', pending && 'border-sky-300 text-sky-700')}>
              {INTAKE_STATUS_LABELS[it.status] ?? it.status}
            </Badge>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {INTAKE_KIND_LABELS[it.kind] ?? it.kind}
            </span>
            <span className="text-[11px] text-muted-foreground">タスク {it.task_count} 件</span>
            {it.created_by_name && <span className="text-[11px] text-muted-foreground">{it.created_by_name}</span>}
            <span className="ml-auto flex items-center gap-0.5 text-[11px] text-muted-foreground">
              {formatDue(it.created_at)}<ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm">{it.raw_text}</p>
        </button>
        {pending && (
          <p className="mt-1.5 text-[11px] text-sky-800">
            確認待ちです。登録しないと相手には届きません。案件管理アプリのトップから確認してください。
          </p>
        )}
        {/*
          **失敗した理由をここに出す。** 出さないと「録音したのに何も出てこない」で終わり、
          投げた本人は録り直すかどうかも決められない（サーバーは理由を返している）
        */}
        {it.status === 'failed' && (
          <p className="mt-1.5 text-[11px] text-destructive">
            {it.error_message ?? '文字起こしに失敗しました。もう一度投げ直してください'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function IntakeDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useTaskIntake(id);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>投入の内容</DialogTitle></DialogHeader>
        {isLoading || !data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">{INTAKE_STATUS_LABELS[data.status] ?? data.status}</Badge>
              <span>{INTAKE_KIND_LABELS[data.kind] ?? data.kind}</span>
              <span>{formatDue(data.created_at)}</span>
              {data.created_by_name && <span>{data.created_by_name}</span>}
            </div>
            <div>
              <Label className="text-xs">投げた原文（全文）</Label>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm">{data.raw_text}</p>
            </div>
            <div>
              <Label className="text-xs">ここから生まれたタスク（{data.generated_tasks.length} 件）</Label>
              {data.generated_tasks.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">まだありません。</p>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {data.generated_tasks.map((t) => (
                    <div key={t.id} className="rounded-lg border border-border p-2">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                        <span>{t.assigned_to_name ?? '担当者未定'}</span>
                        <span>{formatDue(t.due_at)}</span>
                        {t.gls_number && <span>{t.gls_number}</span>}
                        {t.is_completed && <span className="text-emerald-700">完了</span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>閉じる</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════
// チーム — 件数だけ。中身は出さない (要件 D8)
// ══════════════════════════════════════════════════

function TeamTab() {
  const { data, isLoading } = useTeamLoad();
  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  const rows = data ?? [];

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        誰が溢れているかを見て仕事を配り直すための画面です。件数だけを出し、タスクの内容は表示しません
        （「自分だけ」に設定されたタスクも件数には入りますが中身は出ません）。
      </p>
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">メンバーがいません。</CardContent></Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <th className="py-2 pr-2 font-medium">メンバー</th>
                <th className="px-2 py-2 text-right font-medium">未完了</th>
                <th className="px-2 py-2 text-right font-medium">期限超過</th>
                <th className="px-2 py-2 text-right font-medium">スコア 9</th>
                <th className="px-2 py-2 text-right font-medium">未返答の依頼</th>
                <th className="px-2 py-2 text-right font-medium">期限なし</th>
                <th className="px-2 py-2 text-right font-medium">自分だけ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b border-border/60">
                  <td className="py-2 pr-2 font-medium">{r.user_name}</td>
                  <Num v={r.open_count} />
                  <Num v={r.overdue_count} tone={r.overdue_count > 0 ? 'text-red-700' : undefined} />
                  <Num v={r.top_priority_count} tone={r.top_priority_count > 0 ? 'text-rose-700' : undefined} />
                  <Num v={r.unanswered_count} tone={r.unanswered_count > 0 ? 'text-violet-700' : undefined} />
                  <Num v={r.no_due_count} tone={r.no_due_count > 0 ? 'text-amber-700' : undefined} />
                  <Num v={r.private_count} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Num({ v, tone }: { v: number; tone?: string }) {
  return (
    <td className={cn('px-2 py-2 text-right font-number tabular-nums', v === 0 ? 'text-muted-foreground/50' : tone)}>
      {v}
    </td>
  );
}

// ══════════════════════════════════════════════════
// 編集 / 作成ダイアログ
// ══════════════════════════════════════════════════

/**
 * 期限のクイック選択。**短い順に並べる**のが意図。
 * イズム (目標達成10カ条 1-1)「期限はできるだけ短く設定する」を選択肢の並びで示す。
 */
function dueQuickPicks(): { label: string; value: string }[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const at = (d: Date, h: number, m: number) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(h)}:${pad(m)}`;
  };
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const friday = new Date(now); friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7 || 7));
  const nextMon = new Date(now); nextMon.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  return [
    { label: '今日 18:00', value: at(now, 18, 0) },
    { label: '明日 10:00', value: at(tomorrow, 10, 0) },
    { label: '明日 18:00', value: at(tomorrow, 18, 0) },
    { label: '金曜 18:00', value: at(friday, 18, 0) },
    { label: '来週月曜 10:00', value: at(nextMon, 10, 0) },
  ];
}

function LevelPicker({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex gap-1">
        {[3, 2, 1].map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => onChange(lv)}
            className={cn(
              'flex-1 rounded-md border py-1.5 text-xs transition-colors',
              value === lv ? 'border-primary bg-primary/15 font-medium text-primary' : 'border-input hover:bg-accent'
            )}
          >
            {LEVEL_LABELS[lv]}
          </button>
        ))}
      </div>
    </div>
  );
}

function DueField({ value, onChange, required }: {
  value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div>
      {/* 聞き方でイズムを伝える (「いつまで？」ではなく「何月何日何時何分まで？」) */}
      <Label className="text-xs">
        何月何日何時何分まで {required && <span className="text-destructive">*</span>}
      </Label>
      <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1" />
      <div className="mt-1.5 flex flex-wrap gap-1">
        {dueQuickPicks().map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange(q.value)}
            className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TaskEditDialog({ task, onClose }: { task: MyTask; onClose: () => void }) {
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(toLocalInput(task.due_at));
  const [imp, setImp] = useState(task.importance);
  const [urg, setUrg] = useState(task.urgency);
  const [vis, setVis] = useState<'team' | 'private'>(task.visibility);
  const [err, setErr] = useState<string | null>(null);
  const isDelegation = !!task.requester_id;
  const score = imp * (due ? urg : 1);

  const save = () => {
    setErr(null);
    if (!title.trim()) { setErr('やることを入力してください'); return; }
    if (isDelegation && !due) { setErr('依頼の期限は空にできません。何月何日何時何分までかを入れてください'); return; }
    update.mutate(
      { id: task.id, patch: { title: title.trim(), due_at: fromLocalInput(due), importance: imp, urgency: urg, visibility: vis } },
      { onSuccess: onClose, onError: (e) => setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '保存に失敗しました') }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>タスクを編集</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {err && <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{err}</p>}
          <div>
            <Label className="text-xs">やること</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <DueField value={due} onChange={setDue} required={isDelegation} />
          {isDelegation && (
            <p className="text-[11px] text-muted-foreground">
              これは {task.requester_name ?? '誰か'} さんからの依頼です。期限は必須です。
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LevelPicker label="重要度" value={imp} onChange={setImp} />
            <LevelPicker label="緊急度" value={urg} onChange={setUrg} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
            <span className={cn('rounded border px-1.5 py-0.5 font-number text-xs font-bold', scoreTone(score))}>{score}</span>
            <span className="text-xs text-muted-foreground">
              {CELL_ACTION[`${imp}x${due ? urg : 1}`]}
              {!due && '（期限が無いので緊急度は低として扱います）'}
            </span>
          </div>
          {!isDelegation && (
            <div>
              <Label className="text-xs">見せる範囲</Label>
              <div className="mt-1 flex gap-1">
                <button type="button" onClick={() => setVis('team')}
                  className={cn('flex-1 rounded-md border py-1.5 text-xs', vis === 'team' ? 'border-primary bg-primary/15 font-medium text-primary' : 'border-input hover:bg-accent')}>
                  チームに見せる
                </button>
                <button type="button" onClick={() => setVis('private')}
                  className={cn('flex-1 rounded-md border py-1.5 text-xs', vis === 'private' ? 'border-primary bg-primary/15 font-medium text-primary' : 'border-input hover:bg-accent')}>
                  自分だけ
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                「自分だけ」でもチームタブの件数には入ります（内容は出ません）。
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskCreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateTask();
  const { currentUser } = useAuth();
  const { data: users } = useAssignees();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState(currentUser?.id ?? '');
  const [due, setDue] = useState('');
  const [imp, setImp] = useState(2);
  const [urg, setUrg] = useState(2);
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // 自分以外を担当にすると「依頼」になる → 期限が必須 (要件 D9)
  const isDelegation = !!assignee && assignee !== currentUser?.id;
  const score = imp * (due ? urg : 1);

  const submit = () => {
    setErr(null);
    if (!title.trim()) { setErr('やることを入力してください'); return; }
    if (!assignee) { setErr('担当者を選んでください'); return; }
    if (isDelegation && !due) {
      setErr('人に頼むときは期限が必須です。何月何日何時何分までかを入れてください');
      return;
    }
    create.mutate(
      { title: title.trim(), assigned_to: assignee, due_at: fromLocalInput(due), importance: imp, urgency: urg, description: desc || null },
      { onSuccess: onClose, onError: (e) => setErr((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '登録に失敗しました') }
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>タスク・依頼を追加</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {err && <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{err}</p>}
          <div>
            <Label className="text-xs">やること</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" placeholder="例: 見積書の作成" />
          </div>
          <div>
            <Label className="text-xs">担当者</Label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">選んでください</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}{u.id === currentUser?.id ? '（自分）' : ''}</option>
              ))}
            </select>
            {isDelegation && (
              <p className="mt-1 text-[11px] text-violet-700">
                人に頼む依頼になります。期限は必須です。相手は受ける / 相談 / 辞退を選べます。
              </p>
            )}
          </div>
          <DueField value={due} onChange={setDue} required={isDelegation} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LevelPicker label="重要度" value={imp} onChange={setImp} />
            <LevelPicker label="緊急度" value={urg} onChange={setUrg} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
            <span className={cn('rounded border px-1.5 py-0.5 font-number text-xs font-bold', scoreTone(score))}>{score}</span>
            <span className="text-xs text-muted-foreground">{CELL_ACTION[`${imp}x${due ? urg : 1}`]}</span>
          </div>
          <div>
            <Label className="text-xs">補足（任意）</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}登録する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
