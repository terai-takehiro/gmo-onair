/**
 * 現場の道具 (§4.14 / デザイン 12a)
 *
 * 翻訳・インタラクティブ・リアルタイムCG は3通りの使われ方をする。
 *   1. 案件から開く … 案件の画面から。開いた記録がその案件に残る
 *   2. 単発で開く   … ここ / ⌘K から。案件は空のままでよい
 *   3. 後から紐づける … 単発で作ったものを「まだ案件に紐づいていないもの」から1タップで
 *
 * **レールとホームには置かない。** 毎日開くものではなく、案件か ⌘K から辿るのが正しい。
 * ここに残すのはメタだけで、成果物の中身は各ツール側にある。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Languages, Sparkles, Tv, ExternalLink, Link2, Building2, Trash2, Plus, Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardHeader, SectionCard } from "@gmo-onair/shared/src/client/dashboard";
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/contexts/platform/AuthContext";
import { cn } from "@/lib/utils";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

export interface ToolOutput {
  id: string;
  tool: "translate" | "interactive" | "cg";
  title: string;
  external_url: string | null;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  is_internal_use: boolean;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
}

export const TOOLS = [
  {
    id: "translate" as const,
    label: "翻訳",
    desc: "資料や字幕の翻訳",
    href: "https://gmo-translate.jp/",
    Icon: Languages,
    tone: "text-green-600",
  },
  {
    id: "interactive" as const,
    label: "インタラクティブ",
    desc: "会場の投票・スタンプ演出",
    href: "https://interactive.gmo-onair.jp/",
    Icon: Sparkles,
    tone: "text-violet-600",
  },
  {
    id: "cg" as const,
    label: "リアルタイムCG",
    desc: "ランキング・字幕スーパーの送出",
    href: "/awards",
    Icon: Tv,
    tone: "text-amber-600",
  },
];

export function toolMeta(id: string) {
  return TOOLS.find((t) => t.id === id) ?? TOOLS[0];
}

export function elapsedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 60) return `${Math.max(1, min)}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間前`;
  const day = Math.floor(h / 24);
  if (day < 31) return `${day}日前`;
  return d.toLocaleDateString("ja-JP");
}

/** 成果物1件。案件に紐づけるか「社内利用」で終わらせる */
export function ToolOutputRow({
  output, projects, canEdit, onLink, onInternal, onDelete, busy,
}: {
  output: ToolOutput;
  projects: { value: string; label: string }[];
  canEdit: boolean;
  onLink: (projectId: string) => void;
  onInternal: () => void;
  onDelete?: () => void;
  busy?: boolean;
}) {
  const meta = toolMeta(output.tool);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState("");

  return (
    <li className="flex flex-wrap items-start gap-2 py-2.5">
      <meta.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", meta.tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[15px] font-bold text-foreground">{output.title}</span>
          <span className="text-[11px] text-muted-foreground">{meta.label}</span>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span>{elapsedLabel(output.created_at)}</span>
          {output.created_by_name && <span>{output.created_by_name}</span>}
          {output.project_name && (
            <span className="inline-flex items-center gap-0.5 font-bold text-primary">
              <Building2 className="h-3 w-3" aria-hidden />
              {output.gls_number ? `${output.gls_number} ` : ""}{output.project_name}
            </span>
          )}
          {output.is_internal_use && <span className="rounded-full bg-muted px-1.5">社内利用</span>}
          {output.note && <span className="truncate">{output.note}</span>}
        </p>

        {picking && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <SearchableSelect
                options={projects}
                value={pick}
                onChange={(v) => setPick(v)}
                placeholder="案件を選ぶ"
              />
            </div>
            <Button size="sm" disabled={!pick || busy} onClick={() => { onLink(pick); setPicking(false); }}>
              紐づける
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicking(false)}>やめる</Button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {output.external_url && (
          <a
            href={output.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-control border border-border px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            開く
          </a>
        )}
        {canEdit && !output.project_id && !picking && (
          <>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={() => setPicking(true)}>
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              案件に紐づける
            </Button>
            {!output.is_internal_use && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-[11px]"
                onClick={onInternal}
                disabled={busy}
                title="以後この成果物に案件を求めません"
              >
                社内利用
              </Button>
            )}
          </>
        )}
        {canEdit && onDelete && (
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onDelete} aria-label="消す">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}

export default function ToolsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("sales", "editor");
  const [newTool, setNewTool] = useState<"translate" | "interactive" | "cg" | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const { data: unlinked, isLoading, isError, refetch } = useQuery<ToolOutput[]>({
    queryKey: ["tool-outputs", "unlinked"],
    queryFn: async () => (await api.get("/tool-outputs?unlinked=1")).data.data,
    refetchOnMount: "always",
  });

  const { data: projectsRaw } = useQuery<{ data: { id: string; name: string; gls_number?: string | null }[] }>({
    queryKey: ["projects", "for-tool-link"],
    queryFn: async () => (await api.get("/projects?limit=200")).data,
  });

  const projectOptions = useMemo(
    () => (projectsRaw?.data ?? []).map((p) => ({
      value: p.id,
      label: p.gls_number ? `${p.gls_number} ${p.name}` : p.name,
    })),
    [projectsRaw]
  );

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      (await api.patch(`/tool-outputs/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tool-outputs"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/tool-outputs/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tool-outputs"] }),
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post("/tool-outputs", { tool: newTool, title: newTitle, external_url: newUrl || null })).data,
    onSuccess: () => {
      setNewTool(null); setNewTitle(""); setNewUrl("");
      qc.invalidateQueries({ queryKey: ["tool-outputs"] });
    },
  });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DashboardHeader
        title="現場の道具"
        description="翻訳・インタラクティブ・リアルタイムCG。案件から開くのが基本で、単発でもここから開けます。"
      />

      <SectionCard
        icon={<Sparkles />}
        title="開く"
        description="案件を決めずに開いて構いません。あとから案件に紐づけられます"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {TOOLS.map((t) => {
            const external = t.href.startsWith("http");
            return (
              <div key={t.id} className="rounded-control border border-border bg-card p-3">
                <span className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  <t.Icon className={cn("h-4 w-4", t.tone)} aria-hidden />
                  {t.label}
                </span>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{t.desc}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a
                    href={t.href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="inline-flex h-8 items-center gap-1 rounded-control border border-border px-2.5 text-[11px] font-bold text-foreground hover:bg-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    開く
                  </a>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-[11px]"
                      onClick={() => { setNewTool(t.id); setNewTitle(""); setNewUrl(""); }}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      作ったものを残す
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {newTool && (
          <div className="mt-3 space-y-2 rounded-control border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs font-bold text-foreground">
              {toolMeta(newTool).label} で作ったものを残す
            </p>
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="何を作ったか（例: 表彰式の英語字幕）" />
            <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="開くためのURL（任意）" />
            <div className="flex gap-2">
              <Button size="sm" disabled={!newTitle.trim() || create.isPending} onClick={() => create.mutate()}>
                {create.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                残す
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewTool(null)}>やめる</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              案件は空のままで大丈夫です。下の「まだ案件に紐づいていないもの」に残るので、あとから付けられます。
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={<Link2 />}
        title="まだ案件に紐づいていないもの"
        description="単発で作ったものです。案件に紐づけるか、社内利用として終わらせてください"
      >
        {isLoading ? (
          <Delayed><SkeletonRows rows={3} /></Delayed>
        ) : isError ? (
          <ErrorPanel title="成果物を読み込めませんでした" error={null} onRetry={() => refetch()} />
        ) : (unlinked ?? []).length === 0 ? (
          <EmptyState
            icon={<Link2 className="h-8 w-8" />}
            title="紐づけ待ちはありません"
            description="単発で作ったものはここに残ります。案件から開いた分は最初から案件に付いています。"
          />
        ) : (
          <ul className="divide-y divide-divider">
            {(unlinked ?? []).map((o) => (
              <ToolOutputRow
                key={o.id}
                output={o}
                projects={projectOptions}
                canEdit={canEdit}
                busy={patch.isPending}
                onLink={(projectId) => patch.mutate({ id: o.id, body: { project_id: projectId } })}
                onInternal={() => patch.mutate({ id: o.id, body: { is_internal_use: true } })}
                onDelete={async () => { if ((await confirmAction({ title: `「${o.title}」を消しますか？`, confirmLabel: '削除する', tone: 'danger' }))) remove.mutate(o.id); }}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        ここに出るのは「いつ・誰が・何を作ったか」だけです。翻訳文や演出データそのものは各ツールの中にあります
        （二重に持つと、どちらが新しいか分からなくなるため）。
      </p>

      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
          案件から開く
        </Button>
      </div>
    </div>
  );
}
