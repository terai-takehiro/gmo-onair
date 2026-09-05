/**
 * 先行タスク (この後に始めるタスク) の依存関係
 *
 * **`TaskDialog.tsx` から切り出しました。** あのファイルが 432 行あり、
 * 1ファイル400行の上限 (root CLAUDE.md / v4-plan の B-4) を超えていたためです。
 * 中身は1文字も変えていません。
 *
 * ここは**その場で保存します** (ダイアログの「保存」を待たない) —
 * 依存関係は `task_dependencies` の別テーブルで、タスク本体の更新とは
 * 別のリクエストだからです。
 */
/** 先行タスク (この後に始めるタスク) の依存関係を即時に追加/削除 */
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useProjectTasks,
  useTaskDependencies,
  useAddDependency,
  useRemoveDependency,
} from "../hooks/useProjectTasks";

export default function PredecessorEditor({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { data: tasks = [] } = useProjectTasks(projectId);
  const { data: deps = [] } = useTaskDependencies(projectId);
  const addDep = useAddDependency(projectId);
  const removeDep = useRemoveDependency(projectId);

  // この (successor) タスクの先行タスク id → dependency id
  const predOf = new Map<string, string>();
  for (const d of deps) if (d.successor_id === taskId) predOf.set(d.predecessor_id, d.id);

  const candidates = tasks.filter((t: { id: string }) => t.id !== taskId);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">先行タスク（完了後にこのタスクを開始）</Label>
        {predOf.size > 0 && <Badge variant="secondary" className="text-xs">{predOf.size}</Badge>}
      </div>
      {predOf.size === 0 && !adding && (
        <p className="text-xs text-muted-foreground">先行タスクなし</p>
      )}
      {/* 現在の先行タスク */}
      <div className="flex flex-wrap gap-1.5">
        {[...predOf.entries()].map(([pid, depId]) => {
          const t = tasks.find((x) => x.id === pid);
          return (
            <span key={depId} className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs">
              {t?.title ?? "(削除済み)"}
              <button type="button" onClick={() => removeDep.mutate(depId)}
                className="text-muted-foreground hover:text-destructive">×</button>
            </span>
          );
        })}
      </div>
      {/* 追加 */}
      {adding ? (
        <Select
          value=""
          onValueChange={(v) => { if (v) { addDep.mutate({ predecessor_id: v, successor_id: taskId }); setAdding(false); } }}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="先行タスクを選択…" /></SelectTrigger>
          <SelectContent>
            {candidates.filter((t: { id: string }) => !predOf.has(t.id)).map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="text-xs text-primary hover:underline">+ 先行タスクを追加</button>
      )}
    </div>
  );
}
