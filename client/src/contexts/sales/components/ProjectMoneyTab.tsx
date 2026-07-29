/**
 * 案件の「お金」タブ (デザイン 13章 7a / 仕様書 §7.12)
 *
 * 見積 → 売上 → 仕入。**数字は税抜**。
 * 4つの数字と4つの操作を1本の口 (`GET /projects/:id/money`) から受け取る
 * — 画面から集めると往復が増え、案件一覧と違う数字が出る余地もできる。
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Money } from "@gmo-onair/shared/src/client/ui/money";
import { ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { List, Printer, ShoppingCart, Calculator, Sparkles, AlertTriangle } from "lucide-react";

interface MoneyRow { key: string; label: string; value: number; note: string }
interface MoneyAction { key: string; label: string; enabled: boolean }
interface MoneyView {
  rows: MoneyRow[];
  actions: MoneyAction[];
  estimate: {
    id: string; amount: number; discount_amount: number;
    item_count: number; confirmed: boolean; sent: boolean;
  } | null;
  provisional_purchase_count: number;
}

const ACTION_ICONS: Record<string, typeof List> = {
  estimate_items: List,
  estimate_pdf: Printer,
  add_purchase: ShoppingCart,
  from_pricing: Calculator,
};

export default function ProjectMoneyTab({ projectId }: { projectId: string }) {
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery<{ data: MoneyView }>({
    queryKey: ["project-money", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/money`)).data,
  });
  const view = data?.data;

  if (isLoading) return <SkeletonCard />;
  if (isError || !view) {
    return <ErrorPanel title="お金の数字を読めませんでした" error={error} onRetry={() => refetch()} />;
  }

  const go = (key: string) => {
    switch (key) {
      case "estimate_items":
      case "from_pricing":
        navigate(`/sales/projects/${projectId}/estimates`);
        break;
      case "estimate_pdf":
        window.open(`/api/v1/internal/projects/${projectId}/estimates/pdf`, "_blank");
        break;
      case "add_purchase":
        // 受け側 (routeAdapters の FinanceRoute) が見るのは `tab`。`view` では損益の画面に着く
        navigate(`/finance?tab=purchase&project_id=${projectId}`);
        break;
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        見積 → 売上 → 仕入。<strong>数字は税抜です。</strong>
      </p>

      {/* 4つの数字 */}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {view.rows.map((r) => (
          <div key={r.key}
            className={`rounded-xl border p-3 ${
              r.key === "gross" ? "border-success/40 bg-success/5" : "border-divider bg-card"
            }`}>
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className={`mt-1 text-base font-bold ${r.key === "gross" ? "text-success" : ""}`}>
              <Money value={r.value} />
            </dd>
            <dd className="mt-0.5 text-xs text-muted-foreground">{r.note}</dd>
          </div>
        ))}
      </dl>

      {/* 仮の仕入が混ざっているときは断る (粗利を信じてしまわないように) */}
      {view.provisional_purchase_count > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          仕入のうち {view.provisional_purchase_count}件は<strong>まだ仮（見込み）</strong>です。
          確定すると粗利が動きます。
        </p>
      )}

      {/* 見積の下書きがあるとき */}
      {view.estimate && !view.estimate.confirmed && view.estimate.item_count > 0 && (
        <div className="rounded-xl border border-ai/40 bg-ai/5 p-3">
          <p className="flex items-center gap-1 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-ai" aria-hidden="true" />
            見積の下書きがあります（<Money value={view.estimate.amount} className="inline-flex" />・
            {view.estimate.item_count}行）
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            「確定する」を押すと想定金額に入ります。
          </p>
          <Button size="sm" className="mt-2 min-h-tap"
            onClick={() => navigate(`/sales/projects/${projectId}/estimates`)}>
            中身を見て確定する
          </Button>
        </div>
      )}

      {/* 4つの操作 */}
      <div className="flex flex-wrap gap-2">
        {view.actions.map((a) => {
          const Icon = ACTION_ICONS[a.key] ?? List;
          return (
            <Button key={a.key} variant="outline" size="sm"
            className="min-h-tap gap-1"
              disabled={!a.enabled}
              title={a.enabled ? undefined : "見積をつくると使えます"}
              onClick={() => go(a.key)}>
              <Icon className="h-4 w-4" aria-hidden="true" />
              {a.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
