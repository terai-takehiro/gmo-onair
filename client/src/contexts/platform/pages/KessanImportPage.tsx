import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/platform/AuthContext";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Database, FlaskConical } from "lucide-react";

interface KessanReport {
  dryRun: boolean;
  period: string;
  scopes: string[];
  summary: {
    sga: { count: number; amount: number };
    revenues: { count: number; amount: number };
    purchases: { count: number; amount: number };
    fixedCogs: { count: number; amount: number; routed: string };
  };
  masters: {
    missingProjects: string[];
    missingCustomers: string[];
    created: { projects: number; customers: number; vendors: number };
  };
  samples: { sga: string[]; revenues: string[]; purchases: string[] };
  committed?: { sga: number; revenues: number; purchases: number; skipped: number };
  warnings: string[];
}

const yen = (n: number) => "¥" + Number(n || 0).toLocaleString();
type Scope = "sga" | "revenues" | "purchases" | "all";

export default function KessanImportPage() {
  const { currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === "system_admin";

  const [scope, setScope] = useState<Scope>("all");
  const [createMasters, setCreateMasters] = useState(true);
  const [excludeFixed, setExcludeFixed] = useState(false);
  const [report, setReport] = useState<KessanReport | null>(null);

  const run = useMutation<KessanReport, Error, boolean>({
    mutationFn: async (commit) => {
      const res = await api.post("/admin/kessan/run", { scope, commit, createMasters, excludeFixed }, { timeout: 120000 });
      return res.data.data as KessanReport;
    },
    onSuccess: (d) => setReport(d),
  });

  if (!isSystemAdmin) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-2xl p-6">
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
            <h1 className="text-lg font-bold">決算インポート</h1>
            <p className="mt-2 text-sm text-muted-foreground">この機能は system_admin ロールのみ利用できます。</p>
          </div>
        </div>
      </PageTransition>
    );
  }

  const errMsg =
    (run.error as { response?: { data?: { error?: { message?: string } } }; message?: string } | null)
      ?.response?.data?.error?.message || (run.error as Error | null)?.message || "";

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold lg:text-2xl">決算インポート（検証DB専用）</h1>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            freee の総勘定元帳（Box）を予算管理・案件管理へ取り込みます。<strong>検証DB専用</strong>（本番DBでは実行不可）。
            まず「解析（dry-run）」で内容を確認し、問題なければ「投入」してください。投入は当月分（マーカー <code>[kessan:YYYY-MM]</code>）を入れ直すため、何度でも安全に再実行できます。
          </div>
        </div>

        {/* 設定 */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">対象</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">すべて（販管費・売上・仕入）</option>
                <option value="sga">販管費のみ</option>
                <option value="revenues">売上のみ</option>
                <option value="purchases">仕入のみ</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createMasters} onChange={(e) => setCreateMasters(e.target.checked)} className="accent-primary" />
              案件/顧客/取引先を自動作成（売上・仕入に必要）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={excludeFixed} onChange={(e) => setExcludeFixed(e.target.checked)} className="accent-primary" />
              固定原価（GLS無し）を除外する
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate(false)}>
              {run.isPending && !run.variables ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Database className="mr-1 h-4 w-4" />}
              解析（dry-run）
            </Button>
            <Button
              disabled={run.isPending}
              onClick={() => {
                if (window.confirm("検証DBに決算データを投入します。よろしいですか？（当月分は入れ直しになります）")) run.mutate(true);
              }}
            >
              {run.isPending && run.variables ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              投入（commit）
            </Button>
          </div>
          {errMsg && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {errMsg}
            </p>
          )}
        </div>

        {/* 結果 */}
        {report && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${report.dryRun ? "bg-sky-100 text-sky-700" : "bg-green-100 text-green-700"}`}>
                {report.dryRun ? "DRY-RUN（未投入）" : "投入完了"}
              </span>
              <span className="text-sm text-muted-foreground">対象期間 {report.period} / {report.scopes.join(", ")}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr><th className="px-3 py-1.5 text-left">区分</th><th className="px-3 py-1.5 text-right">件数</th><th className="px-3 py-1.5 text-right">金額</th></tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border"><td className="px-3 py-1.5">販管費</td><td className="px-3 py-1.5 text-right font-number">{report.summary.sga.count}</td><td className="px-3 py-1.5 text-right font-number">{yen(report.summary.sga.amount)}</td></tr>
                  <tr className="border-t border-border"><td className="px-3 py-1.5">売上</td><td className="px-3 py-1.5 text-right font-number">{report.summary.revenues.count}</td><td className="px-3 py-1.5 text-right font-number">{yen(report.summary.revenues.amount)}</td></tr>
                  <tr className="border-t border-border"><td className="px-3 py-1.5">仕入</td><td className="px-3 py-1.5 text-right font-number">{report.summary.purchases.count}</td><td className="px-3 py-1.5 text-right font-number">{yen(report.summary.purchases.amount)}</td></tr>
                  <tr className="border-t border-border"><td className="px-3 py-1.5">固定原価<span className="ml-1 text-xs text-muted-foreground">→ {report.summary.fixedCogs.routed}</span></td><td className="px-3 py-1.5 text-right font-number">{report.summary.fixedCogs.count}</td><td className="px-3 py-1.5 text-right font-number">{yen(report.summary.fixedCogs.amount)}</td></tr>
                </tbody>
              </table>
            </div>

            {report.committed && (
              <p className="text-sm">
                投入結果：販管費 <strong>{report.committed.sga}</strong> / 売上 <strong>{report.committed.revenues}</strong> / 仕入 <strong>{report.committed.purchases}</strong>
                {report.committed.skipped ? ` / スキップ ${report.committed.skipped}` : ""}
                ｜ 新規作成：案件 {report.masters.created.projects} / 顧客 {report.masters.created.customers} / 取引先 {report.masters.created.vendors}
              </p>
            )}

            {(report.masters.missingProjects.length > 0 || report.masters.missingCustomers.length > 0) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {report.masters.missingProjects.length > 0 && <p>未登録の案件(GLS) {report.masters.missingProjects.length}件: {report.masters.missingProjects.join(", ")}</p>}
                {report.masters.missingCustomers.length > 0 && <p className="mt-1">未登録の顧客 {report.masters.missingCustomers.length}件: {report.masters.missingCustomers.slice(0, 20).join(", ")}</p>}
                {report.dryRun && <p className="mt-1">※「案件/顧客/取引先を自動作成」をONにして投入すると自動作成されます。</p>}
              </div>
            )}

            {report.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {report.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
              </div>
            )}

            {/* サンプル */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">明細サンプルを表示</summary>
              <div className="mt-2 space-y-3">
                {(["sga", "revenues", "purchases"] as const).map((k) =>
                  report.samples[k].length ? (
                    <div key={k}>
                      <p className="font-medium">{k === "sga" ? "販管費" : k === "revenues" ? "売上" : "仕入"}</p>
                      <ul className="mt-1 space-y-0.5 font-number">
                        {report.samples[k].map((s, i) => <li key={i} className="truncate">{s}</li>)}
                      </ul>
                    </div>
                  ) : null
                )}
              </div>
            </details>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
