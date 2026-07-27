// ビジネス案件ビューの「売上一覧（見積/売上明細）」 — v2.9.293 で BusinessProjectView.tsx から切り出し。
// **JSX は 1 行も変えていない**（props 経由に置き換えただけ）。
//
// 型は親 (BusinessProjectView) の宣言をそのまま写している。
// 推測で書くと「渡せるが意味が違う」形になるので、必ず元に合わせる。
import { Loader2, Plus, Receipt, Pencil, Trash2, FileSpreadsheet, FileText, ClipboardCheck, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { formatCurrency, formatDate } from '@/lib/format';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { taxLabels, type Revenue, type RevenueItem } from './types';

export default function RevenueList({
  monthlyMode, isEstimateMode, isLoading, flatRevenues,
  openNew, openEdit, deleteMutation,
  handleDownloadExcel, handleDownloadPdf,
  inlineEditId, inlineItems, startInlineEdit, cancelInlineEdit,
  updateInlineItem, addInlineItem, removeInlineItem, inlineSaveMutation,
  setSimDialogOpen,
}: {
  monthlyMode: boolean;
  isEstimateMode?: boolean;
  isLoading: boolean;
  flatRevenues: Revenue[];
  openNew: () => void;
  openEdit: (rev: Revenue) => void | Promise<void>;
  deleteMutation: { mutate: (id: string) => void };
  handleDownloadExcel: (revenueId: string) => void | Promise<void>;
  handleDownloadPdf: (revenueId: string, type: 'estimate' | 'invoice' | 'inspection') => void | Promise<void>;
  inlineEditId: string | null;
  inlineItems: RevenueItem[];
  startInlineEdit: (rev: Revenue) => void;
  cancelInlineEdit: () => void;
  updateInlineItem: (idx: number, field: keyof RevenueItem, value: string | number) => void;
  addInlineItem: () => void;
  removeInlineItem: (idx: number) => void;
  inlineSaveMutation: { mutate: (v: { id: string; items: RevenueItem[] }) => void; isPending: boolean };
  setSimDialogOpen: (v: boolean) => void;
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
                        onClick={() => openEdit(rev)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={async () => {
                          if ((await confirmAction({ title: "この明細を削除しますか？", confirmLabel: '削除する', tone: 'danger' })))
                            deleteMutation.mutate(rev.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* 明細項目: 表示 / インライン編集 (v2.8.104+) */}
                  {(rev.items && rev.items.length > 0) || inlineEditId === rev.id ? (
                    <div className="mt-3 border-t pt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-muted-foreground tracking-wide">明細項目</span>
                        {inlineEditId !== rev.id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => startInlineEdit(rev)}
                            title="明細項目をインラインで編集"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            明細を編集
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={cancelInlineEdit}
                              disabled={inlineSaveMutation.isPending}
                            >
                              キャンセル
                            </Button>
                            <Button
                              size="sm"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => inlineSaveMutation.mutate({ id: rev.id, items: inlineItems })}
                              disabled={inlineSaveMutation.isPending}
                            >
                              {inlineSaveMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : null}
                              保存
                            </Button>
                          </div>
                        )}
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-normal pb-1">項目</th>
                            <th className="text-right font-normal pb-1 w-16">数量</th>
                            <th className="text-right font-normal pb-1 w-24">単価</th>
                            <th className="text-right font-normal pb-1 w-24">金額</th>
                            {inlineEditId === rev.id && <th className="w-8"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {inlineEditId === rev.id
                            ? inlineItems.map((item, idx) => (
                                <tr key={idx} className="border-t border-dashed">
                                  <td className="py-1 pr-1">
                                    <Input
                                      value={item.description}
                                      onChange={(e) => updateInlineItem(idx, "description", e.target.value)}
                                      placeholder="項目名"
                                      className="h-7 text-xs"
                                    />
                                  </td>
                                  <td className="py-1 px-1">
                                    <Input
                                      type="number"
                                      min={1}
                                      value={item.quantity}
                                      onChange={(e) =>
                                        updateInlineItem(idx, "quantity", parseInt(e.target.value) || 0)
                                      }
                                      className="h-7 text-xs text-right"
                                    />
                                  </td>
                                  <td className="py-1 px-1">
                                    <div className="flex items-center gap-0.5">
                                      <Input
                                        type="number"
                                        min={0}
                                        value={item.unit_price}
                                        onChange={(e) =>
                                          updateInlineItem(idx, "unit_price", parseInt(e.target.value) || 0)
                                        }
                                        className="h-7 text-xs text-right flex-1"
                                      />
                                      <TaxHelperButton
                                        fieldLabel="単価"
                                        defaultIncludedAmount={item.unit_price}
                                        onResult={(v) => updateInlineItem(idx, "unit_price", v)}
                                      />
                                    </div>
                                  </td>
                                  <td className="py-1 text-right font-number font-medium tabular-nums">
                                    {formatCurrency(item.amount)}
                                  </td>
                                  <td className="py-1 pl-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive"
                                      onClick={() => removeInlineItem(idx)}
                                      title="この行を削除"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            : rev.items!.map((item, idx) => (
                                <tr key={idx} className="border-t border-dashed">
                                  <td className="py-1">{item.description}</td>
                                  <td className="py-1 text-right font-number">{item.quantity}</td>
                                  <td className="py-1 text-right font-number">{formatCurrency(item.unit_price)}</td>
                                  <td className="py-1 text-right font-number font-medium">{formatCurrency(item.amount)}</td>
                                </tr>
                              ))}
                        </tbody>
                      </table>
                      {inlineEditId === rev.id && (
                        <div className="mt-2 flex items-center justify-between">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={addInlineItem}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            行追加
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            合計: <span className="font-number font-medium text-foreground">
                              {formatCurrency(inlineItems.reduce((s, it) => s + (it.amount || 0), 0))}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 border-t pt-2 flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-muted-foreground"
                        onClick={() => startInlineEdit(rev)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        明細項目を追加
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
}
