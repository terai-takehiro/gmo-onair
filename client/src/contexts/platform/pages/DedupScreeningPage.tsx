import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/platform/AuthContext";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, CopyCheck, Trash2 } from "lucide-react";

interface DedupCandidate {
  table: "revenues" | "purchases" | "sga";
  id: string;
  amount: number;
  key: string;
  month: string;
  label: string;
  keptLabel: string;
}
interface DedupScreenReport {
  dryRun: boolean;
  targetDb: string;
  isProd: boolean;
  scopes: string[];
  monthFrom?: string;
  monthTo?: string;
  summary: {
    revenues: { count: number; amount: number };
    purchases: { count: number; amount: number };
    sga: { count: number; amount: number };
    total: { count: number; amount: number };
  };
  candidates: DedupCandidate[];
  truncated: boolean;
  deleted?: { revenues: number; purchases: number; sga: number; total: number };
}

const yen = (n: number) => "¥" + Number(n || 0).toLocaleString();
type Scope = "sga" | "revenues" | "purchases" | "all";
const TABLE_LABEL: Record<string, string> = { revenues: "売上", purchases: "仕入", sga: "販管費" };

export default function DedupScreeningPage({ embedded }: { embedded?: boolean } = {}) {
  const { currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === "system_admin";

  const [scope, setScope] = useState<Scope>("all");
  const [monthFrom, setMonthFrom] = useState("");
  const [monthTo, setMonthTo] = useState("");
  const [report, setReport] = useState<DedupScreenReport | null>(null);

  const run = useMutation<DedupScreenReport, Error, boolean>({
    mutationFn: async (commit) => {
      const res = await api.post(
        "/admin/kessan/screen-duplicates",
        { scope, commit, monthFrom: monthFrom || undefined, monthTo: monthTo || undefined },
        { timeout: 180000 }
      );
      return res.data.data as DedupScreenReport;
    },
    onSuccess: (d) => setReport(d),
  });

  if (!isSystemAdmin) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-2xl p-6">
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />
            <h1 className="text-lg font-bold">二重計上スクリーニング</h1>
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
      <div className={embedded ? "space-y-5" : "mx-auto max-w-4xl space-y-5 p-4 sm:p-6"}>
        <div className={embedded ? "hidden" : "flex items-center gap-2"}>
          <CopyCheck className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold lg:text-2xl">二重計上スクリーニング</h1>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            手入力した行と、決算インポートした行（<code>[kessan:...]</code>）が
            <b>同一（金額＋GLS/取引先＋計上年月）で二重計上</b>されているものを検出し、
            <b>決算インポート側だけ</b>を削除候補にします（手入力は必ず残します）。
            同じGLS・同じ月に同額の明細が複数ある場合でも、手入力の件数と同じ数だけ間引くため、正当な複数明細は消えません。
            まず「検出（プレビュー）」で確認し、問題なければ「削除を実行」してください。削除は論理削除（ソフトデリート）で、DBバックアップから復元可能です。
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
                <option value="all">すべて（売上・仕入・販管費）</option>
                <option value="revenues">売上のみ</option>
                <option value="purchases">仕入のみ</option>
                <option value="sga">販管費のみ</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">対象期間（開始・任意）</label>
              <input type="month" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">対象期間（終了・任意）</label>
              <input type="month" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">期間を空にすると全期間（過去データを含む）が対象です。</p>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={run.isPending} onClick={() => run.mutate(false)}>
              {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              検出（プレビュー）
            </Button>
            <Button
              variant="destructive"
              disabled={run.isPending || !report || (report.summary?.total?.count ?? 0) === 0}
              onClick={() => {
                const n = report?.summary?.total?.count ?? 0;
                if (window.confirm(`決算インポート行 ${n} 件を削除します（手入力行は残ります）。よろしいですか？\n※論理削除のため必要ならバックアップから復元できます。`)) {
                  run.mutate(true);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              削除を実行
            </Button>
          </div>
        </div>

        {errMsg && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{errMsg}</div>
        )}

        {report && (
          <div className="space-y-4">
            {/* サマリー */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${report.deleted ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700"}`}>
                  {report.deleted ? "削除実行済み" : "プレビュー（未削除）"}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${report.isProd ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {report.isProd ? "本番DB" : "検証DB"}（{report.targetDb}）
                </span>
                {(report.monthFrom || report.monthTo) && (
                  <span className="text-xs text-muted-foreground">対象期間: {report.monthFrom || "最古"} 〜 {report.monthTo || "最新"}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["revenues", "purchases", "sga"] as const).map((t) => (
                  <div key={t} className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">{TABLE_LABEL[t]}</div>
                    <div className="text-lg font-bold">{report.summary[t].count} 件</div>
                    <div className="text-xs text-muted-foreground">{yen(report.summary[t].amount)}</div>
                  </div>
                ))}
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div className="text-xs text-muted-foreground">{report.deleted ? "削除合計" : "削除候補 合計"}</div>
                  <div className="text-lg font-bold text-primary">{(report.deleted?.total ?? report.summary.total.count)} 件</div>
                  <div className="text-xs text-muted-foreground">{yen(report.summary.total.amount)}</div>
                </div>
              </div>
              {report.deleted && (
                <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  決算インポート行を {report.deleted.total} 件削除しました（売上 {report.deleted.revenues} / 仕入 {report.deleted.purchases} / 販管費 {report.deleted.sga}）。手入力行は保持されています。
                </p>
              )}
            </div>

            {/* 候補明細 */}
            {report.candidates.length > 0 ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-bold">
                  {report.deleted ? "削除した" : "削除候補の"}決算インポート行（先頭 {report.candidates.length} 件{report.truncated ? " / さらに多数あり" : ""}）
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2">区分</th>
                        <th className="p-2">削除する行（決算インポート）</th>
                        <th className="p-2">残す行（手入力）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.candidates.map((c) => (
                        <tr key={`${c.table}-${c.id}`} className="border-b last:border-0 align-top">
                          <td className="p-2 whitespace-nowrap">{TABLE_LABEL[c.table]}</td>
                          <td className="p-2 text-red-700 line-through">{c.label}</td>
                          <td className="p-2 text-emerald-700">{c.keptLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                二重計上と思われる決算インポート行は見つかりませんでした。
              </div>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
