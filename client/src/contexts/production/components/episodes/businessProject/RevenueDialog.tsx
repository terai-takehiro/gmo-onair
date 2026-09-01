/**
 * GPM の請求タブ — 売上明細（見積）の追加・編集ダイアログ（段14）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 * インデントも元のまま。
 *
 * ⚠️ **props は `form` 1つだけ**（`useRevenueForm` の返り値をそのまま渡す）。
 * 30 個近い値を1つずつ props にすると**型を推測して間違えます**（過去の分割で5件間違えた）。
 *
 * ⚠️ **外側クリックと Esc で閉じない**（`onInteractOutside` / `onEscapeKeyDown` を止めている）。
 * 長い明細を入れている最中に閉じると全部消えるため。**この2つを外さないこと**。
 */
import { Plus, Loader2, Percent, Link2, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { previousBusinessDay, toLocalDateStr } from '@gmo-onair/shared/src/utils/businessDays';
import { formatCurrency } from '@/lib/format';
import { TaxCategory, TaxCategoryLabels } from '@/types';
import { RevenueItemRows } from './RevenueItemRows';
import type { useRevenueForm } from './useRevenueForm';

export function RevenueDialog({
  form, isCategoryA, isEstimateMode,
}: {
  form: ReturnType<typeof useRevenueForm>;
  isCategoryA: boolean;
  isEstimateMode?: boolean;
}) {
  // ⚠️ **親と同じ名前に開く**ので、下の JSX は1文字も変わっていない
  const {
    dialogOpen, editingId, closeDialog,
    subtitle, setSubtitle, items, updateItem, removeItem, addItem,
    openItemDiscount, openGlobalDiscount, setPricingPickerOpen, setSimDialogOpen,
    totalAmount, taxCategory, setTaxCategory,
    recognitionDate, setRecognitionDate, billingDate, setBillingDate,
    paymentDueDate, setPaymentDueDate, notes, setNotes,
    saveMutation, handleSubmit,
  } = form;

  return (
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent
          size="full" className="max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {isEstimateMode
                ? (editingId ? "概算見積の編集" : "概算見積の追加")
                : (editingId ? "売上明細の編集" : "売上明細の追加")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Subtitle (A-type only) */}
            {isCategoryA && (
              <div>
                <Label>番号ラベル（小見出し）</Label>
                <Input
                  placeholder="例: 2025年株主総会"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  この番号が何を表すかのラベル（番組名・イベント年度など）
                </p>
              </div>
            )}

            {/* Line Items */}
            <div>
              <Label className="text-sm font-semibold">明細項目</Label>
              <datalist id="revenue-item-categories">
                <option value="制作費" />
                <option value="機材費" />
                <option value="人件費" />
                <option value="スタジオ費" />
                <option value="配信費" />
                <option value="諸経費" />
              </datalist>

              <RevenueItemRows
                items={items}
                updateItem={updateItem}
                removeItem={removeItem}
                openItemDiscount={openItemDiscount}
              />

              {/* v2.8.106+: 項目追加・料金表・シミュレーション・全体値引き ボタン
                  (PC table とモバイル card の両方で共通表示) */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  項目追加
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPricingPickerOpen(true)}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  料金表から追加
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSimDialogOpen(true)}
                >
                  <Calculator className="h-3 w-3 mr-1" />
                  シミュレーション
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-amber-700 border-amber-300 hover:bg-amber-50"
                  onClick={openGlobalDiscount}
                >
                  <Percent className="h-3 w-3 mr-1" />
                  全体値引き
                </Button>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-sm font-medium">合計金額</span>
              <span className="text-lg font-bold font-number">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            {/* Tax & Dates */}
            <div className={`grid gap-3 ${isEstimateMode ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
              <div>
                <Label>税区分</Label>
                <Select value={taxCategory} onValueChange={setTaxCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                      <SelectItem key={key} value={key}>{TaxCategoryLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!isEstimateMode && (
                <>
                  <div>
                    <Label>計上日</Label>
                    <Input
                      type="date"
                      value={recognitionDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRecognitionDate(val);
                        // v2.8.103+: 計上日入力時、請求日 (計上月末) と支払期日 (翌月末) を
                        // 営業日調整して自動入力。既に値が入っている場合は上書きしない。
                        if (val) {
                          const [y, m] = val.split("-").map(Number);
                          if (y && m) {
                            if (!billingDate) {
                              setBillingDate(toLocalDateStr(previousBusinessDay(new Date(y, m, 0))));
                            }
                            if (!paymentDueDate) {
                              setPaymentDueDate(toLocalDateStr(previousBusinessDay(new Date(y, m + 1, 0))));
                            }
                          }
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      入力すると請求日（計上月末）・支払期日（翌月末）を営業日調整して自動入力（土日祝なら前営業日）
                    </p>
                  </div>
                  <div>
                    <Label>請求日</Label>
                    <Input
                      type="date"
                      value={billingDate}
                      onChange={(e) => setBillingDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>支払期日</Label>
                    <Input
                      type="date"
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>メモ</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="備考など"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                saveMutation.isPending ||
                items.filter((it) => it.description).length === 0
              }
            >
              {saveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
