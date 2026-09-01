/**
 * GPM の請求タブ — 月次管理（月締めの売上・仕入。1月 = 1請求単位）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません**（段8）。
 * インデントも元のまま。
 *
 * ⚠️ **出す・出さないの条件（`monthlyMode`）は親に残しています。**
 * 子に `if (…) return null` を新しく作らないこと。
 *
 * ⚠️ **props の型は親の宣言をそのまま写しています**（推測しない）。
 * `openNewForMonth` は**3引数**、`openNewPurchaseForMonth` は**2引数**、
 * `monthEpisodes` は `billing_key` ではなく **`episode_code`** を持ちます。
 * 過去の分割ではここを推測して5件間違えています。
 *
 * ⚠️ **`confirm()` はそのまま**（`check-ui-tokens` の件数が動くと検査が止まる）。
 */
import { Plus, Pencil, Trash2, Loader2, FileText, FileSpreadsheet, ClipboardCheck, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import type { DocKind } from '@/lib/docPdf';
import type { Project } from '@/types';
import type { Revenue, Purchase } from './types';

export function MonthlyBilling({
  project, monthEpisodes, revenues, purchases,
  newMonth, setNewMonth, addMonthMutation, handleDeleteMonth,
  openEdit, openNewForMonth, openEditPurchase, openNewPurchaseForMonth,
  handleDownloadPdf, handleDownloadExcel,
}: {
  project: Project;
  monthEpisodes: Array<{ id: string; episode_code: string; episode_number: number; title: string | null }>;
  /** 売上の全件。月ごとの絞り込みは中で `episode_id` で行う（元の実装のまま） */
  revenues: Revenue[];
  /** 仕入の全件 */
  purchases: Purchase[];
  newMonth: string;
  setNewMonth: (v: string) => void;
  addMonthMutation: { isPending: boolean; mutate: (ym: string) => void };
  handleDeleteMonth: (ep: { id: string; episode_code: string }) => void;
  /** ⚠️ **async**（詳細を引いてから開く） */
  openEdit: (rev: Revenue) => Promise<void>;
  /** ⚠️ **3引数** */
  openNewForMonth: (epId: string, monthTitle: string, recMonth?: string) => void;
  openEditPurchase: (pu: Purchase) => void;
  /** ⚠️ **2引数** */
  openNewPurchaseForMonth: (epId: string, recMonth?: string) => void;
  handleDownloadPdf: (revenueId: string, type: DocKind) => void;
  handleDownloadExcel: (revenueId: string) => Promise<void>;
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
