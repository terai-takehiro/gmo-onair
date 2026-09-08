/**
 * 仕入の「仮（確定前の見込み）・精算方法・精算番号・申請URL」（④ 仕入のダイアログの中身）
 *
 * **`PurchaseDialog` から切り出したものです。JSX を1文字も変えずに移しています。**
 * 分けた理由は1ファイル400行の上限（`client/CLAUDE.md`）で、欄の作り直しでは
 * ありません。**この回で組み直した並び順もそのまま**です
 * （仮 → 精算方法・精算番号 → 申請URL）。
 *
 * まとまりの意味は「**社内の手続き（精算）がどこまで進んだか**」。
 * 仮フラグを先頭に置いているのは、**仮フラグが精算番号を入力不可にする**ためで、
 * 効かせる相手の直上に置く決めごと（`docs/design/v4/_form-order.md` 2-1・3-4）に沿う。
 * 販管費側の同じまとまり（`components/SgaSettlementFields.tsx`）と対になる部品。
 *
 * ⚠️ `readOnly`（案件詳細から閲覧だけで開く）は親と同じく `disabled` で受ける
 * （販管費と違い、こちらは `<fieldset disabled>` で包んでいないため個別に配線する）。
 */
import { ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SettlementMethodLabels, type SettlementMethod } from '@/types';

export function PurchaseSettlementFields({
  isProvisional, setIsProvisional,
  settlementMethod, setSettlementMethod,
  settlementNumber, setSettlementNumber,
  settlementUrl, setSettlementUrl,
  readOnly,
}: {
  isProvisional: boolean;
  setIsProvisional: (v: boolean) => void;
  settlementMethod: string;
  setSettlementMethod: (v: string) => void;
  settlementNumber: string;
  setSettlementNumber: (v: string) => void;
  settlementUrl: string;
  setSettlementUrl: (v: string) => void;
  readOnly: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="is-provisional" className="cursor-pointer">仮（確定前の見込み仕入）</Label>
        <Switch id="is-provisional" checked={isProvisional} onCheckedChange={(v) => setIsProvisional(!!v)} disabled={readOnly} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>精算方法</Label>
          <Select value={settlementMethod} onValueChange={setSettlementMethod} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map((key) => (
                <SelectItem key={key} value={key}>{SettlementMethodLabels[key]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>精算番号</Label>
          {/* 仮フラグ ON の間は入力不可。まだ確定していない金額に精算番号だけ
              先に入る、という矛盾した状態を避ける（仕様変更 #4・#6・#7） */}
          <Input
            value={settlementNumber}
            onChange={(e) => setSettlementNumber(e.target.value)}
            placeholder={isProvisional ? '仮の間は入力できません' : undefined}
            disabled={readOnly || isProvisional}
          />
        </div>
      </div>

      <div>
        <Label>申請URL</Label>
        <Input
          type="url"
          value={settlementUrl}
          onChange={(e) => setSettlementUrl(e.target.value)}
          placeholder="精算申請ページのURL"
          disabled={readOnly}
        />
        {settlementUrl && (
          <a
            href={settlementUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sub mt-1 inline-flex min-h-tap items-center gap-1.5 text-primary hover:underline lg:min-h-[28px]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />精算ページを開く
          </a>
        )}
      </div>
    </>
  );
}
