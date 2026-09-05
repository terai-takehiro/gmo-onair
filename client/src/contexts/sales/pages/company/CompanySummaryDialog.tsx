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
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Money } from "@gmo-onair/shared/src/client/ui/money";
import { Delayed, SkeletonCard } from "@gmo-onair/shared/src/client/states";
import type { Company } from "./types";

interface CompanySummary {
  company_id: string;
  revenue: { total: number; count: number };
  purchase: { total: number; count: number };
  sga: { total: number; count: number };
}

export function CompanySummaryDialog({ open, onOpenChange, company }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 一覧が保持する `Company` をそのまま渡す（呼び出し元は既にフルオブジェクトを
   * 持っているため、与信限度額・最新与信確認日の表示に追加の API 呼び出しは要らない）。
   */
  company: Company | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["company-summary", company?.id],
    queryFn: async () => (await api.get(`/companies/${company!.id}/summary`)).data,
    enabled: open && !!company?.id,
  });
  const summary: CompanySummary | null = data?.data ?? null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${company?.name ?? ""} の収支サマリー`}
      sub="この取引先を相手方とする売上・仕入・販管費の累計"
    >
      <div>
        {/* 与信限度額・最新与信確認日（migration 272）。どちらも未設定なら出さない
            （一覧・カードには出していないため、ここが唯一の表示場所） */}
        {(company?.credit_limit_amount != null || company?.credit_check_date) && (
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">与信限度額</p>
              {company?.credit_limit_amount != null ? (
                <Money value={company.credit_limit_amount} inline className="mt-1 text-sm font-bold" />
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">未設定</p>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">最新与信確認日</p>
              <p className="mt-1 text-sm font-bold">{company?.credit_check_date || "未確認"}</p>
            </div>
          </div>
        )}
        {isLoading ? (
          <Delayed><SkeletonCard lines={3} /></Delayed>
        ) : summary ? (
          <div className="space-y-3">
            {/* 375px では3列に割ると1枠約74pxしか無く、`Money` は改行しないので
                8桁の金額が隣の枠へはみ出す。狭い幅では縦積みにする */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-primary-border bg-primary-surface p-3 text-center">
                <p className="text-xs text-primary">売上</p>
                <Money value={summary.revenue.total} inline className="mt-1 justify-center text-sm font-bold" />
                <p className="text-badge text-muted-foreground mt-0.5">{summary.revenue.count}件</p>
              </div>
              <div className="rounded-lg border border-warning-border bg-warning-surface p-3 text-center">
                <p className="text-xs text-foreground">仕入</p>
                <Money value={summary.purchase.total} inline className="mt-1 justify-center text-sm font-bold" />
                <p className="text-badge text-muted-foreground mt-0.5">{summary.purchase.count}件</p>
              </div>
              <div className="rounded-lg border bg-surface-subtle p-3 text-center">
                <p className="text-xs text-muted-foreground">販管費</p>
                <Money value={summary.sga.total} inline className="mt-1 justify-center text-sm font-bold" />
                <p className="text-badge text-muted-foreground mt-0.5">{summary.sga.count}件</p>
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
          <p className="text-sm text-muted-foreground py-4 text-center">当てはまるものはありませんでした</p>
        )}
      </div>
    </FormDialog>
  );
}
