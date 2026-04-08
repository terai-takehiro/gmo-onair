import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  ArrowRightLeft,
  Wrench,
  AlertTriangle,
  Loader2,
  DollarSign,
  CheckCircle2,
} from "lucide-react";

export default function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["equipment-stats"],
    queryFn: async () => (await api.get("/equipment/stats")).data.data,
    retry: false,
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
      <div className="flex justify-center py-24">
        <p className="text-sm text-muted-foreground">データを取得できませんでした。サーバー接続を確認してください。</p>
      </div>
    );
  }

  const stats = data || {};

  const cards = [
    {
      title: "総機材数",
      value: stats.total_items,
      sub: `稼働中: ${stats.active_items}`,
      icon: Package,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "貸出中",
      value: stats.lent_out,
      sub: stats.overdue > 0 ? `返却遅延: ${stats.overdue}件` : "遅延なし",
      icon: ArrowRightLeft,
      color: stats.overdue > 0 ? "text-amber-600" : "text-blue-600",
      bg: stats.overdue > 0 ? "bg-amber-50" : "bg-blue-50",
    },
    {
      title: "修理・メンテ中",
      value: stats.in_repair,
      sub: `未対応: ${stats.open_maintenance}件`,
      icon: Wrench,
      color: stats.open_maintenance > 0 ? "text-red-600" : "text-green-600",
      bg: stats.open_maintenance > 0 ? "bg-red-50" : "bg-green-50",
    },
    {
      title: "固定資産総額",
      value: `¥${(stats.total_asset_value || 0).toLocaleString()}`,
      sub: "取得価額合計",
      icon: DollarSign,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-muted-foreground">機材管理の概況</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{c.title}</p>
                  <p className="text-2xl font-bold font-number mt-1">{c.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${c.bg}`}>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick alerts */}
      {(stats.overdue > 0 || stats.open_maintenance > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              要注意
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.overdue > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
                <ArrowRightLeft className="h-4 w-4 shrink-0" />
                返却期限を超過した貸出が {stats.overdue}件 あります
              </div>
            )}
            {stats.open_maintenance > 0 && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3">
                <Wrench className="h-4 w-4 shrink-0" />
                未対応のメンテナンス記録が {stats.open_maintenance}件 あります
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {stats.total_items === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-primary/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">機材を登録しましょう</h3>
            <p className="text-sm text-muted-foreground">
              「機材一覧」から機材を登録すると、ここに統計情報が表示されます。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
