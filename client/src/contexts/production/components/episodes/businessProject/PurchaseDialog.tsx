/**
 * GPM の請求タブ — 仕入の追加・編集ダイアログ（段10）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません。**
 * インデントも元のまま。
 *
 * ⚠️ **props は `form` 1つだけ**（`usePurchaseForm` の返り値をそのまま渡す）。
 * 25 個の値を1つずつ props にすると**型を推測して間違えます**（過去の分割で5件間違えた）。
 * `ReturnType<typeof usePurchaseForm>` なら、親の宣言がそのまま型になります。
 *
 * ⚠️ **日付の自動入力（計上月・支払予定日）は営業日調整つきのまま。**
 * 「空のときだけ上書きする」条件を落とさないこと。
 */
import { Loader2, Trash2 } from 'lucide-react';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { previousBusinessDay, toLocalDateStr } from '@gmo-onair/shared/src/utils/businessDays';
import {
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
} from '@/types';
import type { usePurchaseForm } from './usePurchaseForm';

export function PurchaseDialog({
  form, monthEpisodes,
}: {
  form: ReturnType<typeof usePurchaseForm>;
  monthEpisodes: Array<{ id: string; episode_code: string; episode_number: number; title: string | null }>;
}) {
  // ⚠️ **親と同じ名前に開く**ので、下の JSX は1文字も変わっていない
  const {
    purDialogOpen, editingPurId, purEpisodeId,
    purVendorId, setPurVendorId, purAmount, setPurAmount, purDesc, setPurDesc,
    purTax, setPurTax, purSettlement, setPurSettlement,
    purSettlementNo, setPurSettlementNo, purSettlementUrl, setPurSettlementUrl,
    purInvoice, setPurInvoice, purRecMonth, setPurRecMonth,
    purServiceDate, setPurServiceDate, purPayDueDate, setPurPayDueDate,
    purIsProvisional, setPurIsProvisional, purNotes, setPurNotes,
    vendors, savePurMutation, deletePurMutation, closePurDialog, handlePurSubmit,
  } = form;

  return (
      <FormDialog
        open={purDialogOpen}
        onOpenChange={(open) => { if (!open) closePurDialog(); }}
        title={editingPurId ? "仕入の編集" : "仕入の追加"} size="lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {editingPurId && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!confirm("この仕入を削除しますか？この操作は元に戻せません。")) return;
                    deletePurMutation.mutate(editingPurId, { onSuccess: () => closePurDialog() });
                  }}
                  disabled={deletePurMutation.isPending}
                >
                  {deletePurMutation.isPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-4 w-4" />
                  )}
                  削除
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={closePurDialog}>キャンセル</Button>
              <Button disabled={!purVendorId || savePurMutation.isPending} onClick={handlePurSubmit}>
                {savePurMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingPurId ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        }
      >
          <div className="space-y-4">
            {purEpisodeId && (
              <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
                月ぶんの請求{" "}
                <span className="font-medium">
                  {monthEpisodes.find((e) => e.id === purEpisodeId)?.episode_code || ""}
                </span>
                {" "}に紐づけて登録します
              </div>
            )}
            <div>
              <Label>仕入先 *</Label>
              <SearchableSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || "" }))}
                value={purVendorId}
                onChange={setPurVendorId}
                placeholder="仕入先を検索â¦"
              />
            </div>

            <div>
              <Label>金額</Label>
              <div className="flex items-center gap-1">
                <div className="flex-1">
                  <CurrencyInput value={purAmount} onChange={setPurAmount} />
                </div>
                <TaxHelperButton
                  fieldLabel="仕入金額"
                  defaultIncludedAmount={purAmount}
                  onResult={setPurAmount}
                />
              </div>
            </div>

            <div>
              <Label>説明</Label>
              <Textarea
                value={purDesc}
                onChange={(e) => setPurDesc(e.target.value)}
                placeholder="仕入の説明"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pur-is-provisional" className="cursor-pointer">
                仮（確定前の見込み仕入）
              </Label>
              <Switch
                id="pur-is-provisional"
                checked={purIsProvisional}
                onCheckedChange={(v) => setPurIsProvisional(!!v)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>税区分</Label>
                <Select value={purTax} onValueChange={setPurTax}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                      <SelectItem key={key} value={key}>{TaxCategoryLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>精算方法</Label>
                <Select value={purSettlement} onValueChange={setPurSettlement}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map((key) => (
                      <SelectItem key={key} value={key}>{SettlementMethodLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div>
                <Label>役務提供完了日</Label>
                <Input
                  type="date"
                  value={purServiceDate}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPurServiceDate(val);
                    if (val) {
                      const [y, m] = val.split("-").map(Number);
                      if (y && m) {
                        setPurRecMonth(`${y}-${String(m).padStart(2, "0")}`);
                        // 翌月末が土日祝のときは前営業日に調整
                        setPurPayDueDate(toLocalDateStr(previousBusinessDay(new Date(y, m + 1, 0))));
                      }
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-0.5">
                  入力すると計上月（当月）・支払予定日（翌月末、土日祝は前営業日）を自動入力します
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>計上月</Label>
                  <Input
                    type="month"
                    value={purRecMonth}
                    onChange={(e) => setPurRecMonth(e.target.value)}
                  />
                </div>
                <div>
                  <Label>支払予定日</Label>
                  <Input
                    type="date"
                    value={purPayDueDate}
                    onChange={(e) => setPurPayDueDate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>精算番号</Label>
                <Input value={purSettlementNo} onChange={(e) => setPurSettlementNo(e.target.value)} placeholder="任意" />
              </div>
              <div>
                <Label>申請URL</Label>
                <Input
                  type="url"
                  value={purSettlementUrl}
                  onChange={(e) => setPurSettlementUrl(e.target.value)}
                  placeholder="精算申請ページのURL（任意）"
                />
              </div>
            </div>

            <div>
              <Label>インボイス</Label>
              <Select value={purInvoice} onValueChange={setPurInvoice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">適格事業者</SelectItem>
                  <SelectItem value="unqualified">非適格事業者</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>備考</Label>
              <Textarea
                value={purNotes}
                onChange={(e) => setPurNotes(e.target.value)}
                placeholder="任意"
                rows={2}
              />
            </div>
          </div>
      </FormDialog>
  );
}
