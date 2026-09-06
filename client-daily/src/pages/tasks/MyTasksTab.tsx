// ══════════════════════════════════════════════════
// マイタスク
// ══════════════════════════════════════════════════
import { useState } from 'react';
import { AlertTriangle, LayoutGrid, List, Loader2, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { CELL_ACTION, formatDue, useMyTasks, type MyTask } from '@/lib/tasksApi';
import { NineCellBoard } from './NineCellBoard';
import { TaskRow } from './TaskRow';
import { TaskCreateDialog, TaskEditDialog } from './TaskDialogs';

function ViewBtn({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'min-h-tap lg:h-9 lg:min-h-0 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sub transition-colors',
        active ? 'bg-primary/15 font-bold text-primary' : 'text-muted-foreground hover:bg-accent'
      )}
    >
      <Icon className="h-4 w-4" />{children}
    </button>
  );
}

export function MyTasksTab() {
  const { canEdit } = usePermissions();
  const isMobile = useIsMobile();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<MyTask | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useMyTasks({ include_completed: showDone });
  const tasks = data?.tasks ?? [];
  const canOpenProject = data?.canOpenProject ?? false;

  // `editing` に入れた行は開いた時点の写し。裏で一覧が refetch されても古いままなので、
  // ダイアログには一覧から引き直した最新の行を渡す（消えた行だけ写しで残す）
  const editingTask = editing ? (tasks.find((t) => t.id === editing.id) ?? editing) : null;

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
            <p className="text-th text-primary">まずこの {top3.length} 件</p>
            <div className="mt-2 space-y-1.5">
              {top3.map((t, i) => (
                <div key={t.id} className="flex items-start gap-2">
                  <span className="text-badge mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-list truncate">{t.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sub-sm text-muted-foreground">
                      <span className={cn(t.is_overdue && 'font-bold text-red-700')}>
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
          <ViewBtn active={view === 'list'} onClick={() => setView('list')} icon={List}>優先度順</ViewBtn>
          <ViewBtn active={view === 'board'} onClick={() => setView('board')} icon={LayoutGrid}>重要度 × 緊急度</ViewBtn>
        </div>
        <button
          onClick={() => setShowDone((v) => !v)}
          className={cn('min-h-tap lg:h-9 lg:min-h-0 rounded-md px-3 py-1.5 text-sub', showDone ? 'bg-primary/15 font-bold text-primary' : 'text-muted-foreground hover:bg-accent')}
        >
          対応済も表示
        </button>
        <span className="text-sub-sm text-muted-foreground">未対応 {open.length} 件</span>
        {canEdit && (
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" />追加
          </Button>
        )}
      </div>

      {/* 健康診断 (イズム: 緊急に流されて重要が後回しになるのを防ぐ) */}
      {open.length > 0 && planCount === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sub text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            「重要 高 × 緊急 低（予定を取って守る）」が 0 件です。
            目の前の火消しだけになっていないか見てください。
          </span>
        </div>
      )}
      {junkCount >= 5 && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sub text-slate-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span>「やらない候補（重要度 低 × 緊急度 低）」が {junkCount} 件あります。見直してください。</span>
        </div>
      )}

      {tasks.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sub text-muted-foreground">
          まだタスクがありません。案件管理アプリのトップの入力欄から書き留められます。
        </CardContent></Card>
      ) : view === 'list' ? (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} t={t} canEdit={canEdit} canOpenProject={canOpenProject} onEdit={() => setEditing(t)} />
          ))}
        </div>
      ) : (
        <NineCellBoard tasks={open} canEdit={canEdit} canOpenProject={canOpenProject} onEdit={setEditing} isMobile={isMobile} />
      )}

      {editingTask && <TaskEditDialog key={editingTask.id} task={editingTask} onClose={() => setEditing(null)} />}
      {adding && <TaskCreateDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
