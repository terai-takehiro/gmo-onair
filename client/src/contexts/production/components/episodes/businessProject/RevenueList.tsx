/**
 * GPM の請求タブ — 見積・売上明細の一覧（月次ユニットに属さないぶん）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません**（段7）。
 * インデントも元のまま。
 *
 * ⚠️ **props の型は親の宣言をそのまま写しています**（推測しない）。
 * `openEdit` は **async**（詳細を引いてから開く）、`handleDownloadPdf` は**2引数**、
 * `handleDownloadExcel` は**1引数**。過去の分割ではここを推測して5件間違えています。
 *
 * ⚠️ **`confirm()` と生のパレットはそのまま。** `check-ui-tokens` はアプリ単位の
 * 件数を数えるので、書き換えても写しても検査が止まります。
 *
 * ⚠️ **シミュレーションはこの一覧の見出しからも開きます**（`isEstimateMode` のとき）。
 * ダイアログの中のボタンと**2か所から開く**ので、`setSimDialogOpen` を受け取ります。
 */
import { Plus, Pencil, Trash2, Loader2, FileText, FileSpreadsheet, ClipboardCheck, Receipt, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatDate } from '@/lib/format';
import type { DocKind } from '@/lib/docPdf';
import { RevenueItemsInline } from './RevenueItemsInline';
import type { Revenue, RevenueItem } from './types';
import { taxLabels } from './types';

export function RevenueList({
  monthlyMode, isEstimateMode, isLoading, flatRevenues,
  openNew, openEdit, deleteMutation, setSimDialogOpen,
  handleDownloadPdf, handleDownloadExcel,
  inlineEditId, inlineItems, inlineSaveMutation,
  startInlineEdit, cancelInlineEdit, addInlineItem, updateInlineItem, removeInlineItem,
}: {
  monthlyMode: boolean;
  isEstimateMode?: boolean;
  isLoading: boolean;
  flatRevenues: Revenue[];
  openNew: () => void;
  /** ⚠️ **async**（詳細を引いてから開く） */
  openEdit: (rev: Revenue) => Promise<void>;
  deleteMutation: { mutate: (id: string) => void };
  setSimDialogOpen: (v: boolean) => void;
  handleDownloadPdf: (revenueId: string, type: DocKind) => void;
  handleDownloadExcel: (revenueId: string) => Promise<void>;
  inlineEditId: string | null;
  inlineItems: RevenueItem[];
  inlineSaveMutation: { isPending: boolean; mutate: (v: { id: string; items: RevenueItem[] }) => void };
  startInlineEdit: (rev: Revenue) => void;
  cancelInlineEdit: () => void;
  addInlineItem: () => void;
  updateInlineItem: (idx: number, field: keyof RevenueItem, value: string | number) => void;
  removeInlineItem: (idx: number) => void;
}) {
  return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {isEstimateMode ? "概算見積書" : monthlyMode ? "その他の売上明細（月次外）" : "見積・売上明細"}
          </h2>
          <div className="flex items-center gap-2">
            {isEstimateMode && (
              <Button size="sm" variant="outline" onClick={() => setSimDialogOpen(true)}>
                <Calculator className="h-4 w-4 mr-1" />
                シミュレーション
              </Button>
            )}
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              {isEstimateMode ? "見積追加" : "明細追加"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : flatRevenues.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {monthlyMode
                ? "月次以外の売上明細はありません。月締め請求は上の「月次請求」から管理します。"
                : "売上明細がありません。「明細追加」から見積構成を作成してください。"}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {flatRevenues.map((rev) => (
              <Card key={rev.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className=" text-sm font-semibold">
                          {rev.billing_key}
                        </span>
                        {rev.subtitle && (
                          <span className="text-sm font-medium">{rev.subtitle}</span>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {taxLabels[rev.tax_category] || rev.tax_category}
                        </Badge>
                        {rev.group_name && (
                          <Badge variant="secondary" className="text-xs">按分: {rev.group_name}</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {rev.recognition_date && (
                          <span>計上日: {formatDate(rev.recognition_date)}</span>
                        )}
                        {rev.billing_date && (
                          <span>請求日: {formatDate(rev.billing_date)}</span>
                        )}
                        {rev.payment_due_date && (
                          <span>支払期日: {formatDate(rev.payment_due_date)}</span>
                        )}
                      </div>
                      {rev.notes && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          {rev.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="text-right mr-2">
                        <span className="font-number text-lg font-bold">
                          {formatCurrency(rev.allocated_amount != null ? rev.allocated_amount : rev.amount)}
                        </span>
                        {rev.allocated_amount != null && rev.allocated_amount !== rev.amount && (
                          <div className="text-xs text-muted-foreground font-number">
                            全体 {formatCurrency(rev.amount)}
                          </div>
                        )}
                      </div>
                      {rev.items && rev.items.length > 0 && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="見積書PDFを発行"
                            onClick={() => handleDownloadPdf(rev.id, 'estimate')}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">見積書</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="請求書PDFを発行"
                            onClick={() => handleDownloadPdf(rev.id, 'invoice')}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">請求書</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="検収書PDFを発行"
                            onClick={() => handleDownloadPdf(rev.id, 'inspection')}
                          >
                            <ClipboardCheck className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">検収書</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            title="請求書Excelを発行（業務推進提出用）"
                            onClick={() => handleDownloadExcel(rev.id)}
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">請求書Excel</span>
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="この明細を編集"
                        title="この明細を編集"
                        onClick={() => openEdit(rev)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        aria-label="この明細を削除"
                        title="この明細を削除"
                        onClick={() => {
                          if (confirm("この明細を削除しますか？"))
                            deleteMutation.mutate(rev.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* 明細項目（中身は businessProject/RevenueItemsInline.tsx） */}
                  <RevenueItemsInline
                    rev={rev}
                    inlineEditId={inlineEditId}
                    inlineItems={inlineItems}
                    inlineSaveMutation={inlineSaveMutation}
                    startInlineEdit={startInlineEdit}
                    cancelInlineEdit={cancelInlineEdit}
                    addInlineItem={addInlineItem}
                    updateInlineItem={updateInlineItem}
                    removeInlineItem={removeInlineItem}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
}
