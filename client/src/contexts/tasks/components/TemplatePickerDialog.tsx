import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useTaskTemplates, useColumnsFromTemplate } from "../hooks/useProjectTasks";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export default function TemplatePickerDialog({ open, onClose, projectId }: Props) {
  const { data: templates = [], isLoading } = useTaskTemplates();
  const fromTemplate = useColumnsFromTemplate(projectId);

  const handlePick = async (templateId: string) => {
    try {
      await fromTemplate.mutateAsync(templateId);
      onClose();
    } catch {
      // エラーは mutation の isError から取得可能
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="テンプレートからカラムを追加"
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            キャンセル
          </Button>
        </div>
      }
    >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="w-full text-left rounded-lg border border-border p-4 hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                onClick={() => handlePick(tpl.id)}
                disabled={fromTemplate.isPending}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{tpl.name}</span>
                  {tpl.is_system && (
                    <Badge variant="secondary" className="text-xs">システム</Badge>
                  )}
                </div>
                {tpl.description && (
                  <p className="text-xs text-muted-foreground mb-2">{tpl.description}</p>
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
