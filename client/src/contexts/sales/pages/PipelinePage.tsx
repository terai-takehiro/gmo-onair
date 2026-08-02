// ヨミ・パイプライン (v2.9.220+) — 営業ジャーニー刷新フェーズD
// 進行中の全案件をステージ列 (ネタ→仮押さえ→見積提案→口頭決定→受注) に並べ、
// 商談全体を一望する。各カードに 金額・顧客・次回アクション(期限超過は赤)・
// ホット(直近やり取りあり)。列ヘッダーに件数と想定金額合計。クリックで案件へ。
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageTransition } from "@/components/ui/motion";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { ProjectStageColors, type ProjectStage } from "@/types";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import { TrendingUp, Flame, CalendarClock, Loader2 } from "lucide-react";

interface Deal {
  id: string;
  gls_number?: string | null;
  name: string;
  customer_name?: string | null;
  stage: ProjectStage;
  expected_amount?: number | null;
  next_action?: string | null;
  next_action_date?: string | null;
  is_hot?: number;
}

// パイプラインに表示するステージ列 (ネタ→受注の商談フェーズ)
const PIPE_STAGES: { stage: ProjectStage; label: string }[] = [
  { stage: "neta", label: "ネタ" },
  { stage: "d_hold", label: "仮押さえ" },
  { stage: "c_proposal", label: "見積提案" },
  { stage: "b_verbal", label: "口頭決定" },
  { stage: "a_won", label: "受注" },
];

export default function PipelinePage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<Deal[]>({
    queryKey: queryKeys.dashboard.salesBoard(),
    queryFn: async () => (await api.get("/dashboard/sales-board")).data.data,
    staleTime: 30_000,
    refetchOnMount: "always",
  });

  const columns = useMemo(() => {
    const list = data ?? [];
    return PIPE_STAGES.map((c) => {
      const deals = list.filter((d) => d.stage === c.stage);
      const total = deals.reduce((s, d) => s + (Number(d.expected_amount) || 0), 0);
      return { ...c, deals, total };
    });
  }, [data]);

  const grandTotal = columns.reduce((s, c) => s + c.total, 0);
  const dealCount = columns.reduce((s, c) => s + c.deals.length, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <PageTransition>
      <div className="space-y-4 p-3 lg:p-6">
        {/* ヘッダー */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground">ヨミ・パイプライン</h1>
          </div>
          {!isLoading && (
            <span className="text-sm text-muted-foreground">
              進行中 {dealCount}件 ・ 想定 {formatCurrency(grandTotal)}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : dealCount === 0 ? (
          <EmptyState title="進行中の商談はありません" />
        ) : (
          // 横スクロールのカンバン風。各列は固定幅、モバイルでも横に並べて全体を俯瞰
          <div className="flex gap-3 overflow-x-auto pb-2">
            {columns.map((col) => (
              <div key={col.stage} className="flex w-[260px] shrink-0 flex-col">
                {/* 列ヘッダー */}
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ProjectStageColors[col.stage] }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-foreground">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{col.deals.length}</span>
                  {col.total > 0 && (
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatCurrency(col.total)}</span>
                  )}
                </div>
                {/* カード */}
                <div className="space-y-2">
                  {col.deals.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">なし</p>
                  ) : (
                    col.deals.map((d) => {
                      const overdue = d.next_action_date && !!d.next_action && d.next_action_date < today;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => navigate(`/sales/projects/${d.id}`)}
                          className={cn(
                            "w-full rounded-lg border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            d.is_hot ? "border-orange-200" : "border-border"
                          )}
                        >
                          <div className="flex items-start gap-1.5">
                            {d.is_hot ? <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" aria-label="ホット" /> : null}
                            <span className="min-w-0 flex-1 text-sm font-medium text-foreground line-clamp-2">{d.name}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {d.gls_number ? <span>{d.gls_number}</span> : null}
                            {d.customer_name ? <span className="truncate">{d.customer_name}</span> : null}
                          </div>
                          {Number(d.expected_amount) > 0 && (
                            <div className="mt-1 text-xs font-semibold tabular-nums text-foreground">
                              {formatCurrency(Number(d.expected_amount))}
                            </div>
                          )}
                          {d.next_action ? (
                            <div className={cn(
                              "mt-1 flex items-center gap-1 text-[11px]",
                              overdue ? "font-medium text-red-600" : "text-blue-700"
                            )}>
                              <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">
                                {d.next_action}
                                {d.next_action_date ? `（${d.next_action_date}${overdue ? "・超過" : ""}）` : ""}
                              </span>
                            </div>
                          ) : (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
                              <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                              次アクション未設定
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 補足: 受注済みは案件一覧へ */}
        {!isLoading && dealCount > 0 && (
          <p className="text-xs text-muted-foreground">
            受注後の案件・完了案件は
            <button className="mx-1 text-primary hover:underline" onClick={() => navigate("/sales/projects")}>案件一覧</button>
            から確認できます。
          </p>
        )}
      </div>
    </PageTransition>
  );
}
