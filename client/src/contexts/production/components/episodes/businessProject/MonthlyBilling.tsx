// ビジネス案件ビューの「月次請求」 — v2.9.293 で BusinessProjectView.tsx から切り出し。
// 1 月 = 1 請求単位 (GLS-XXXX-YYMM)。**JSX は 1 行も変えていない**（props 経由に置き換えただけ）。
//
// 呼び出し側で `{monthlyMode && <MonthlyBilling … />}` と出し分ける
// (元は `{monthlyMode && (…)}` で囲っていたので、条件の位置が変わっただけ)。
import { Receipt, Plus, Trash2, FileSpreadsheet, FileText, Pencil, Loader2, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import type { Project } from '@/types';
import type { Purchase, Revenue } from './types';

export default function MonthlyBilling({
  monthEpisodes, revenues, purchases, newMonth, setNewMonth, addMonthMutation,
  handleDeleteMonth, handleDownloadExcel, handleDownloadPdf,
  openEdit, openNewForMonth, openEditPurchase, openNewPurchaseForMonth, project,
}: {
  // 型は親 (BusinessProjectView) の宣言をそのまま写している。
  // 推測で書くと「渡せるが意味が違う」形になるので、必ず元に合わせる。
  monthEpisodes: Array<{ id: string; episode_code: string; episode_number: number; title: string | null }>;
  revenues: Revenue[];
  purchases: Purchase[];
  newMonth: string;
  setNewMonth: (v: string) => void;
  addMonthMutation: { mutate: (v: string) => void; isPending: boolean };
  handleDeleteMonth: (ep: { id: string; episode_code: string }) => void | Promise<void>;
  handleDownloadExcel: (revenueId: string) => void | Promise<void>;
  handleDownloadPdf: (revenueId: string, type: 'estimate' | 'invoice' | 'inspection') => void | Promise<void>;
  openEdit: (rev: Revenue) => void | Promise<void>;
  openNewForMonth: (epId: string, monthTitle: string, recMonth?: string) => void;
  openEditPurchase: (pu: Purchase) => void;
  openNewPurchaseForMonth: (epId: string, recMonth?: string) => void;
  project: Project;
}) {
  return (
    <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              月次管理（月締め：売上・仕入）
            </h2>
            <div className="flex items-center gap-2">
              <Input
                type="month"
                value={newMonth}
                onChange={(e) => setNewMonth(e.target.value)}
                className="h-9 w-40"
                aria-label="追加する対象月"
              />
              <Button
                size="sm"
                disabled={!newMonth || addMonthMutation.isPending}
                onClick={() => addMonthMutation.mutate(newMonth)}
              >
                {addMonthMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                月を追加
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            月ごとに <span className="font-medium text-foreground">{project.gls_number}-YYMM</span>{" "}
            の請求単位を作り、その月の<span className="font-medium text-foreground">売上・仕入</span>をまとめて管理します（締め月が違っても月別に分けられます）。1月＝1請求書/見積書。
          </p>

          {monthEpisodes.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                月次ユニットがありません。上の入力欄で対象月を選び「月を追加」してください。
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {monthEpisodes.map((ep) => {
                const monthRevs = revenues.filter((r) => (r as any).episode_id === ep.id);
                const monthPurs = purchases.filter((p) => (p as any).episode_id === ep.id);
                const revTotal = monthRevs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
                const purTotal = monthPurs.reduce((s, p) => s + (Number(p.amount) || 0), 0);
                const primaryRev = monthRevs[0];
                // episode_code の末尾 YYMM から計上月 (YYYY-MM) を導出
                const mm = ep.episode_code.match(/-(\d{2})(\d{2})$/);
                const recMonth = mm ? `20${mm[1]}-${mm[2]}` : undefined;
                return (
                  <Card key={ep.id}>
                    <CardContent className="space-y-3 py-3 px-4">
                      {/* ヘッダー: コード + 売上/仕入/粗利 + 削除 */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold">
                          {ep.episode_code}
                          {ep.title && <span className="ml-2 text-muted-foreground font-normal">{ep.title}</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span>売上 <span className="font-medium font-number">{formatCurrency(revTotal)}</span></span>
                          <span className="text-muted-foreground">仕入 <span className="font-medium font-number">{formatCurrency(purTotal)}</span></span>
                          <span className="text-primary">粗利 <span className="font-medium font-number">{formatCurrency(revTotal - purTotal)}</span></span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            title="この月ユニットを削除（紐づく売上/仕入がある場合は先に削除が必要）"
                            onClick={() => handleDeleteMonth(ep)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* 売上 */}
                      <div className="rounded-md border bg-muted/20 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">売上（請求）</span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {primaryRev ? (
                              <>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openEdit(primaryRev)}>
                                  <Pencil className="h-3 w-3" />明細編集
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadPdf(primaryRev.id, "estimate")}>
                                  <FileText className="h-3 w-3" />見積書
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadPdf(primaryRev.id, "invoice")}>
                                  <Receipt className="h-3 w-3" />請求書
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadPdf(primaryRev.id, "inspection")}>
                                  <ClipboardCheck className="h-3 w-3" />検収書
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => handleDownloadExcel(primaryRev.id)}>
                                  <FileSpreadsheet className="h-3 w-3" />Excel
                                </Button>
                              </>
                            ) : (
                              <Button size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openNewForMonth(ep.id, ep.title || "", mm ? `20${mm[1]}-${mm[2]}` : undefined)}>
                                <Plus className="h-3 w-3" />売上明細を入力
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 仕入 */}
                      <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium">仕入</span>
                          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => openNewPurchaseForMonth(ep.id, recMonth)}>
                            <Plus className="h-3 w-3" />仕入を追加
                          </Button>
                        </div>
                        {monthPurs.length > 0 && (
                          <div className="divide-y">
                            {monthPurs.map((pu) => (
                              <button
                                key={pu.id}
                                type="button"
                                className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs hover:bg-muted/40 rounded px-1"
                                onClick={() => openEditPurchase(pu)}
                                title="この仕入を編集"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {pu.vendor_name || "—"}
                                  {pu.description && <span className="text-muted-foreground ml-1">{pu.description}</span>}
                                </span>
                                <span className="font-number shrink-0">{formatCurrency(pu.amount)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
  );
}
