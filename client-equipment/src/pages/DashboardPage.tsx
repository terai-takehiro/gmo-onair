import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import {
  DashboardHeader,
  KpiCard,
  SectionCard,
  EmptyState,
} from "@gmo-onair/shared/src/client/dashboard";
import {
  Package,
  ArrowRightLeft,
  Wrench,
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  ChevronRight,
  Clock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Server,
  QrCode,
} from "lucide-react";

function fmtDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isOverdue(dueDateStr: string | null) {
  if (!dueDateStr) return false;
  return new Date(dueDateStr) < new Date();
}

// ステータス定義は shared/src/constants/statuses.ts に一元化済み (v2.4.0)

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["equipment-stats"],
    queryFn: async () => (await api.get("/equipment/stats")).data.data,
    retry: 1,
    staleTime: 60 * 1000,
  });

  const refreshButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => refetch()}
      disabled={isFetching}
      aria-label="データ更新"
    >
      <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
      更新
    </Button>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="データを取得できませんでした"
          description="ネットワーク接続を確認し、再試行してください。"
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />再試行
            </Button>
          }
        />
      </div>
    );
  }

  const stats = data || {};
  const recentLendings: any[] = stats.recent_lendings || [];
  const recentMaintenance: any[] = stats.recent_maintenance || [];

  return (
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
      <DashboardHeader
        title="機材ダッシュボード"
        description="機材台帳・貸出・メンテナンスの状況を一望できます。"
        controls={refreshButton}
      />

      {/* 主要指標 */}
      <section aria-labelledby="equipment-kpi-heading">
        <h2 id="equipment-kpi-heading" className="sr-only">機材の主要指標</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="総機材数"
            icon={<Package />}
            value={stats.total_items ?? 0}
            unit="件"
            footnote={`稼働中 ${stats.active_items ?? 0} 件`}
            onClick={() => navigate("/equipment/items")}
          />
          <KpiCard
            label="貸出中"
            icon={<ArrowRightLeft />}
            value={stats.lent_out ?? 0}
            unit="件"
            emphasis={(stats.overdue ?? 0) > 0 ? "warning" : "info"}
            footnote={(stats.overdue ?? 0) > 0 ? `遅延 ${stats.overdue} 件` : "遅延なし"}
            onClick={() => navigate("/equipment/lendings")}
          />
          <KpiCard
            label="修理・メンテ中"
            icon={<Wrench />}
            value={stats.in_repair ?? 0}
            unit="件"
            emphasis={(stats.open_maintenance ?? 0) > 0 ? "negative" : "success"}
            footnote={`未対応 ${stats.open_maintenance ?? 0} 件`}
            onClick={() => navigate("/equipment/maintenance")}
          />
          <KpiCard
            label="棚卸し"
            icon={<ClipboardCheck />}
            value={stats.pending_inventory ?? 0}
            unit="件"
            emphasis="info"
            footnote="未完了の棚卸し"
            onClick={() => navigate("/equipment/inventory")}
          />
        </div>
      </section>

      {/* クイックアクション */}
      <SectionCard title="クイックアクション" description="よく使う操作を1タップで。" padding="compact">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/lendings")}>
            <Plus className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">貸出登録</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/maintenance")}>
            <Plus className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />
            <span className="text-sm">メンテ記録</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/items")}>
            <Package className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">機材一覧</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/scan")}>
            <QrCode className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
            <span className="text-sm">QRスキャン</span>
          </Button>
          <Button variant="outline" className="h-12 gap-2 justify-start px-4" onClick={() => navigate("/equipment/racks")}>
            <Server className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-sm">ラック実装</span>
          </Button>
        </div>
      </SectionCard>

      {/* アラート (要注意) */}
      {((stats.overdue ?? 0) > 0 || (stats.open_maintenance ?? 0) > 0) && (
        <SectionCard
          title="要注意"
          description="対応が必要な項目です。タップで該当一覧へ。"
          icon={<AlertTriangle />}
          padding="compact"
        >
          <div className="space-y-2">
            {(stats.overdue ?? 0) > 0 && (
              <button
                type="button"
                className="w-full flex items-center gap-2 text-sm text-warning bg-warning/10 rounded-md p-3 hover:bg-warning/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => navigate("/equipment/lendings")}
              >
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">返却期限超過が {stats.overdue} 件あります</span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            )}
            {(stats.open_maintenance ?? 0) > 0 && (
              <button
                type="button"
                className="w-full flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3 hover:bg-destructive/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => navigate("/equipment/maintenance")}
              >
                <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 text-left">未対応のメンテナンスが {stats.open_maintenance} 件あります</span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            )}
          </div>
        </SectionCard>
      )}

      {/* 最近の貸出 */}
      {recentLendings.length > 0 && (
        <SectionCard
          title={`貸出中 (${stats.lent_out ?? 0} 件)`}
          icon={<ArrowRightLeft />}
          actions={
            <button
              type="button"
              className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              onClick={() => navigate("/equipment/lendings")}
            >
              すべて表示
            </button>
          }
          padding="compact"
        >
          <ul className="space-y-2">
            {recentLendings.map((l: any) => {
              const overdue = isOverdue(l.due_date);
              return (
                <li
                  key={l.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm border ${
                    overdue ? "bg-warning/10 border-warning/30" : "bg-muted/40 border-border"
                  }`}
                >
                  <CalendarDays
                    className={`h-4 w-4 shrink-0 ${overdue ? "text-warning" : "text-muted-foreground"}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {l.equipment_name}
                      {l.unit_number ? ` #${l.unit_number}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.borrower_name}
                      {l.project_name ? ` · ${l.project_name}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-number tabular-nums ${
                        overdue ? "text-warning font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      返却 {fmtDate(l.due_date)}
                    </p>
                    {overdue && (
                      <Badge variant="warning" className="text-xs mt-1">
                        遅延
                      </Badge>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {/* 最近のメンテナンス */}
      {recentMaintenance.length > 0 && (
        <SectionCard
          title={`未対応メンテナンス (${stats.open_maintenance ?? 0} 件)`}
          icon={<Wrench />}
          actions={
            <button
              type="button"
              className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              onClick={() => navigate("/equipment/maintenance")}
            >
              すべて表示
            </button>
          }
          padding="compact"
        >
          <ul className="space-y-2">
            {recentMaintenance.map((m: any) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/40 text-sm"
              >
                <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{m.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.equipment_name}</p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <Badge variant={statusOf(MAINTENANCE_STATUS, m.status).variant} className="text-xs">
                    {statusOf(MAINTENANCE_STATUS, m.status).label}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {statusOf(MAINTENANCE_TYPE, m.record_type).label}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 空状態 */}
      {(stats.total_items ?? 0) === 0 && (
        <SectionCard title="機材を登録しましょう">
          <EmptyState
            icon={<CheckCircle2 />}
            title="まだ機材が登録されていません"
            description="機材を登録すると、ここに統計情報と貸出・メンテ一覧が表示されます。"
            action={
              <Button size="sm" onClick={() => navigate("/equipment/items")}>
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                機材を追加
              </Button>
            }
          />
        </SectionCard>
      )}
    </div>
  );
}
