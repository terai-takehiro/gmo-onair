// トップページの「あなたへの依頼」「確認待ち」カード。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (C1 / D7)
//
// GMO イズムに従う点:
//   - 目標達成10カ条 9-5「報告は数字で行え。『がんばる』『大丈夫』などの文学的表現は使うな」
//     → 件数と期限だけを出す。「順調です」のような文は出さない。
//   - 同 10-3「指示をしたら完了させるまでがリーダーの仕事」
//     → 自分が出した依頼で相手が反応していないものを依頼者に見せる。
//   - ポップアップは作らない (フローで流れて消えるため)。**ストックとして置く**。

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@gmo-onair/shared/src/client/dashboard";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import { Inbox, Check, X, MessageCircle, Clock, ArrowRight, ListChecks } from "lucide-react";

export interface MyTaskSummary {
  pending_intakes: number;
  unanswered_delegations: number;
  overdue: number;
  due_today: number;
  no_due_date: number;
}

interface MyTaskRow {
  id: string;
  title: string;
  due_at: string | null;
  priority_score: number;
  requester_id: string | null;
  requester_name: string | null;
  delegation_status: string | null;
  is_overdue: boolean;
  project_name: string | null;
  gls_number: string | null;
}

/** 期限を「7/31 17:00」形式で。分まで出す (イズム: 何月何日何時何分まで) */
function fmtDue(v: string | null): string {
  if (!v) return "期限なし";
  const d = new Date(v.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function useMyTaskSummary() {
  return useQuery<MyTaskSummary>({
    queryKey: queryKeys.dashboard.myTaskSummary(),
    queryFn: async () => (await api.get("/dailyops/tasks/summary")).data.data,
    staleTime: 60_000,
    refetchOnMount: "always",
  });
}

export function MyTasksSummarySection({ navigate }: { navigate: (to: string) => void }) {
  const qc = useQueryClient();
  const { data: summary } = useMyTaskSummary();

  // 受けた依頼 (未返答のものが先頭)
  const { data: received } = useQuery<MyTaskRow[]>({
    queryKey: queryKeys.dashboard.myDelegations("received"),
    queryFn: async () =>
      (await api.get("/dailyops/tasks/delegations", { params: { direction: "received" } })).data.data,
    staleTime: 60_000,
    refetchOnMount: "always",
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: string }) =>
      (await api.post(`/dailyops/tasks/${id}/respond`, { decision })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
  });

  const unanswered = (received ?? []).filter((r) => r.delegation_status === "requested");
  const pendingIntakes = summary?.pending_intakes ?? 0;
  const overdue = summary?.overdue ?? 0;
  const dueToday = summary?.due_today ?? 0;

  // 何も無ければ出さない (0 件のカードで場所を取らない)
  if (unanswered.length === 0 && pendingIntakes === 0 && overdue === 0 && dueToday === 0) {
    return null;
  }

  return (
    <SectionCard
      title="あなたのタスクと依頼"
      description="期限は何月何日何時何分まで。数字だけを出しています。"
      icon={<ListChecks />}
      padding="compact"
      className="border-primary/20"
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="h-ctl-1 gap-1 text-xs"
          onClick={() => navigate("/tasks?scope=me")}
        >
          すべて見る
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      }
    >
      {/* 件数だけの並び (イズム: 報告は数字で行え) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "期限超過", value: overdue, tone: overdue > 0 ? "text-red-700" : "text-muted-foreground" },
          { label: "今日が期限", value: dueToday, tone: dueToday > 0 ? "text-amber-700" : "text-muted-foreground" },
          { label: "未返答の依頼", value: unanswered.length, tone: unanswered.length > 0 ? "text-violet-700" : "text-muted-foreground" },
          { label: "確認待ちの投入", value: pendingIntakes, tone: pendingIntakes > 0 ? "text-sky-700" : "text-muted-foreground" },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border bg-card px-2.5 py-2 text-center">
            <p className={cn("font-number text-xl font-bold leading-none", k.tone)}>{k.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* 宙に浮いた投入 — 投げたのに登録されていないと何も起きないので促す */}
      {pendingIntakes > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <Inbox className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-xs text-sky-900">
            書き留めたまま登録していないものが {pendingIntakes} 件あります。登録しないと相手には届きません。
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-ctl-1 shrink-0 border-sky-300 text-xs text-sky-700"
            onClick={() => navigate("/tasks?scope=me")}
          >
            確認する
          </Button>
        </div>
      )}

      {/* 未返答の依頼 — その場で承諾/相談/辞退できる */}
      {unanswered.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">あなたへの依頼</p>
          {unanswered.slice(0, 4).map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  {r.requester_name && <span>{r.requester_name} さんから</span>}
                  <span className={cn("flex items-center gap-0.5", r.is_overdue && "font-medium text-red-700")}>
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {fmtDue(r.due_at)}{r.is_overdue ? "（期限超過）" : ""}
                  </span>
                  {r.gls_number && <span>{r.gls_number}</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  disabled={respondMutation.isPending}
                  onClick={() => respondMutation.mutate({ id: r.id, decision: "accepted" })}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />受ける
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  disabled={respondMutation.isPending}
                  onClick={() => respondMutation.mutate({ id: r.id, decision: "consulting" })}
                  title="依頼者に差し戻して相談します（消えません）"
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />相談
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  disabled={respondMutation.isPending}
                  onClick={() => respondMutation.mutate({ id: r.id, decision: "declined" })}
                  title="依頼者に差し戻します（消えません）"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />辞退
                </Button>
              </div>
            </div>
          ))}
          {unanswered.length > 4 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => navigate("/tasks?scope=me")}
            >
              残り {unanswered.length - 4} 件を見る
            </button>
          )}
        </div>
      )}
    </SectionCard>
  );
}
