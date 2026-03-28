import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface SummaryCardProps {
  title: string;
  value: string;
}

function SummaryCard({ title, value }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-normal text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        <p className="text-lg font-bold font-number">{value}</p>
      </CardContent>
    </Card>
  );
}

interface EpisodeSummaryCardsProps {
  totalActualRevenue: number;
  totalActualCost: number;
  grossProfit: number;
  formatCurrency: (value: number) => string;
}

export default function EpisodeSummaryCards({
  totalActualRevenue,
  totalActualCost,
  grossProfit,
  formatCurrency,
}: EpisodeSummaryCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <SummaryCard title="売上高計" value={formatCurrency(totalActualRevenue)} />
      <SummaryCard title="仕入実績計" value={formatCurrency(totalActualCost)} />
      <SummaryCard title="粗利(実績)" value={formatCurrency(grossProfit)} />
    </div>
  );
}
