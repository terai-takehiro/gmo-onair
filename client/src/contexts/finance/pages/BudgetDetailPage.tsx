import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatMonth, formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileCheck2 } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import ProjectQuickLinks from "@/contexts/shared/components/ProjectQuickLinks";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface ProjectOption { id: string; gls_number: string; name: string; }

function useResizable() {
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const startResize = useCallback((col: string, e: React.MouseEvent, defaultW: number) => {
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: colWidths[col] ?? defaultW };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.max(50, resizeRef.current.startW + ev.clientX - resizeRef.current.startX);
      setColWidths((p) => ({ ...p, [resizeRef.current!.col]: newW }));
    };
    const onUp = () => { resizeRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);
  return { colWidths, startResize };
}

function ResizableHead({ colId, label, defaultW, colWidths, startResize, align }: {
  colId: string; label: string; defaultW: number;
  colWidths: Record<string, number>; startResize: (col: string, e: React.MouseEvent, dw: number) => void;
  align?: string;
}) {
  const w = colWidths[colId] ?? undefined;
  return (
    <TableHead style={w ? { width: w } : undefined} className={`select-none whitespace-nowrap relative${align === "right" ? " text-right" : ""}`}>
      {label}
      <span className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-primary/40" onMouseDown={(e) => startResize(colId, e, defaultW)} onClick={(e) => e.stopPropagation()} />
    </TableHead>
  );
}

export default function BudgetDetailPage() {
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const revResize = useResizable();
  const purResize = useResizable();
  const sgaResize = useResizable();

  const { data: glsData } = useQuery({
    queryKey: ["gls-projects-budget"],
    queryFn: async () => (await api.get("/projects/gls-projects")).data,
  });
  const glsProjects: ProjectOption[] = glsData?.data ?? [];

  // 月のみ選択でも一覧表示。案件が選ばれていればその案件で絞り込む
  const canFetch = !!month;

  const { data: revData, isLoading: revLoading } = useQuery({
    queryKey: ["budget-detail-revenues", projectId, month],
    queryFn: async () => {
      const params: Record<string, string | number> = { recognition_month: month, limit: 200 };
      if (projectId) params.project_id = projectId;
      return (await api.get("/revenues", { params })).data;
    },
    enabled: canFetch,
  });
  const revenues: Record<string, unknown>[] = revData?.data ?? [];

  const { data: purData, isLoading: purLoading } = useQuery({
    queryKey: ["budget-detail-purchases", projectId, month],
    queryFn: async () => {
      const params: Record<string, string | number> = { recognition_month: month, limit: 200 };
      if (projectId) params.project_id = projectId;
      return (await api.get("/purchases", { params })).data;
    },
    enabled: canFetch,
  });
  const purchases: Record<string, unknown>[] = purData?.data ?? [];

  // 販管費は案件横断のため、案件絞り込み時も月内の全 SGA を取得（UI 上は案件別ではないことを明示）
  const { data: sgaData, isLoading: sgaLoading } = useQuery({
    queryKey: ["budget-detail-sga", month],
    queryFn: async () =>
      (await api.get("/sga", { params: { recognition_month: month, limit: 200 } })).data,
    enabled: canFetch,
  });
  const sgaExpenses: Record<string, unknown>[] = sgaData?.data ?? [];

  const totalRevenue = revenues.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalPurchase = purchases.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalSga = sgaExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const grossProfit = totalRevenue - totalPurchase;
  // 営業利益: 案件絞込時は販管費が案件別に按分されないため粗利と同値、全体表示時は販管費も差し引く
  const operatingProfit = projectId ? grossProfit : grossProfit - totalSga;

  // 申請番号フォーマット（X-xxxxx / 楽-xxxxx）
  const formatSettlementNo = (method: unknown, number: unknown): string => {
    const num = (number as string | null) || "";
    if (!num || num === "pending") return "";
    if (method === "xpoint") return `X-${num}`;
    if (method === "rakuraku") return `楽-${num}`;
    return num;
  };

  const selectedProject = glsProjects.find((p) => p.id === projectId);

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <PageTitle>案件月別詳細</PageTitle>
        {projectId && selectedProject && (
          <ProjectQuickLinks
            projectId={projectId}
            projectName={selectedProject.name}
            currentPage="revenues"
          />
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-full sm:w-72">
          <Label>案件</Label>
          <SearchableSelect
            options={glsProjects.map((p) => ({ value: p.id, label: `${p.gls_number} ${p.name}` }))}
            value={projectId}
            onChange={setProjectId}
            placeholder="GLS番号で検索..."
          />
        </div>
        <div>
          <Label>年月</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" />
        </div>
      </div>

      {selectedProject ? (
        <div className="text-sm text-muted-foreground">
          {selectedProject.gls_number} — {selectedProject.name}
          {month && <span className="ml-2 font-medium text-foreground">{formatMonth(month + "-01")}</span>}
        </div>
      ) : month ? (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{formatMonth(month + "-01")}</span>
          <span className="ml-2">全案件の売上・仕入・販管費</span>
        </div>
      ) : null}

      {!canFetch ? (
        <p className="text-center text-muted-foreground py-12">年月を選択してください</p>
      ) : (
        <>
          {/* サマリー (テーブルより上に配置) */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">売上</p>
              <p className="font-bold font-number mt-1">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">仕入</p>
              <p className="font-bold font-number mt-1">{formatCurrency(totalPurchase)}</p>
            </div>
            <div className={`rounded-lg border p-3 text-center ${grossProfit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
              <p className="text-xs text-muted-foreground">粗利</p>
              <p className={`font-bold font-number mt-1 ${grossProfit >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(grossProfit)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <p className="text-xs text-muted-foreground">販管費{projectId && <span className="text-[10px] ml-1">(全社)</span>}</p>
              <p className="font-bold font-number mt-1">{formatCurrency(totalSga)}</p>
            </div>
            <div className={`rounded-lg border p-3 text-center col-span-2 sm:col-span-1 ${operatingProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
              <p className="text-xs text-muted-foreground">営業利益{projectId && <span className="text-[10px] ml-1">(粗利同値)</span>}</p>
              <p className={`font-bold font-number mt-1 ${operatingProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatCurrency(operatingProfit)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* 売上テーブル */}
            <div className="space-y-2">
              <h2 className="text-base font-semibold">売上</h2>
              {revLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
                <div className="overflow-x-auto rounded border">
                  <Table className={Object.keys(revResize.colWidths).length > 0 ? "table-fixed" : ""}>
                    <TableHeader>
                      <TableRow>
                        <ResizableHead colId="r_key" label="請求KEY" defaultW={120} colWidths={revResize.colWidths} startResize={revResize.startResize} />
                        {!projectId && <ResizableHead colId="r_proj" label="案件" defaultW={180} colWidths={revResize.colWidths} startResize={revResize.startResize} />}
                        <ResizableHead colId="r_tax" label="税区分" defaultW={70} colWidths={revResize.colWidths} startResize={revResize.startResize} />
                        <ResizableHead colId="r_month" label="計上月" defaultW={90} colWidths={revResize.colWidths} startResize={revResize.startResize} />
                        <ResizableHead colId="r_inv" label="請求書" defaultW={70} colWidths={revResize.colWidths} startResize={revResize.startResize} />
                        <ResizableHead colId="r_amt" label="金額" defaultW={100} colWidths={revResize.colWidths} startResize={revResize.startResize} align="right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenues.length === 0 ? (
                        <TableRow><TableCell colSpan={projectId ? 5 : 6} className="text-center text-muted-foreground">データなし</TableCell></TableRow>
                      ) : revenues.map((r) => (
                        <TableRow key={r.id as string}>
                          <TableCell className=" text-xs">{(r.billing_key as string) || "-"}</TableCell>
                          {!projectId && (
                            <TableCell className="text-xs truncate max-w-[200px]">
                              <span className=" text-primary mr-1">{(r.gls_number as string) || "-"}</span>
                              <span>{(r.project_name as string) || "-"}</span>
                            </TableCell>
                          )}
                          <TableCell className="text-xs">{r.tax_category === "tax10" ? "10%" : r.tax_category === "tax8" ? "8%" : "非課税"}</TableCell>
                          <TableCell className="text-xs">{formatMonth(r.recognition_date as string)}</TableCell>
                          <TableCell className="text-xs">
                            {r.invoice_issued ? (
                              <Badge variant="outline" className="gap-1 border-emerald-400 text-emerald-700 bg-emerald-50">
                                <FileCheck2 className="h-3 w-3" /> 発行済
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">未</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-number font-medium">{formatCurrency(r.amount as number)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between items-center px-4 py-2 bg-muted/50 border-t">
                    <span className="text-sm font-medium">売上合計</span>
                    <span className="font-bold font-number">{formatCurrency(totalRevenue)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 仕入テーブル */}
            <div className="space-y-2">
              <h2 className="text-base font-semibold">仕入</h2>
              {purLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
                <div className="overflow-x-auto rounded border">
                  <Table className={Object.keys(purResize.colWidths).length > 0 ? "table-fixed" : ""}>
                    <TableHeader>
                      <TableRow>
                        <ResizableHead colId="p_vendor" label="仕入先" defaultW={130} colWidths={purResize.colWidths} startResize={purResize.startResize} />
                        {!projectId && <ResizableHead colId="p_proj" label="案件" defaultW={160} colWidths={purResize.colWidths} startResize={purResize.startResize} />}
                        <ResizableHead colId="p_desc" label="説明" defaultW={160} colWidths={purResize.colWidths} startResize={purResize.startResize} />
                        <ResizableHead colId="p_due" label="支払予定日" defaultW={100} colWidths={purResize.colWidths} startResize={purResize.startResize} />
                        <ResizableHead colId="p_settle" label="申請" defaultW={100} colWidths={purResize.colWidths} startResize={purResize.startResize} />
                        <ResizableHead colId="p_amt" label="金額" defaultW={100} colWidths={purResize.colWidths} startResize={purResize.startResize} align="right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.length === 0 ? (
                        <TableRow><TableCell colSpan={projectId ? 5 : 6} className="text-center text-muted-foreground">データなし</TableCell></TableRow>
                      ) : purchases.map((p) => {
                        const settled = formatSettlementNo(p.settlement_method, p.settlement_number);
                        return (
                          <TableRow key={p.id as string}>
                            <TableCell className="truncate max-w-[130px]">{(p.vendor_name as string) || "-"}</TableCell>
                            {!projectId && (
                              <TableCell className="text-xs truncate max-w-[200px]">
                                <span className=" text-primary mr-1">{(p.gls_number as string) || "-"}</span>
                                <span>{(p.project_name as string) || "-"}</span>
                              </TableCell>
                            )}
                            <TableCell className="truncate max-w-[160px] text-xs">{(p.description as string) || "-"}</TableCell>
                            <TableCell className="text-xs">{formatDate(p.payment_due_date as string)}</TableCell>
                            <TableCell className="text-xs">
                              {settled ? <span className=" text-foreground">{settled}</span> : <span className="text-muted-foreground">未申請</span>}
                            </TableCell>
                            <TableCell className="text-right font-number font-medium">{formatCurrency(p.amount as number)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="flex justify-between items-center px-4 py-2 bg-muted/50 border-t">
                    <span className="text-sm font-medium">仕入合計</span>
                    <span className="font-bold font-number">{formatCurrency(totalPurchase)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* 販管費テーブル (案件絞り込み中は全社データであることを注記) */}
            <div className="space-y-2 xl:col-span-2">
              <h2 className="text-base font-semibold">
                販管費
                {projectId && <span className="ml-2 text-xs font-normal text-muted-foreground">※ 案件別按分なし・月内の全社データ</span>}
              </h2>
                {sgaLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
                  <div className="overflow-x-auto rounded border">
                    <Table className={Object.keys(sgaResize.colWidths).length > 0 ? "table-fixed" : ""}>
                      <TableHeader>
                        <TableRow>
                          <ResizableHead colId="s_key" label="請求KEY" defaultW={120} colWidths={sgaResize.colWidths} startResize={sgaResize.startResize} />
                          <ResizableHead colId="s_vendor" label="取引先" defaultW={130} colWidths={sgaResize.colWidths} startResize={sgaResize.startResize} />
                          <ResizableHead colId="s_desc" label="説明" defaultW={180} colWidths={sgaResize.colWidths} startResize={sgaResize.startResize} />
                          <ResizableHead colId="s_type" label="区分" defaultW={80} colWidths={sgaResize.colWidths} startResize={sgaResize.startResize} />
                          <ResizableHead colId="s_date" label="計上日" defaultW={100} colWidths={sgaResize.colWidths} startResize={sgaResize.startResize} />
                          <ResizableHead colId="s_settle" label="申請" defaultW={100} colWidths={sgaResize.colWidths} startResize={sgaResize.startResize} />
                          <ResizableHead colId="s_amt" label="金額" defaultW={100} colWidths={sgaResize.colWidths} startResize={sgaResize.startResize} align="right" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sgaExpenses.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">データなし</TableCell></TableRow>
                        ) : sgaExpenses.map((e) => {
                          const settled = formatSettlementNo(e.settlement_method, e.settlement_number);
                          return (
                            <TableRow key={e.id as string}>
                              <TableCell className=" text-xs">{(e.billing_key as string) || "-"}</TableCell>
                              <TableCell className="truncate max-w-[130px]">{(e.vendor_name as string) || "-"}</TableCell>
                              <TableCell className="truncate max-w-[180px] text-xs">{(e.description as string) || "-"}</TableCell>
                              <TableCell className="text-xs">{e.expense_type === "fixed" ? "固定" : "スポット"}</TableCell>
                              <TableCell className="text-xs">{formatDate(e.recognition_date as string)}</TableCell>
                              <TableCell className="text-xs">
                                {settled ? <span className=" text-foreground">{settled}</span> : <span className="text-muted-foreground">未申請</span>}
                              </TableCell>
                              <TableCell className="text-right font-number font-medium">{formatCurrency(e.amount as number)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="flex justify-between items-center px-4 py-2 bg-muted/50 border-t">
                      <span className="text-sm font-medium">販管費合計</span>
                      <span className="font-bold font-number">{formatCurrency(totalSga)}</span>
                    </div>
                  </div>
                )}
              </div>
          </div>

        </>
      )}
    </div>
    </PageTransition>
  );
}
