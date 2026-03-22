import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import {
  Vendor,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2 } from "lucide-react";

export interface SgaFormData {
  vendor_name: string;
  vendor_id: string;
  tax_category: string;
  recognition_date: string;
  settlement_method: string;
  settlement_number: string;
  settlement_number_pending: boolean;
  amount: number;
  description: string;
  notes: string;
  invoice_qualified: boolean;
  payment_due_date: string;
  assigned_to: string;
  expense_type: 'fixed' | 'spot';
  amortize_enabled: boolean;
  amortize_start: string;
  amortize_end: string;
  source: 'staff' | 'accounting';
}

export const initialFormData: SgaFormData = {
  vendor_name: "",
  vendor_id: "",
  tax_category: "tax10",
  recognition_date: "",
  settlement_method: "xpoint",
  settlement_number: "",
  settlement_number_pending: false,
  amount: 0,
  description: "",
  notes: "",
  invoice_qualified: true,
  payment_due_date: "",
  assigned_to: "",
  expense_type: "spot",
  amortize_enabled: false,
  amortize_start: "",
  amortize_end: "",
  source: "staff",
};

function countAmortizeMonths(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm) + 1;
}

function generateBillingKeyPreview(recognitionDate: string): string {
  if (!recognitionDate) return "";
  const d = new Date(recognitionDate);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(new Date(y, d.getMonth() + 1, 0).getDate()).padStart(2, "0");
  return `${y}${m}${day}-1`;
}

export function formatSettlementNo(method: string, number: string): string {
  if (!number || number === "pending") return "未定";
  if (method === "xpoint") return `X-${number}`;
  if (method === "rakuraku") return `楽-${number}`;
  return number;
}

interface SgaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: SgaFormData;
  setForm: React.Dispatch<React.SetStateAction<SgaFormData>>;
  vendors: Vendor[];
  users: { id: string; name: string }[];
  isSaving: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export default function SgaDialog({
  open,
  onOpenChange,
  editingId,
  form,
  setForm,
  vendors,
  users,
  isSaving,
  onSubmit,
  onClose,
}: SgaDialogProps) {
  const billingKeyPreview = useMemo(
    () => generateBillingKeyPreview(form.recognition_date),
    [form.recognition_date]
  );

  const amortizeMonths = useMemo(
    () => countAmortizeMonths(form.amortize_start, form.amortize_end),
    [form.amortize_start, form.amortize_end]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "販管費編集" : "販管費 新規登録"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Row 1: vendor + tax */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>支払先</Label>
              <Input
                value={form.vendor_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vendor_name: e.target.value }))
                }
                placeholder="支払先名"
              />
              {vendors.length > 0 && (
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
            <div className="space-y-1">
              <Label>税区分</Label>
              <Select
                value={form.tax_category}
                onValueChange={(val) =>
                  setForm((f) => ({ ...f, tax_category: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax10">10%課税</SelectItem>
                  <SelectItem value="tax8">8%課税(軽減)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: recognition_date + billing_key preview */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>発生年月</Label>
              <Input
                type="date"
                value={form.recognition_date}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    recognition_date: e.target.value,
                  }))
                }
              />
              {billingKeyPreview && (
                <p className="text-xs text-muted-foreground">
                  KEY: {billingKeyPreview}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>支払期日</Label>
              <Input
                type="date"
                value={form.payment_due_date}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    payment_due_date: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          {/* Row 3: settlement */}
          <div className="grid grid-cols-2 gap-4">
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
              <Label>精算番号</Label>
              <div className="flex items-center gap-2 mb-1">
                <Checkbox
                  checked={form.settlement_number_pending}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      settlement_number_pending: !!checked,
                      settlement_number: checked ? "" : f.settlement_number,
                    }))
                  }
                />
                <span className="text-sm text-muted-foreground">未定</span>
              </div>
              <Input
                type="number"
                disabled={form.settlement_number_pending}
                value={form.settlement_number}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    settlement_number: e.target.value,
                  }))
                }
                placeholder="精算番号"
              />
              {(form.settlement_number || form.settlement_number_pending) && (
                <p className="text-xs text-muted-foreground">
                  表示:{" "}
                  {formatSettlementNo(
                    form.settlement_method,
                    form.settlement_number_pending
                      ? "pending"
                      : form.settlement_number
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Row 4: amount */}
          <div className="space-y-1">
            <Label>金額</Label>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ¥
              </span>
              <Input
                type="number"
                min={0}
                className="pl-7"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          {/* Row 4.5: expense_type + amortization */}
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
                <div className="flex items-center gap-2">
                  <Checkbox
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
                  <span className="text-sm">月按分する</span>
                </div>
                {form.amortize_enabled && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
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
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(form.amount)} ÷ {amortizeMonths}ヶ月 ={" "}
                        {formatCurrency(Math.floor(form.amount / amortizeMonths))}/月
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Row 5: description + notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>詳細</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="詳細"
              />
            </div>
            <div className="space-y-1">
              <Label>備考</Label>
              <Input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="備考"
              />
            </div>
          </div>

          {/* Row 5.5: source */}
          <div className="space-y-1">
            <Label>処理元</Label>
            <Select value={form.source} onValueChange={(val) => setForm(f => ({ ...f, source: val as 'staff' | 'accounting' }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="staff">スタッフ入力</SelectItem>
                <SelectItem value="accounting">経理入力</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Row 6: invoice + assigned_to */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>インボイス</Label>
              <Select
                value={form.invoice_qualified ? "qualified" : "unqualified"}
                onValueChange={(val) =>
                  setForm((f) => ({
                    ...f,
                    invoice_qualified: val === "qualified",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">適格事業者</SelectItem>
                  <SelectItem value="unqualified">非適格事業者</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>担当者</Label>
              <SearchableSelect
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                value={form.assigned_to}
                onChange={(val) =>
                  setForm((f) => ({ ...f, assigned_to: val }))
                }
                placeholder="担当者を検索..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button
              disabled={!form.vendor_name || isSaving}
              onClick={onSubmit}
            >
              {isSaving && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              {editingId ? "更新" : "登録"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
