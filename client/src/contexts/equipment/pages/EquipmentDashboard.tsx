import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { PageTransition, StaggerList, StaggerItem, LiftCard } from "@/components/ui/motion";
import { CardContent } from "@/components/ui/card";
import { Loader2, Package, Activity, Wrench, ArrowRightLeft, AlertTriangle, Wallet, ClipboardList } from "lucide-react";

interface EquipmentStats {
  total_items: number;
  active_items: number;
  in_repair: number;
  lent_out: number;
  overdue: number;
  total_asset_value: number;
  open_maintenance: number;
}

interface StatCard {
  key: keyof EquipmentStats;
  label: string;
  icon: React.ElementType;
  link: string;
  color: string;
  warn?: boolean;
  currency?: boolean;
}

const statCards: StatCard[] = [
  { key: "total_items", label: "総機材数", icon: Package, link: "/equipment/items", color: "text-primary" },
  { key: "active_items", label: "稼働中", icon: Activity, link: "/equipment/items?status=active", color: "text-green-600" },
  { key: "in_repair", label: "修理中", icon: Wrench, link: "/equipment/items?status=in_repair", color: "text-yellow-600" },
  { key: "lent_out", label: "貸出中", icon: ArrowRightLeft, link: "/equipment/lending", color: "text-blue-600" },
  { key: "overdue", label: "延滞", icon: AlertTriangle, link: "/equipment/lending?filter=overdue", color: "text-red-600", warn: true },
  { key: "total_asset_value", label: "資産総額", icon: Wallet, link: "/equipment/items", color: "text-emerald-600", currency: true },
  { key: "open_maintenance", label: "未対応メンテ", icon: ClipboardList, link: "/equipment/maintenance?status=open", color: "text-orange-600", warn: true },
];

export default function EquipmentDashboard() {
  const navigate = useNavigate();

  const { data: stats, isLoading } = useQuery<EquipmentStats>({
    queryKey: ["equipment-stats"],
    queryFn: async () => (await api.get("/equipment/stats")).data.data,
    retry: false,
  });

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        <h1 className="text-xl lg:text-2xl font-bold">機材管理 ダッシュボード</h1>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : stats ? (
          <StaggerList className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {statCards.map((card) => {
              const value = stats[card.key];
              const isWarning = card.warn && typeof value === "number" && value > 0;

              return (
                <StaggerItem key={card.key}>
                  <LiftCard
                    className={`cursor-pointer rounded-lg border bg-card text-card-foreground shadow-sm ${
                      isWarning ? "border-destructive/50 bg-destructive/5" : ""
                    }`}
                    onClick={() => navigate(card.link)}
                  >
                    <CardContent className="flex flex-col items-center gap-1 p-4 lg:gap-2 lg:p-6">
                      <card.icon
                        className={`h-6 w-6 lg:h-8 lg:w-8 ${
                          isWarning ? "text-destructive" : card.color
                        }`}
                      />
                      <p className="text-xs lg:text-sm font-medium text-muted-foreground">
                        {card.label}
                      </p>
                      <p
                        className={`text-xl lg:text-3xl font-bold font-number ${
                          isWarning ? "text-destructive" : ""
                        }`}
                      >
                        {card.currency
                          ? formatCurrency(value)
                          : (value as number).toLocaleString()}
                      </p>
                    </CardContent>
                  </LiftCard>
                </StaggerItem>
              );
            })}
          </StaggerList>
        ) : (
          <p className="text-center text-muted-foreground py-8">データを取得できませんでした</p>
        )}
      </div>
    </PageTransition>
  );
}
