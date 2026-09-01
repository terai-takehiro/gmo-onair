/**
 * GPM の請求タブ — KPI カード3枚（売上高計・仕入実績計・粗利）と Qシートへの入口
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません**（段4）。
 * 読むだけの並びで、state を1つも持ちません。
 *
 * ⚠️ **Qシートへは素の遷移（`<a href>`）のまま。** 別バンドル（`/techops/`）なので
 * ルーターでは飛べません（`client/CLAUDE.md`）。`<Link>` に「直さない」こと。
 */
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AnimatedCurrency } from '@/components/ui/animated-number';
import type { Project } from '@/types';

export function SummaryCards({
  project, projectId, summary,
}: {
  project: Project;
  projectId: string;
  summary?: { total_revenue?: number; total_purchase?: number; gross_profit?: number };
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              売上高計
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <AnimatedCurrency value={summary?.total_revenue ?? 0} className="text-lg font-bold font-number" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              仕入実績計
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <AnimatedCurrency value={summary?.total_purchase ?? 0} className="text-lg font-bold font-number" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              粗利(実績)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <AnimatedCurrency value={summary?.gross_profit ?? 0} className="text-lg font-bold font-number" />
          </CardContent>
        </Card>
      </div>

      {/* Qsheet link */}
      {project.gls_number && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-rose-500" />
              <div>
                <span className="text-sm font-medium">Qシート</span>
                <span className="text-xs text-muted-foreground ml-2">放送進行表</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-1" asChild>
              <a href={`/techops?project=${projectId}`}>
                <FileText className="h-3.5 w-3.5" />
                Qシート管理
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
