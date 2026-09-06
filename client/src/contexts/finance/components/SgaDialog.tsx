import { useMemo } from "react";
import {
  Vendor,
} from "@/types";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { SgaPayeeAmountFields } from "./SgaPayeeAmountFields";
import { SgaExpenseTypeFields } from "./SgaExpenseTypeFields";
import { SgaSettlementFields } from "./SgaSettlementFields";
import { SgaClassificationFields } from "./SgaClassificationFields";

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
  /** 仮（確定前の見込み）フラグ (migration 268)。ON の間は精算番号を入力できない */
  is_provisional: boolean;
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
  is_provisional: false,
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

// `formFromSga`（販管費の行→フォーム初期値）は `sgaPrefill.ts` へ切り出した
// （1ファイル400行の上限。`SgaListPage`/`BudgetDashboardPage` の両方が使う）

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
  /** 閲覧のみで開く（財務ダッシュボードの内訳から・仕様変更 #3）。`vendors`/`accountTitles` は空でよい */
  readOnly?: boolean;
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
  readOnly = false,
}: SgaDialogProps) {
  const billingKeyPreview = useMemo(
    () => generateBillingKeyPreview(form.recognition_date),
    [form.recognition_date]
  );

  const amortizeMonths = useMemo(
    () => countAmortizeMonths(form.amortize_start, form.amortize_end),
    [form.amortize_start, form.amortize_end]
  );

  /**
   * Enter キーで保存できるようにする（`docs/design/v4/_form-order.md` 4）。
   * **明細行を持たないフォームなので、入力中の Enter が誤送信になる心配が無い。**
   * 登録ボタンは `type="submit"` にして `onClick` を外してある（両方あると二重送信）。
   * ここのガードは登録ボタンの `disabled` と同じ条件をそのまま書いている。
   */
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly || !form.vendor_name || isSaving) return;
    onSubmit();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={readOnly ? "販管費の詳細" : (editingId ? "販管費編集" : "販管費 新規登録")}
      size="lg"
      onSubmit={handleFormSubmit}
      footer={
        readOnly ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>閉じる</Button>
          </div>
        ) : (
        <div className="flex flex-wrap gap-2 sm:justify-between">
          <div>
            {/* **削除できるのはここだけ。** 一覧の行にゴミ箱を並べると、
                隣の行を押して削除する事故が起きる（金額の記録なので戻せない） */}
            {editingId && onDelete && (
              <Button type="button" variant="destructive" disabled={isDeleting} onClick={() => onDelete(editingId)}>
                {isDeleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                削除
              </Button>
            )}
          </div>
          <div className="ml-auto flex gap-2">
          {/* ⚠️ 送信以外のボタンには必ず `type="button"` を付ける
              （`<form>` の中では既定が submit になり、押すと保存が走る） */}
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="submit"
            disabled={!form.vendor_name || isSaving}
          >
            {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editingId ? "更新" : "登録"}
          </Button>
          </div>
        </div>
        )
      }
    >
        {/* ⚠️ 個別に `disabled` を足さない — `<fieldset disabled>` が中の input/select/button を漏れなく無効化する */}
        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0 space-y-4">
          {/*
            並び順は `docs/design/v4/_form-order.md` の6段に沿って組み直した
            （着手前は 金額が下から4番目で、税区分・発生年月・支払期日・精算方法・
            精算番号・申請URL の全部より下にあった）。上から
            支払先 → 金額・税区分 → 種別/按分 → 発生年月・支払期日 →
            仮・精算 → 分類（勘定科目・処理元・インボイス・担当者）→ 自由記述。
          */}
          {/* Row 1・2: 支払先 → 金額・税区分 — 1ファイル400行の上限で別ファイルに分けている。
              **並び順はそのまま**（段3「いつ」より上に置いている理由は
              `SgaPayeeAmountFields.tsx` の冒頭） */}
          <SgaPayeeAmountFields form={form} setForm={setForm} vendors={vendors} readOnly={readOnly} />

          {/* Row 3: 種別と月按分 — 1ファイル400行の上限で別ファイルに分けている。
              **按分は金額を月数で割るので、材料になる金額の直後に置く。** */}
          <SgaExpenseTypeFields form={form} setForm={setForm} amortizeMonths={amortizeMonths} />

          {/* Row 4: recognition_date + billing_key preview */}
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

          {/* Row 5: 仮（確定前の見込み）→ 精算方法・精算番号・申請URL。
              **仮フラグは精算番号を入力不可にする**ので、`SgaExpenseTypeFields` から
              ここへ移して、効く相手の直上に置いた
              （`_form-order.md` 2-1「依存する欄は依存される欄より下」）。 */}
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sga-is-provisional" className="cursor-pointer">仮（確定前の見込み）</Label>
            <Switch
              id="sga-is-provisional"
              checked={form.is_provisional}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, is_provisional: !!checked }))}
            />
          </div>

          {/* 精算方法・精算番号・申請URL — 400行の上限で別ファイル */}
          <SgaSettlementFields form={form} setForm={setForm} />

          {/* Row 6〜8: 勘定科目・処理元・インボイス・担当者 → 詳細・備考 —
              1ファイル400行の上限で別ファイルに分けている。**並び順はそのまま**
              （自由記述を最後に置いた理由は `SgaClassificationFields.tsx` の冒頭） */}
          <SgaClassificationFields
            form={form}
            setForm={setForm}
            users={users}
            accountTitles={accountTitles}
          />
        </fieldset>
    </FormDialog>
  );
}
