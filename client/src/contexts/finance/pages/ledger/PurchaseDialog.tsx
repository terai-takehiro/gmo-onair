/**
 * 仕入の登録・編集ダイアログ（④ 仕入）
 *
 * **旧 `PurchaseListPage` から切り出したものです。入力欄も送る値も変えていません。**
 * 一覧の作り直しと、金額を扱うフォームの作り直しを同じ回でやらないためです。
 *
 * 変えたのは3点だけ:
 * ・削除の確認を `window.confirm` から共通の確認ダイアログに変えた
 *   （`check-ui-tokens` が `window.confirm` を止めます。文面も「何が消えるか」を出す形に）
 * ・生の色指定を同じ意味のトークンに置き換えた
 * ・**欄の並び順**を `docs/design/v4/_form-order.md` の6段に沿って組み直した
 *   （欄そのものと送る値は変えていません。理由は本文中のコメント）
 *
 * 日付（`PurchaseDateFields.tsx`）と精算（`PurchaseSettlementFields.tsx`）は
 * **1ファイル400行の上限で別ファイルに出しています**（JSX はそのまま・state は
 * ここが持ったまま props で渡すだけ）。
 *
 * ── `readOnly`（案件詳細「見積・請求」から閲覧だけで開くため） ─────
 *
 * 案件詳細の「見積・請求」タブ（`RevenueBillingPane.tsx`）は**読むだけ**の画面
 * （冒頭のコメント参照）。仕入行を押しても編集・削除ができてしまうと、その方針が
 * 崩れるので、ここに `readOnly` を追加した。渡すと:
 * ・見出しが「仕入の詳細」になり、フッターは「閉じる」だけ
 * ・入力欄はすべて `disabled`（フォームの形はそのまま流用し、別に閲覧専用の
 *   表示を作ると2つのレイアウトを保守することになるため）。**案件・仕入先の
 *   2つだけは例外**——この2つは `SearchableSelect` で選べる一覧（`projects`/
 *   `vendors`）が要るが、閲覧だけなら一覧を引く理由が無いので、素の文字で出す
 *   （下の `ReadOnlyField` 参照）
 * ・保存・削除の口（`onSave`/`onDelete`）は呼ばれない（渡さなくてよい）。
 *   `projects`/`vendors` も渡さなくてよい（空配列で足りる）
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  TaxCategoryLabels,
  type TaxCategory, type Vendor,
} from '@/types';
import type { PurchaseRow } from './types';
import { toServiceDateInput } from './serviceDate';
import { PurchaseDateFields } from './PurchaseDateFields';
import { PurchaseSettlementFields } from './PurchaseSettlementFields';

export interface PurchaseProjectOption {
  id: string;
  /** 受注確定済みでも案件分類未設定の古いデータでは空のことがある（v4.1.8） */
  gls_number: string | null;
  name: string;
}

/**
 * `readOnly` のときの「案件」「仕入先」欄。
 *
 * この2つだけは `SearchableSelect` を使わない。**選べる一覧（`projects`/`vendors`）を
 * 渡さずに開く**ため（案件詳細から閲覧だけで開くとき、受注済み案件の全件・
 * 仕入先の全件を毎回引き直す理由が無い — `PurchaseListPage.tsx` の追加フォームと
 * 違い、行はすでに1件分の名前を持っている）。一覧が空だと `SearchableSelect` は
 * 「選ばれている」と気づけず placeholder のままになるので、素の文字で出す。
 */
function ReadOnlyField({ children }: { children: ReactNode }) {
  return (
    <p className="min-h-tap flex h-11 w-full items-center rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground lg:h-10 lg:min-h-0">
      {children}
    </p>
  );
}

export function PurchaseDialog({
  editing, defaultProjectId, projects = [], vendors = [], users = [], currentUserId, saving = false, deleting = false, onSave, onDelete, onClose, readOnly = false,
}: {
  editing: PurchaseRow | null;
  /** 案件で絞り込んで見ているときの初期値 */
  defaultProjectId: string;
  /** `readOnly` のときは使わない（渡さなくてよい） */
  projects?: PurchaseProjectOption[];
  /** `readOnly` のときは使わない（渡さなくてよい） */
  vendors?: Vendor[];
  /** 担当者の候補一覧（`SgaDialog` と同じ形）。`readOnly` のときは使わない（渡さなくてよい） */
  users?: { id: string; name: string }[];
  /** 新規登録のときの担当者の初期値（ログインユーザー。`SgaListPage` と同じ挙動） */
  currentUserId?: string;
  saving?: boolean;
  deleting?: boolean;
  onSave?: (payload: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  /** 閲覧のみで開く（保存・削除ボタンを出さず、全欄を disabled にする） */
  readOnly?: boolean;
}) {
  // **判定は1回だけ**（部品の中で早期 return しない — 幅が変わるとフック数が変わって React が落ちる）
  const isMobile = useIsMobile();
  const [selectedProjectId, setSelectedProjectId] = useState(editing?.project_id || defaultProjectId || '');
  const [vendorId, setVendorId] = useState(editing?.vendor_id || '');
  const [taxCategory, setTaxCategory] = useState(editing?.tax_category || 'tax10');
  const [settlementMethod, setSettlementMethod] = useState(editing?.settlement_method || 'rakuraku');
  const [settlementNumber, setSettlementNumber] = useState(
    editing?.settlement_number && editing.settlement_number !== 'pending' ? editing.settlement_number : '',
  );
  const [settlementUrl, setSettlementUrl] = useState(editing?.settlement_url || '');
  const [invoiceQualified, setInvoiceQualified] = useState(editing?.invoice_qualified ? 'qualified' : 'unqualified');
  const [amount, setAmount] = useState<number>(editing?.amount || 0);
  const [description, setDescription] = useState(editing?.description || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  /*
   * ⚠️ **`editing` から必ず読み戻す。** ここだけ `useState('')` と書かれており、
   * **編集で開き直すと必ず空欄**になっていた（ユーザー報告「役務提供完了日を入力し、
   * 更新・登録しても保存されない」）。実際には保存されていて、開き直した空欄のまま
   * 「更新」を押すと `service_completed_date: null` が飛んで**本当に消えて**いた
   * （親が `key={editingItem?.id}` で毎回マウントし直すので、後から埋まる余地も無い）。
   * `DATE` 型ゆえの形の違いは `toServiceDateInput()` が吸収する。
   */
  const [serviceCompletedDate, setServiceCompletedDate] = useState(
    toServiceDateInput(editing?.service_completed_date),
  );
  const [recognitionMonth, setRecognitionMonth] = useState(editing?.recognition_date?.slice(0, 7) || '');
  const [paymentDueDate, setPaymentDueDate] = useState(editing?.payment_due_date?.slice(0, 10) || '');
  const [isProvisional, setIsProvisional] = useState(!!editing?.is_provisional);
  // 新規登録のときはログインユーザーを初期選択（`SgaListPage` の `openFor` と同じ挙動）
  const [assignedTo, setAssignedTo] = useState(editing?.assigned_to || (!editing ? currentUserId : '') || '');

  // 新規のとき、案件で絞り込んでいればその案件を初期値にする
  useEffect(() => {
    if (!editing && defaultProjectId) setSelectedProjectId(defaultProjectId);
  }, [editing, defaultProjectId]);

  const handleDelete = async () => {
    if (!editing || !onDelete) return;
    const ok = await confirmAction({
      title: 'この仕入を削除しますか',
      description: `${editing.vendor_name ?? '仕入先なし'}「${editing.description ?? '説明なし'}」を削除します。元に戻せません。`,
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) onDelete(editing.id);
  };

  const handleSubmit = () => {
    if (!selectedProjectId || !vendorId || !onSave) return;
    onSave({
      project_id: selectedProjectId,
      vendor_id: vendorId,
      tax_category: taxCategory,
      settlement_method: settlementMethod,
      settlement_number: settlementNumber || null,
      settlement_url: settlementUrl || null,
      invoice_qualified: invoiceQualified === 'qualified' ? 1 : 0,
      amount,
      description: description || null,
      notes: notes || null,
      service_completed_date: serviceCompletedDate || null,
      recognition_date: recognitionMonth ? `${recognitionMonth}-01` : null,
      payment_due_date: paymentDueDate || null,
      is_provisional: isProvisional,
      assigned_to: assignedTo || null,
    });
  };

  /**
   * Enter キーで保存できるようにする（`docs/design/v4/_form-order.md` 4）。
   * **明細行を持たないフォームなので、入力中の Enter が誤送信になる心配が無い。**
   * 登録ボタンは `type="submit"` にして `onClick` を外してある（両方あると二重送信）。
   * 案件・仕入先の未選択は `handleSubmit` 自身が弾くので、ここでは保存中だけ足す。
   */
  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (readOnly || saving) return;
    handleSubmit();
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={readOnly ? '仕入の詳細' : (editing ? '仕入を編集' : '仕入を登録')}
      size="lg"
      onSubmit={handleFormSubmit}
      footer={
        readOnly ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>閉じる</Button>
          </div>
        ) : (
          <div className="flex gap-2 sm:justify-between">
            <div>
              {/*
                **消すはスマホに出さない**（`RevenueDialog.tsx` と同じ扱い）。
                取り消せない操作を指で押させないのがこのリポジトリの方針で、
                `pcOnlyScreens.ts` の「スマホでは消せない」という記述もこれが前提。
                ⚠️ ボタンだけ隠して `onDelete` を渡さない形にすると、押しても何も
                起きない死んだボタンになる。**描かないこと自体で守る。**
              */}
              {editing && !isMobile && (
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                  削除
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {/* ⚠️ 送信以外のボタンには必ず `type="button"` を付ける
                  （`<form>` の中では既定が submit になり、押すと保存が走る） */}
              <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
              <Button type="submit" disabled={!selectedProjectId || !vendorId || saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {editing ? '更新' : '登録'}
              </Button>
            </div>
          </div>
        )
      }
    >
        <div className="space-y-4">
          {/*
            並び順は `docs/design/v4/_form-order.md` の6段に沿って組み直した。上から
            案件・仕入先（どれに付けるか）→ 説明（何の仕入か）→ 担当者（誰が）→
            金額・税区分/インボイス（いくら）→ 日付 → 仮・精算（手続き）→ 備考。
            **税区分はインボイスと同じ行**（どちらも「この仕入の税の扱い」）、
            **精算方法は精算番号と同じ行**（着手前は税区分と並び、精算番号とは
            日付ブロックで分断されていた）。
          */}
          <div>
            <Label>案件 *</Label>
            {readOnly ? (
              <ReadOnlyField>
                {editing?.gls_number ? `${editing.gls_number} ` : ''}{editing?.project_name || '（案件なし）'}
              </ReadOnlyField>
            ) : (
              <>
                <SearchableSelect
                  options={projects.map((p) => ({ value: p.id, label: `${p.gls_number || 'GLS未発番'} ${p.name}` }))}
                  value={selectedProjectId}
                  onChange={setSelectedProjectId}
                  placeholder="管理番号・案件名で検索â¦"
                />
                <p className="text-note mt-1 text-muted-foreground">
                  受注（A 受注済）以降の案件だけが選べます。
                  複数案件への按分は「按分グループ」から登録してください
                </p>
              </>
            )}
          </div>

          <div>
            <Label>仕入先 *</Label>
            {readOnly ? (
              <ReadOnlyField>{editing?.vendor_name || '（仕入先なし）'}</ReadOnlyField>
            ) : (
              <SearchableSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
                value={vendorId}
                onChange={setVendorId}
                placeholder="仕入先を検索â¦"
              />
            )}
          </div>

          {/* 説明は「何の仕入か」＝一覧の見出しになる欄なので、案件・仕入先のすぐ下に置く */}
          <div>
            <Label>説明</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="仕入の説明"
              rows={3}
              disabled={readOnly}
            />
          </div>

          {/* 担当者は「誰が抱えている仕入か」。着手前は下から2番目で、
              備考の直前まで下りないと出てこなかった（`_form-order.md` 段4） */}
          <div>
            <Label>担当者</Label>
            {/* `readOnly` のときは案件・仕入先と同じ扱いで素の文字にするが、担当者だけは
                `users` 一覧を引かなくても出せる ——サーバーが `assigned_to_name` を
                JOIN 済みで返すため（`users` を渡し忘れても生の UUID が漏れない。レビュー指摘）。
                存在しない・削除済みユーザーを指していれば「削除済みのユーザー」にする */}
            {readOnly ? (
              <ReadOnlyField>
                {editing?.assigned_to_name || (editing?.assigned_to ? '（削除済みのユーザー）' : '（担当者なし）')}
              </ReadOnlyField>
            ) : (
              <SearchableSelect
                options={users.map((u) => ({ value: u.id, label: u.name }))}
                value={assignedTo}
                onChange={setAssignedTo}
                placeholder="担当者を検索â¦"
              />
            )}
          </div>

          <div>
            <Label>金額</Label>
            <div className="flex items-center gap-1">
              <div className="flex-1"><CurrencyInput value={amount} onChange={setAmount} disabled={readOnly} /></div>
              <TaxHelperButton fieldLabel="仕入金額" defaultIncludedAmount={amount} onResult={setAmount} disabled={readOnly} />
            </div>
          </div>

          {/* 税区分とインボイスは対で読む（どちらも「この金額の税の扱い」）。
              精算方法は精算の欄へ移したので、ここは金額の直後にまとまる */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>税区分</Label>
              <Select value={taxCategory} onValueChange={setTaxCategory} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                    <SelectItem key={key} value={key}>{TaxCategoryLabels[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>インボイス</Label>
              <Select value={invoiceQualified} onValueChange={setInvoiceQualified} disabled={readOnly}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">適格事業者</SelectItem>
                  <SelectItem value="unqualified">非適格事業者</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 役務提供完了日・計上月・支払予定日 — 400行の上限で別ファイル。
              3つが連動する（役務提供完了日から他2つを埋める）ので1つの塊のまま移した */}
          <PurchaseDateFields
            serviceCompletedDate={serviceCompletedDate}
            setServiceCompletedDate={setServiceCompletedDate}
            recognitionMonth={recognitionMonth}
            setRecognitionMonth={setRecognitionMonth}
            paymentDueDate={paymentDueDate}
            setPaymentDueDate={setPaymentDueDate}
            readOnly={readOnly}
          />

          {/* 仮 → 精算方法・精算番号・申請URL の順にまとめた（400行の上限で別ファイル）。
              **仮フラグは精算番号を入力不可にする**ので、効く相手の直上へ移した
              （着手前は説明と税区分の間にあり、効く先まで4ブロック離れていた）。
              精算方法も精算番号と同じ行へ寄せている（`_form-order.md` 2-1・3-4） */}
          <PurchaseSettlementFields
            isProvisional={isProvisional}
            setIsProvisional={setIsProvisional}
            settlementMethod={settlementMethod}
            setSettlementMethod={setSettlementMethod}
            settlementNumber={settlementNumber}
            setSettlementNumber={setSettlementNumber}
            settlementUrl={settlementUrl}
            setSettlementUrl={setSettlementUrl}
            readOnly={readOnly}
          />

          <div>
            <Label>備考</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="任意" rows={2} disabled={readOnly} />
          </div>
        </div>
    </FormDialog>
  );
}
