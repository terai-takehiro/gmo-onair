/**
 * 取引先ごとの収支サマリー（売上・仕入・販管費の累計）
 *
 * v4 renewal: 金額は手書きの `¥` 文字列（`formatCurrency`）をやめ、
 * `<Money inline />` に差し替えた（`shared/CLAUDE.md` の決めごと）。
 * ローディングも `Loader2` のスピナーから `Delayed` + `SkeletonCard` に変えた
 * （1秒未満は出さない・点滅させない）。
 */
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { BarChart3 } from "lucide-react";
import { Money } from "@gmo-onair/shared/src/client/ui/money";
import { Delayed, SkeletonCard } from "@gmo-onair/shared/src/client/states";

interface CompanySummary {
  company_id: string;
  revenue: { total: number; count: number };
  purchase: { total: number; count: number };
  sga: { total: number; count: number };
}

export function CompanySummaryDialog({ open, onOpenChange, company }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: { id: string; name: string } | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["company-summary", company?.id],
    queryFn: async () => (await api.get(`/companies/${company!.id}/summary`)).data,
    enabled: open && !!company?.id,
  });
  const summary: CompanySummary | null = data?.data ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            {company?.name} の収支サマリー
          </DialogTitle>
          <DialogDescription>この取引先を相手方とする売上・仕入・販管費の累計</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Delayed><SkeletonCard lines={3} /></Delayed>
        ) : summary ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                <p className="text-xs text-blue-700 dark:text-blue-300">売上</p>
                <Money value={summary.revenue.total} inline className="mt-1 justify-center text-sm font-bold" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{summary.revenue.count}件</p>
              </div>
              <div className="rounded-lg border bg-orange-50 dark:bg-orange-950/30 p-3 text-center">
                <p className="text-xs text-orange-700 dark:text-orange-300">仕入</p>
                <Money value={summary.purchase.total} inline className="mt-1 justify-center text-sm font-bold" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{summary.purchase.count}件</p>
              </div>
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                <p className="text-xs text-amber-700 dark:text-amber-300">販管費</p>
                <Money value={summary.sga.total} inline className="mt-1 justify-center text-sm font-bold" />
                <p className="text-[10px] text-muted-foreground mt-0.5">{summary.sga.count}件</p>
              </div>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">収支バランス（売上 - 仕入 - 販管費）</p>
              <Money
                value={summary.revenue.total - summary.purchase.total - summary.sga.total}
                inline
                negativeIsDanger
                className="mt-1 text-lg font-bold"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">データがありません</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
