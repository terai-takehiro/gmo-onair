/**
 * 先行タスク（このタスクの前に終わっているべきタスク）— タスクダイアログの1区画
 *
 * 案件タスクの `PredecessorEditor` と同じ考え方だが、候補の一覧を
 * **GPM の口（`useGpmProjectTasks`）**から引くので別部品にしてある
 * （あちらは案件タスクのフックを内蔵していて差し替えられない）。
 *
 * データは同じ `task_dependencies`（`/projects/:id/tasks/dependencies`）。
 * GPM のタスクは `project_tasks` の行なのでサーバー側の追加は無い。
 * **その場で保存する**（ダイアログの「直す」を待たない）— 依存関係は
 * タスク本体とは別テーブル・別リクエストのため。循環はサーバーが拒否する。
 */
import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAddDependency, useRemoveDependency, useTaskDependencies } from '@/contexts/tasks/hooks/useProjectTasks';
import { useGpmProjectTasks } from '../../queries';

export function PredecessorField({ projectId, taskId }: { projectId: string; taskId: string }) {
  const tasks = useGpmProjectTasks(projectId).data ?? [];
  const deps = useTaskDependencies(projectId).data ?? [];
  const addDep = useAddDependency(projectId);
  const removeDep = useRemoveDependency(projectId);
  const [adding, setAdding] = useState(false);

  // この（後続）タスクの先行タスク id → 依存の行 id
  const predOf = new Map<string, string>();
  for (const d of deps) if (d.successor_id === taskId) predOf.set(d.predecessor_id, d.id);
  const candidates = tasks.filter((t) => t.id !== taskId && !predOf.has(t.id));

  return (
    <div className="rounded-note border border-border bg-surface-subtle p-3">
      <Label>先行タスク（これが終わってから着手する）</Label>
      {predOf.size === 0 && !adding && (
        <p className="text-sub-sm mt-1 text-muted-foreground">
          先行タスクなし。決めておくと、先行の日程がうしろへ動いたときに「後続もずらすか」をガントが訊きます。
        </p>
      )}
      {predOf.size > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[...predOf.entries()].map(([pid, depId]) => {
            const t = tasks.find((x) => x.id === pid);
            return (
              <span key={depId} className="text-sub inline-flex items-center gap-1 rounded-chip border border-border bg-card px-2.5 py-1">
                <span className="max-w-[200px] truncate">{t?.title ?? '（削除済み）'}</span>
                <button
                  type="button"
                  onClick={() => removeDep.mutate(depId)}
                  aria-label={`先行タスク「${t?.title ?? ''}」を外す`}
                  className="v4-tap text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="mt-2">
        {adding ? (
          <Select
            value=""
            onValueChange={(v) => {
              if (v) {
                addDep.mutate({ predecessor_id: v, successor_id: taskId });
                setAdding(false);
              }
            }}
          >
            <SelectTrigger aria-label="先行タスクを選ぶ"><SelectValue placeholder="先行タスクを選ぶ…" /></SelectTrigger>
            <SelectContent>
              {candidates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.phase_label ? `${t.phase_label} ／ ${t.title}` : t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={candidates.length === 0}
            className="text-sub min-h-tap inline-flex items-center text-primary hover:underline disabled:text-muted-foreground disabled:no-underline lg:min-h-[32px]"
          >
            ＋ 先行タスクを足す
          </button>
        )}
      </div>
    </div>
  );
}
