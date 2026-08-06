/**
 * 販管費の「精算方法・精算番号・申請URL」（⑤ 販管費のダイアログの中身）
 *
 * **`SgaDialog` から切り出したものです。動きは変えていません。**
 * 分けた理由は1ファイル400行の上限で、中身の作り直しではありません。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { SettlementBadge, formatSettlementNo, type SgaFormData } from './SgaDialog';

export function SgaSettlementFields({
  form, setForm,
}: {
  form: SgaFormData;
  setForm: React.Dispatch<React.SetStateAction<SgaFormData>>;
}) {
  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1">
        <Label>精算方法</Label>
        <Select
          value={form.settlement_method}
          onValueChange={(val) =>
            setForm((f) => ({ ...f, settlement_method: val }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="xpoint">X-Point</SelectItem>
            <SelectItem value="rakuraku">楽楽精算</SelectItem>
            <SelectItem value="other">その他</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label>精算番号</Label>
          <SettlementBadge number={form.settlement_number} />
        </div>
        <Input
          value={form.settlement_number}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              settlement_number: e.target.value,
            }))
          }
          placeholder="申請後に番号を入力（任意）"
        />
        {form.settlement_number && (
          <p className="text-xs text-muted-foreground">
            表示: {formatSettlementNo(form.settlement_method, form.settlement_number)}
          </p>
        )}
      </div>
    </div>

    {/* Row 3.5: 申請URL */}
    <div className="space-y-1">
      <Label>申請URL</Label>
      <Input
        type="url"
        value={form.settlement_url}
        onChange={(e) =>
          setForm((f) => ({ ...f, settlement_url: e.target.value }))
        }
        placeholder="精算申請ページのURL（任意）"
      />
    </div>
    </>
  );
}
