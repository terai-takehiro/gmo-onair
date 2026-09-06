/**
 * 回（エピソード）に標準工程を当てるダイアログ（regular-series.md §10-8）。
 *
 * `TemplatePickerDialog.tsx`（案件のかんばんに列を足すだけ）と見た目・部品は
 * 揃えたが、中身は別物 — こちらは選んだ型の列ごとに1件、**この回**のタスクを
 * 作る（`useApplyTaskTemplateToEpisode`）。列は案件の既存かんばん列と名前で
 * 共有するので、他の回に同じ型を当てても列は増えない。
 *
 * 型は `/task-templates` の一覧をそのまま出す（案件向けの3つ＋レギュラー回向けの
 * 1つ）。**この回にしか使わない型に絞らない** — 案件向けの型を回に当てたい
 * 運用（小さい構成の回など）もあり得るため、既存のテンプレート機構をそのまま
 * 使い回す。
 */
import { useState } from "react";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { notifySuccess, notifyApiError } from "@gmo-onair/shared/src/client/notify";
import { useTaskTemplates, useApplyTaskTemplateToEpisode } from "../hooks/useProjectTasks";

export function ApplyEpisodeTaskTemplateDialog({
  open, onOpenChange, projectId, episodeId, episodeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  episodeId: string;
  /** 確認文に出す回の呼び名（例: "#3 春の特番"） */
  episodeLabel: string;
}) {
  const { data: templates = [], isLoading } = useTaskTemplates();
  const apply = useApplyTaskTemplateToEpisode(projectId, episodeId);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handlePick = async (templateId: string) => {
    setPendingId(templateId);
    try {
      const created = await apply.mutateAsync(templateId);
      notifySuccess(`${episodeLabel} に工程を${created.length}件当てました`);
      onOpenChange(false);
    } catch (e) {
      notifyApiError("当てられませんでした", e);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="この回に工程テンプレートを当てる"
      sub={`${episodeLabel} に、選んだ型の工程（列）ごとに1件ずつタスクを作ります。一度当てた回には重ねて当てられません。`}
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="min-h-tap w-full rounded-card border border-border p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
              onClick={() => handlePick(tpl.id)}
              disabled={apply.isPending}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold">{tpl.name}</span>
                <div className="flex items-center gap-1.5">
                  {tpl.is_system && <Badge variant="secondary" className="text-xs">システム</Badge>}
                  {apply.isPending && pendingId === tpl.id && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
              </div>
              {tpl.description && (
                <p className="mb-2 text-xs text-muted-foreground">{tpl.description}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {/* 列の色は点で示す（`KanbanColumn.tsx` と同じ形）。チップの地色にすると
                    シード色 #facc15 / #4ade80 で白文字が読めない（約1.6:1） */}
                {tpl.columns.map((col) => (
                  <span
                    key={col.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-bold"
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color ?? "#94a3b8" }}
                      aria-hidden="true"
                    />
                    {col.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
