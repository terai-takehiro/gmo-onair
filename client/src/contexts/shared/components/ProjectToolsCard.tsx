/**
 * 案件から現場の道具を開く (§4.14 / デザイン 12a パターン1)
 *
 * 案件の画面から開いたときは、**開いた時点でこの案件の記録として残す**。
 * 単発で開いて後から案件を探すより、開くときに分かっている情報を捨てないほうが確実。
 *
 * 外部ツール (翻訳・インタラクティブ) は別のシステムなので、案件やイベントを
 * 向こうの画面に流し込むことはできない。**できるのは「この案件で使った」を残すことまで**で、
 * それを画面にそのまま書く (できないことをできるように見せない)。
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Wrench, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@gmo-onair/shared/src/client/dashboard";
import { useAuth } from "@/contexts/platform/AuthContext";
import { TOOLS, toolMeta, elapsedLabel, type ToolOutput } from "@/contexts/shared/pages/ToolsPage";
import { cn } from "@/lib/utils";

export default function ProjectToolsCard({
  projectId, projectName,
}: {
  projectId: string;
  projectName?: string;
}) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");
  const [pending, setPending] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const { data: outputs } = useQuery<ToolOutput[]>({
    queryKey: ["tool-outputs", "project", projectId],
    queryFn: async () => (await api.get(`/tool-outputs?project_id=${projectId}`)).data.data,
    enabled: !!projectId,
  });

  const record = useMutation({
    mutationFn: async ({ tool, t }: { tool: string; t: string }) =>
      (await api.post("/tool-outputs", { tool, title: t, project_id: projectId })).data,
    onSuccess: () => {
      setPending(null); setTitle("");
      qc.invalidateQueries({ queryKey: ["tool-outputs"] });
    },
  });

  const open = (tool: (typeof TOOLS)[number]) => {
    // 記録は「残す」を押したときだけ作る (開くたびに増やすと一覧が使えなくなる)
    if (tool.href.startsWith("http")) window.open(tool.href, "_blank", "noopener,noreferrer");
    else window.location.href = tool.href;
  };

  return (
    <SectionCard
      icon={<Wrench />}
      title="現場の道具"
      description="開いても中身はツール側にあります。ここに残るのは「この案件で何を作ったか」です"
    >
      <div className="flex flex-wrap gap-1.5">
        {TOOLS.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => open(t)}
              className="inline-flex h-8 items-center gap-1 rounded-control border border-border bg-card px-2.5 text-[12px] font-bold text-foreground hover:bg-accent"
            >
              <t.Icon className={cn("h-3.5 w-3.5", t.tone)} aria-hidden />
              {t.label}
              <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => { setPending(t.id); setTitle(""); }}
                className="h-8 rounded-control px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                title={`${t.label} で作ったものをこの案件に残す`}
              >
                残す
              </button>
            )}
          </span>
        ))}
      </div>

      {pending && (
        <div className="mt-2 space-y-2 rounded-control border border-primary/40 bg-primary/5 p-2.5">
          <p className="text-[12px] font-bold text-foreground">
            {toolMeta(pending).label} で作ったものを{projectName ? `「${projectName}」` : "この案件"}に残す
          </p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="何を作ったか（例: 当日の英語字幕）" />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!title.trim() || record.isPending}
              onClick={() => record.mutate({ tool: pending, t: title })}
            >
              {record.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              残す
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>やめる</Button>
          </div>
        </div>
      )}

      {(outputs ?? []).length > 0 && (
        <ul className="mt-2 divide-y divide-divider">
          {(outputs ?? []).map((o) => {
            const meta = toolMeta(o.tool);
            return (
              <li key={o.id} className="flex items-center gap-2 py-1.5">
                <meta.Icon className={cn("h-3.5 w-3.5 shrink-0", meta.tone)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{o.title}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{elapsedLabel(o.created_at)}</span>
                {o.external_url && (
                  <a
                    href={o.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[11px] text-primary hover:underline"
                  >
                    開く
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
