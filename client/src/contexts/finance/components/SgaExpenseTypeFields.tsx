/**
 * 販管費の「種別と月按分」（⑤ 販管費のダイアログの中身）
 *
 * **`SgaDialog` から切り出したものです。動きは変えていません。**
 * 分けた理由は1ファイル400行の上限で、中身の作り直しではありません。
 *
 * 固定(毎月)を選ぶと按分の入力を閉じます。固定費は毎月同額で計上するので、
 * 期間で割る按分と両方が効くと二重に分けたことになります。
 */
import { formatCurrency } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { SgaFormData } from './SgaDialog';

export function SgaExpenseTypeFields({
  form, setForm, amortizeMonths,
}: {
  form: SgaFormData;
  setForm: React.Dispatch<React.SetStateAction<SgaFormData>>;
  amortizeMonths: number;
}) {
  return (
    <div className="space-y-2">
      <Label>販管費種別</Label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="expense_type"
            checked={form.expense_type === "spot"}
            onChange={() =>
              setForm((f) => ({ ...f, expense_type: "spot" }))
            }
            className="accent-primary"
          />
          <span className="text-sm">スポット</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="expense_type"
            checked={form.expense_type === "fixed"}
            onChange={() =>
              setForm((f) => ({
                ...f,
                expense_type: "fixed",
                amortize_enabled: false,
                amortize_start: "",
                amortize_end: "",
              }))
            }
            className="accent-primary"
          />
          <span className="text-sm">固定(毎月)</span>
        </label>
      </div>

      {form.expense_type === "spot" && (
        <div className="ml-2 space-y-2 border-l-2 border-muted pl-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">月按分する</span>
            <Switch
              checked={form.amortize_enabled}
              onCheckedChange={(checked) =>
                setForm((f) => ({
                  ...f,
                  amortize_enabled: !!checked,
                  amortize_start: checked ? f.amortize_start : "",
                  amortize_end: checked ? f.amortize_end : "",
                }))
              }
            />
          </div>
          {form.amortize_enabled && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">按分開始月</Label>
                  <Input
                    type="month"
                    value={form.amortize_start}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        amortize_start: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">按分終了月</Label>
                  <Input
                    type="month"
                    value={form.amortize_end}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        amortize_end: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              {form.amount > 0 && amortizeMonths > 0 && (
                <p className="text-sm text-muted-foreground font-number">
                  {formatCurrency(form.amount)} ÷ {amortizeMonths}ヶ月 ={" "}
                  {formatCurrency(Math.floor(form.amount / amortizeMonths))}/月
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
