/**
 * AiActivityPage — AI 活動履歴の全画面ページ (v2.9.198+)
 * mcp_audit_log を時系列で一覧し、操作種別・期間で絞り込み + ページング。
 * ホームの「AI 活動フィード」の「すべて見る」から遷移。
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import {
  type AiFeedItem,
  type AiFeedPagination,
  AI_TOOL_LABELS,
  aiFeedSubject,
  aiFeedProjectLink,
  aiFeedActor,
  aiFeedActorDetail,
  relativeTime,
} from "@/lib/aiFeed";

const DAY_OPTIONS = [7, 14, 30, 90] as const;
const PAGE_SIZE = 30;

/** created_at → 絶対時刻 (M/d HH:mm) — 一覧では相対 + 絶対の両方を出す */
function absoluteTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AiActivityPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState<number>(30);
  const [tool, setTool] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: AiFeedItem[]; pagination: AiFeedPagination | null }>({
    queryKey: [...queryKeys.dashboard.aiActivityFeed(), { days, tool, page }],
    queryFn: async () => {
      const res = await api.get("/dashboard/ai-activity-feed", {
        params: { days, limit: PAGE_SIZE, page, ...(tool ? { tool } : {}) },
      });
      return { items: res.data.data ?? [], pagination: res.data.pagination ?? null };
    },
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const items = data?.items ?? [];
  const pg = data?.pagination;
  const totalPages = pg?.totalPages ?? 1;

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-4 p-3 lg:p-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-200 bg-violet-50">
            <Sparkles className="h-5 w-5 text-violet-600" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">AI がやったこと</h1>
            <p className="text-xs text-muted-foreground">
              AI が作ったり直したりしたものの記録です。誰の指示だったかも残ります。
            </p>
          </div>
        </div>

        {/* フィルタ */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 期間チップ */}
          <div className="flex gap-1" role="group" aria-label="期間">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  days === d
                    ? "border-violet-300 bg-violet-100 text-violet-800"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
                onClick={() => { setDays(d); setPage(1); }}
              >
                {d}日
              </button>
            ))}
          </div>

          {/* 操作種別 */}
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={tool}
            onChange={(e) => { setTool(e.target.value); setPage(1); }}
            aria-label="操作種別で絞り込み"
          >
            <option value="">すべての操作</option>
            {Object.entries(AI_TOOL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <span className="ml-auto text-xs text-muted-foreground">
            {pg ? `全 ${pg.total} 件` : ""}
          </span>
        </div>

        {/* 一覧 */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="この条件に合う記録はありません"
            description="期間や操作の種類を変えてみてください。"
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {items.map((f) => {
              const label = AI_TOOL_LABELS[f.tool_name] ?? f.tool_name;
              const subject = aiFeedSubject(f.result_summary);
              const projectLink = aiFeedProjectLink(f);
              const actor = aiFeedActor(f);
              return (
                <li key={f.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-foreground">
                      <span className="font-medium">{label}</span>
                      {subject ? (
                        projectLink ? (
                          <button
                            type="button"
                            className="ml-2 text-primary hover:underline truncate align-bottom max-w-[70%] inline-block"
                            onClick={() => navigate(projectLink)}
                          >
                            {subject}
                          </button>
                        ) : (
                          <span className="ml-2 text-muted-foreground">{subject}</span>
                        )
                      ) : null}
                    </p>
                    {/* 内部の詳細 (実行者・ツール名) は title に退避し、主線には出さない */}
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground" title={aiFeedActorDetail(f)}>
                      <span>{absoluteTime(f.created_at)}（{relativeTime(f.created_at)}）</span>
                      {actor ? <span>{actor}</span> : null}
                      {f.requested_by ? <span className="text-violet-600">指示: {f.requested_by}</span> : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* ページング */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              前へ
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              次へ
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
