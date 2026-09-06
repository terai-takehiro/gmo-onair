/**
 * 販管費の「支払先・金額・税区分」（⑤ 販管費のダイアログの中身）
 *
 * **`SgaDialog` から切り出したものです。JSX を1文字も変えずに移しています。**
 * 分けた理由は1ファイル400行の上限（`client/CLAUDE.md`）で、欄の作り直しでは
 * ありません。**この回で組み直した並び順（支払先 → 金額・税区分）もそのまま**です。
 *
 * まとまりの意味は「**誰にいくら払ったか**」＝この記録そのもの。
 * 発生年月・支払期日より上にあるのは、金額が決まってから日付を埋めるためです
 * （理由の全文は `SgaDialog.tsx` の Row 2 のコメント）。
 *
 * ⚠️ **閲覧のみ（`readOnly`）で入力欄を個別に無効化しない。** `SgaDialog.tsx` が
 * 本文全体を `<fieldset disabled>` で包むので中の input/select は自然に無効化される。
 * ここで `readOnly` を受け取るのは、**仕入先マスタの検索を「出すか出さないか」**の
 * 判断だけのため（一覧を渡さずに開くので、出しても選べない）。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { TaxCategoryLabels, type Vendor } from '@/types';
import type { SgaFormData } from './SgaDialog';

export function SgaPayeeAmountFields({
  form, setForm, vendors, readOnly,
}: {
  form: SgaFormData;
  setForm: React.Dispatch<React.SetStateAction<SgaFormData>>;
  vendors: Vendor[];
  readOnly: boolean;
}) {
  return (
    <>
      {/* Row 1: 支払先（誰に払うか。この記録の起点なので先頭） */}
      <div className="space-y-1">
        <Label>支払先</Label>
        <Input
          value={form.vendor_name}
          onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
          placeholder="支払先名"
        />
        {/* 閲覧のみでは出さない（一覧を渡さずに開くため。上の Input が名前を持っている） */}
        {!readOnly && vendors.length > 0 && (
          <SearchableSelect
            className="mt-1"
            options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
            value={form.vendor_id}
            onChange={(val) => {
              const v = vendors.find((vn) => vn.id === val);
              setForm((f) => ({
                ...f,
                vendor_id: val,
                vendor_name: v?.name ?? f.vendor_name,
              }));
            }}
            placeholder="仕入先マスタから検索（任意）"
          />
        )}
      </div>

      {/* Row 2: 金額 ＋ 税区分。
          **段3（いつ）より上に置いている。** 販管費は「誰にいくら払ったか」が
          記録そのもので、発生年月・支払期日は金額が決まってから埋める欄だから
          （`_form-order.md` 1「段を外すときは理由を書く」）。
          税区分は金額の税の扱いを決めるので、対で読めるよう横に並べる。 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>金額</Label>
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <CurrencyInput
                value={form.amount}
                onChange={(v) =>
                  setForm((f) => ({ ...f, amount: v }))
                }
              />
            </div>
            <TaxHelperButton
              fieldLabel="販管費 金額"
              defaultIncludedAmount={form.amount}
              onResult={(v) => setForm((f) => ({ ...f, amount: v }))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>税区分</Label>
          <Select value={form.tax_category} onValueChange={(val) => setForm((f) => ({ ...f, tax_category: val }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* 画面ごとに <SelectItem> を並べると足した区分が漏れる。
                  実際ここだけ非課税が無く、販管費は非課税を選べなかった。 */}
              {(Object.keys(TaxCategoryLabels) as (keyof typeof TaxCategoryLabels)[]).map((k) => (
                <SelectItem key={k} value={k}>{TaxCategoryLabels[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
