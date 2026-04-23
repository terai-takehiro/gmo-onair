import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const maintenanceTypeLabel: Record<string, string> = {
  breakdown: "故障",
  repair: "修理",
  maintenance: "メンテ",
  inspection: "点検",
};
const maintenanceStatusLabel: Record<string, string> = {
  reported: "報告済",
  in_progress: "対応中",
};
const maintenanceStatusColor: Record<string, string> = {
  reported: "bg-amber-100 text-amber-800",
  in_progress: "bg-red-100 text-red-800",
};

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["equipment-stats"],
    queryFn: async () => (await api.get("/equipment/stats")).data.data,
    retry: 1,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-muted-foreground">データを取得できませんでした</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />再試行
        </Button>
      </div>
    );
  }

  const stats = data || {};
  const recentLendings: any[] = stats.recent_lendings || [];
  const recentMaintenance: any[] = stats.recent_maintenance || [];

  const statCards = [
    {
      title: "総機材数",
      value: stats.total_items ?? 0,
      sub: `稼働中: ${stats.active_items ?? 0}`,
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10",
      href: "/equipment/items",
    },
    {
      title: "貸出中",
      value: stats.lent_out ?? 0,
      sub: (stats.overdue ?? 0) > 0 ? `遅延: ${stats.overdue}件` : "遅延なし",
      icon: ArrowRightLeft,
      color: (stats.overdue ?? 0) > 0 ? "text-amber-600" : "text-blue-600",
      bg: (stats.overdue ?? 0) > 0 ? "bg-amber-50" : "bg-blue-50",
      href: "/equipment/lendings",
    },
    {
      title: "修理・メンテ中",
      value: stats.in_repair ?? 0,
      sub: `未対応: ${stats.open_maintenance ?? 0}件`,
      icon: Wrench,
      color: (stats.open_maintenance ?? 0) > 0 ? "text-red-600" : "text-green-600",
      bg: (stats.open_maintenance ?? 0) > 0 ? "bg-red-50" : "bg-green-50",
      href: "/equipment/maintenance",
    },
    {
      title: "棚卸し",
      value: stats.pending_inventory ?? 0,
      sub: "未完了の棚卸し",
      icon: ClipboardCheck,
      color: "text-purple-600",
      bg: "bg-purple-50",
      href: "/equipment/inventory",
    },
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="heading-page text-xl lg:text-2xl">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground">機材管理の概況</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {statCards.map((c) => (
          <Card
            key={c.title}
            className={c.href ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
            onClick={c.href ? () => navigate(c.href!) : undefined}
          >
            <CardContent className="p-4 lg:p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm font-medium text-muted-foreground truncate">{c.title}</p>
                  <p className="text-xl lg:text-2xl font-bold font-number mt-1">{c.value}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{c.sub}</p>
                </div>
                <div className={`p-2 lg:p-2.5 rounded-lg ${c.bg} shrink-0 ml-2`}>
                  <c.icon className={`h-4 w-4 lg:h-5 lg:w-5 ${c.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-12 gap-2 justify-start px-4"
          onClick={() => navigate("/equipment/lendings")}
        >
          <Plus className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm">貸出登録</span>
        </Button>
        <Button
          variant="outline"
          className="h-12 gap-2 justify-start px-4"
          onClick={() => navigate("/equipment/maintenance")}
        >
          <Plus className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm">メンテ記録</span>
        </Button>
        <Button
          variant="outline"
          className="h-12 gap-2 justify-start px-4"
          onClick={() => navigate("/equipment/items")}
        >
          <Package className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm">機材一覧</span>
        </Button>
        <Button
          variant="outline"
          className="h-12 gap-2 justify-start px-4"
          onClick={() => navigate("/equipment/scan")}
        >
          <ArrowRightLeft className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm">QRスキャン</span>
        </Button>
        <Button
          variant="outline"
          className="h-12 gap-2 justify-start px-4"
          onClick={() => navigate("/equipment/racks")}
        >
          <Server className="h-4 w-4 text-slate-600 shrink-0" />
          <span className="text-sm">ラック実装</span>
        </Button>
      </div>

      {/* Alerts */}
      {((stats.overdue ?? 0) > 0 || (stats.open_maintenance ?? 0) > 0) && (
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              要注意
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {(stats.overdue ?? 0) > 0 && (
              <button
                className="w-full flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3 hover:bg-amber-100 transition-colors"
                onClick={() => navigate("/equipment/lendings")}
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">返却期限超過が {stats.overdue}件 あります</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            )}
            {(stats.open_maintenance ?? 0) > 0 && (
              <button
                className="w-full flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3 hover:bg-red-100 transition-colors"
                onClick={() => navigate("/equipment/maintenance")}
              >
                <Wrench className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">未対応のメンテナンスが {stats.open_maintenance}件 あります</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent lendings */}
      {recentLendings.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                貸出中 ({stats.lent_out ?? 0}件)
              </CardTitle>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => navigate("/equipment/lendings")}
              >
                すべて表示
              </button>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="space-y-2">
              {recentLendings.map((l: any) => {
                const overdue = isOverdue(l.due_date);
                return (
                  <div
                    key={l.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                      overdue ? "bg-amber-50" : "bg-muted/40"
                    }`}
                  >
                    <CalendarDays className={`h-4 w-4 shrink-0 ${overdue ? "text-amber-600" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{l.equipment_name}{l.unit_number ? ` #${l.unit_number}` : ""}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {l.borrower_name}{l.project_name ? ` · ${l.project_name}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-number ${overdue ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
                        返却 {fmtDate(l.due_date)}
                      </p>
                      {overdue && <Badge variant="outline" className="text-xs px-1 py-0 border-amber-400 text-amber-700">遅延</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent maintenance */}
      {recentMaintenance.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4 text-red-600" />
                未対応メンテナンス ({stats.open_maintenance ?? 0}件)
              </CardTitle>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => navigate("/equipment/maintenance")}
              >
                すべて表示
              </button>
            </div>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="space-y-2">
              {recentMaintenance.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40 text-sm">
                  <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.equipment_name}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <Badge className={`text-xs px-1.5 py-0 ${maintenanceStatusColor[m.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {maintenanceStatusLabel[m.status] ?? m.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{maintenanceTypeLabel[m.record_type] ?? m.record_type}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {(stats.total_items ?? 0) === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary/30 mx-auto mb-4" />
            <h3 className="text-base font-semibold mb-2">機材を登録しましょう</h3>
            <p className="text-sm text-muted-foreground mb-4">
              機材を登録すると、ここに統計情報が表示されます。
            </p>
            <Button size="sm" onClick={() => navigate("/equipment/items")}>
              <Plus className="h-4 w-4 mr-1" />機材を追加
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
