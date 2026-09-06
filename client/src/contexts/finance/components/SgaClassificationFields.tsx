/**
 * 販管費の「分類（勘定科目・処理元・インボイス・担当者）と自由記述（詳細・備考）」
 * （⑤ 販管費のダイアログの中身）
 *
 * **`SgaDialog` から切り出したものです。JSX を1文字も変えずに移しています。**
 * 分けた理由は1ファイル400行の上限（`client/CLAUDE.md`）で、欄の作り直しでは
 * ありません。**この回で組み直した並び順もそのまま**です
 * （勘定科目 → 処理元 → インボイス・担当者 → 詳細・備考。着手前は自由記述の
 * ほうが上にあり、決まっている欄を埋める前に文章を書かされる並びだった）。
 *
 * まとまりの意味は「**この支払いをどう分類し、何と書き添えるか**」＝金額・日付が
 * 決まったあとに埋める後段の欄（`docs/design/v4/_form-order.md` 段5〜6）。
 *
 * ⚠️ **閲覧のみ（`readOnly`）は個別に配線しない。** `SgaDialog.tsx` が本文全体を
 * `<fieldset disabled>` で包むので、ここで扱う `<Select>`/`<Input>` は漏れなく無効化される。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import type { SgaFormData } from './SgaDialog';

export function SgaClassificationFields({
  form, setForm, users, accountTitles,
}: {
  form: SgaFormData;
  setForm: React.Dispatch<React.SetStateAction<SgaFormData>>;
  users: { id: string; name: string }[];
  /** 勘定科目のマスター（`GET /sga/account-titles`）。空なら欄を出さない */
  accountTitles: { id: string; name: string }[];
}) {
  return (
    <>
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

      {/* Row 6.5: source */}
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

      {/* Row 7: invoice + assigned_to */}
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
            placeholder="担当者を検索â¦"
          />
        </div>
      </div>

      {/* Row 8: 詳細 ＋ 備考。
          **自由記述はいちばん下にまとめる**（`_form-order.md` 段6）。
          着手前は勘定科目・処理元・インボイス・担当者がこの下に積まれていて、
          決まっている欄を埋める前に文章を書かされる並びだった。 */}
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
    </>
  );
}
