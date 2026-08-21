import { useMemo } from "react";
import {
  Vendor,
} from "@/types";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { TaxHelperButton } from "@gmo-onair/shared/src/client/ui/tax-aware-amount-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2 } from "lucide-react";
import { SgaExpenseTypeFields } from "./SgaExpenseTypeFields";
import { SgaSettlementFields } from "./SgaSettlementFields";
import { TaxCategoryLabels } from "@/types";

export interface SgaFormData {
  vendor_name: string;
  vendor_id: string;
  tax_category: string;
  recognition_date: string;
  settlement_method: string;
  settlement_number: string;
  settlement_number_pending: boolean;
  settlement_url: string;
  amount: number;
  description: string;
  notes: string;
  invoice_qualified: boolean;
  payment_due_date: string;
  assigned_to: string;
  expense_type: 'fixed' | 'spot';
  /** 勘定科目 (migration 166)。空 = 未設定 */
  account_title_id: string;
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
  settlement_url: "",
  amount: 0,
  description: "",
  notes: "",
  invoice_qualified: true,
  payment_due_date: "",
  assigned_to: "",
  expense_type: "spot",
  account_title_id: "",
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
  if (!number || number === "pending") return "";
  if (method === "xpoint") return `X-${number}`;
  if (method === "rakuraku") return `楽-${number}`;
  return number;
}

export function SettlementBadge({ number }: { number: string | null | undefined }) {
  const isApplied = !!number && number !== "pending";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
      isApplied ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
    }`}>
      {isApplied ? '申請済' : '未申請'}
    </span>
  );
}

interface SgaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: SgaFormData;
  setForm: React.Dispatch<React.SetStateAction<SgaFormData>>;
  vendors: Vendor[];
  users: { id: string; name: string }[];
  /** 勘定科目のマスター (`GET /sga/account-titles`)。空なら欄を出さない */
  accountTitles?: { id: string; name: string }[];
  isSaving: boolean;
  /** 消している最中か。**編集のときだけ「消す」を出す** */
  isDeleting?: boolean;
  onSubmit: () => void;
  /** 消す。渡さなければボタンを出さない */
  onDelete?: (id: string) => void;
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
  accountTitles = [],
  isSaving,
  isDeleting = false,
  onSubmit,
  onDelete,
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? "販管費編集" : "販管費 新規登録"}
      footer={
        <div className="flex flex-wrap gap-2 sm:justify-between">
          <div>
            {/* **消すのはここだけ。** 一覧の行にゴミ箱を並べると、
                隣の行を押して消す事故が起きる（金額の記録なので戻せない） */}
            {editingId && onDelete && (
              <Button variant="destructive" disabled={isDeleting} onClick={() => onDelete(editingId)}>
                {isDeleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                消す
              </Button>
            )}
          </div>
          <div className="ml-auto flex gap-2">
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
      }
    >
        <div className="space-y-4">
          {/* Row 1: vendor + tax */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {/* 画面ごとに <SelectItem> を並べると足した区分が漏れる。
                      実際ここだけ非課税が無く、販管費は非課税を選べなかった。 */}
                  {(Object.keys(TaxCategoryLabels) as (keyof typeof TaxCategoryLabels)[]).map((k) => (
                    <SelectItem key={k} value={k}>{TaxCategoryLabels[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: recognition_date + billing_key preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* Row 3: 精算方法・精算番号・申請URL — 400行の上限で別ファイル */}
          <SgaSettlementFields form={form} setForm={setForm} />

          {/* Row 4: amount */}
          <div className="space-y-1">
            <Label>金額</Label>
            <div className="flex items-center gap-1 max-w-xs">
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

          {/* Row 4.5: 種別と月按分 — 1ファイル400行の上限で別ファイルに分けている */}
          <SgaExpenseTypeFields form={form} setForm={setForm} amortizeMonths={amortizeMonths} />

          {/* Row 5: description + notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* 勘定科目 (migration 166)。**マスターが空なら欄ごと出さない** —
              選べない Select を置いても押した人が困るだけ */}
          {accountTitles.length > 0 && (
            <div className="space-y-1">
              <Label>勘定科目</Label>
              <Select
                value={form.account_title_id || 'none'}
                onValueChange={(val) => setForm((f) => ({ ...f, account_title_id: val === 'none' ? '' : val }))}
              >
                <SelectTrigger><SelectValue placeholder="選んでください" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未設定</SelectItem>
                  {accountTitles.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
    </FormDialog>
  );
}
