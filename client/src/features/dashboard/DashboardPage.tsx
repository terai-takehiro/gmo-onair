import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  FolderKanban,
  Receipt,
  ShoppingCart,
  Calendar,
  Building2,
  DollarSign,
  BarChart3,
  Briefcase,
  Target,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface KPI {
  monthly_revenue: number;
  monthly_gross_margin: number;
  active_projects: number;
  active_opportunities: number;
}

interface Alert {
  id: string;
  gls_number?: string;
  name: string;
  alert_type: string;
  message: string;
}

interface Project {
  id: string;
  gls_number: string;
  name: string;
  customer_name?: string;
  status: string;
}

const alertTypeColor: Record<string, string> = {
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
};

const statusLabel: Record<string, string> = {
  tentative: "仮",
  confirmed: "確定",
  completed: "完了",
  cancelled: "中止",
};

const statusColor: Record<string, string> = {
  tentative: "#f59e0b",
  confirmed: "#005bac",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data: kpi, isLoading: kpiLoading } = useQuery<KPI>({
    queryKey: ["dashboard-kpi"],
    queryFn: async () => (await api.get("/dashboard/kpi")).data.data,
  });

  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ["dashboard-alerts"],
    queryFn: async () => (await api.get("/dashboard/alerts")).data.data,
  });

  const { data: recentProjects } = useQuery<Project[]>({
    queryKey: ["dashboard-recent-projects"],
    queryFn: async () => (await api.get("/dashboard/recent-projects")).data.data,
  });

  // Auto-check completed projects on dashboard load
  useQuery({
    queryKey: ['check-completed'],
    queryFn: async () => (await api.get('/dashboard/check-completed')).data,
    staleTime: 60000, // only check once per minute
  });

  const kpiCards = [
    { label: "今月売上", value: kpi ? formatCurrency(kpi.monthly_revenue) : "-", icon: DollarSign, color: "text-green-600" },
    { label: "今月粗利率", value: kpi ? formatPercent(kpi.monthly_gross_margin) : "-", icon: BarChart3, color: "text-blue-600" },
    { label: "進行中案件数", value: kpi?.active_projects ?? "-", icon: Briefcase, color: "text-purple-600" },
    { label: "アクティブヨミ数", value: kpi?.active_opportunities ?? "-", icon: Target, color: "text-orange-600" },
  ];

  const quickLinks = [
    { label: "ヨミ管理", to: "/opportunities", icon: TrendingUp },
    { label: "案件管理", to: "/projects", icon: FolderKanban },
    { label: "売上一覧", to: "/revenues", icon: Receipt },
    { label: "仕入一覧", to: "/purchases", icon: ShoppingCart },
    { label: "カレンダー", to: "/calendar", icon: Calendar },
    { label: "マスター管理", to: "/masters/customers", icon: Building2 },
  ];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">ダッシュボード</h1>

      {/* KPI Cards */}
      {kpiLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((k) => (
            <Card key={k.label}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className={`rounded-lg bg-muted p-3 ${k.color}`}>
                  <k.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold">{k.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              アラート
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!alerts || alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">アラートはありません</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 rounded-md border p-3">
                    <Badge color={alertTypeColor[a.alert_type] || "#6b7280"}>
                      {a.alert_type}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">最近の案件</CardTitle>
          </CardHeader>
          <CardContent>
            {!recentProjects || recentProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">案件がありません</p>
            ) : (
              <div className="space-y-3">
                {recentProjects.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/projects/${p.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium">{p.gls_number} {p.name}</p>
                      {p.customer_name && (
                        <p className="text-xs text-muted-foreground">{p.customer_name}</p>
                      )}
                    </div>
                    <Badge color={statusColor[p.status]}>
                      {statusLabel[p.status] || p.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">クイックリンク</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {quickLinks.map((link) => (
            <Card
              key={link.to}
              className="cursor-pointer transition-all hover:shadow-md hover:ring-1 hover:ring-primary/30"
              onClick={() => navigate(link.to)}
            >
              <CardContent className="flex flex-col items-center gap-2 p-6">
                <link.icon className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium">{link.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
