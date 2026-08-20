/**
 * セキュリティカード — 貸す / 返す ダイアログ (v4)
 *
 * 貸出と返却を1つのファイルに置いてあるのは、**同じ1枚のカードの表と裏**で、
 * 別々に直すと片方だけ書式が変わるため (実際に旧実装は貸出だけ日付が2つ、
 * 返却は1つで、日付欄の並びがそろっていなかった)。
 *
 * v4 で変えたのは、失敗の伝え方。以前はダイアログの中に赤い1行を出していたが、
 * **実行ボタンより下**にあったので、スクロールしていると見えなかった。
 * お知らせ帯 (`notifyApiError`) に出す。
 */
import { useState } from 'react';
import { ArrowRightLeft, Loader2, Undo2 } from 'lucide-react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/hooks/useAuth';
import {
  useLendCard, useOnairUsers, useReturnCard, todayStr, type LendInput, type SecurityCard,
} from '@/lib/securityCardApi';

const TEXTAREA = 'text-sub mt-1 w-full resize-y rounded-control border border-border bg-background px-3 py-2';

export function LendDialog({ card, onClose }: { card: SecurityCard; onClose: () => void }) {
  const { currentUser } = useAuth();
  const users = useOnairUsers();
  const lend = useLendCard();
  const [company, setCompany] = useState('');
  const [person, setPerson] = useState('');
  const [contact, setContact] = useState('');
  const [purpose, setPurpose] = useState('');
  const [lentOn, setLentOn] = useState(todayStr());
  const [dueOn, setDueOn] = useState('');
  const [handlerId, setHandlerId] = useState(currentUser?.id ?? '');
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!person.trim()) {
      notifyApiError('貸し出せませんでした', null, '貸出先の担当者を入れてください（誰に渡したか分からなくなります）。');
      return;
    }
    const handler = users.data?.find((u) => u.id === handlerId);
    const input: LendInput = {
      borrower_person: person.trim(),
      borrower_company: company.trim() || null,
      borrower_contact: contact.trim() || null,
      purpose: purpose.trim() || null,
      lent_on: lentOn || todayStr(),
      due_on: dueOn || null,
      lent_by_user_id: handlerId || currentUser?.id || null,
      lent_by_name: handler?.name ?? currentUser?.name ?? null,
      notes: notes.trim() || null,
    };
    lend.mutate({ id: card.id, input }, {
      onSuccess: () => { notifySuccess(`No.${card.card_no} を貸し出しました`); onClose(); },
      onError: (e) => notifyApiError('貸し出せませんでした', e),
    });
  };

  return (
    <Shell
      title={`No.${card.card_no}・${card.level_label} を貸す`}
      onClose={onClose}
      footer={
        <FormDialogFooter>
          <Button variant="outline" className="min-h-tap" onClick={onClose}>やめる</Button>
          <Button className="min-h-tap gap-1.5" onClick={submit} disabled={lend.isPending}>
            {lend.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />}
            貸し出す
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="貸出先の会社" value={company} onChange={setCompany} placeholder="例：株式会社〇〇" />
        <Field label="担当者" required value={person} onChange={setPerson} placeholder="例：山田 太郎" />
        <Field label="連絡先" value={contact} onChange={setContact} placeholder="電話 / メール" />
        <Field label="使いみち" value={purpose} onChange={setPurpose} placeholder="例：収録の立ち会い" />
        <Field label="貸した日" type="date" value={lentOn} onChange={setLentOn} />
        <Field label="返してもらう日" type="date" value={dueOn} onChange={setDueOn} />
        <div className="sm:col-span-2">
          <Label htmlFor="lend-handler">渡した人（ONAiR のメンバー）</Label>
          <select
            id="lend-handler"
            value={handlerId}
            onChange={(e) => setHandlerId(e.target.value)}
            className="text-sub min-h-tap mt-1 w-full rounded-control border border-border bg-background px-3 lg:min-h-[40px]"
          >
            {!currentUser && <option value="">選んでください</option>}
            {users.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="lend-notes">メモ</Label>
          <textarea id="lend-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={TEXTAREA} placeholder="任意" />
        </div>
      </div>
    </Shell>
  );
}

export function ReturnDialog({ card, onClose }: { card: SecurityCard; onClose: () => void }) {
  const ret = useReturnCard();
  const [returnedOn, setReturnedOn] = useState(todayStr());
  const [notes, setNotes] = useState('');

  const submit = () => {
    ret.mutate({ id: card.id, input: { returned_on: returnedOn || todayStr(), notes: notes.trim() || null } }, {
      onSuccess: () => { notifySuccess(`No.${card.card_no} を返却しました`); onClose(); },
      onError: (e) => notifyApiError('返却できませんでした', e),
    });
  };

  return (
    <Shell
      title={`No.${card.card_no}・${card.level_label} を返してもらう`}
      onClose={onClose}
      footer={
        <FormDialogFooter>
          <Button variant="outline" className="min-h-tap" onClick={onClose}>やめる</Button>
          <Button className="min-h-tap gap-1.5" onClick={submit} disabled={ret.isPending}>
            {ret.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Undo2 className="h-4 w-4" aria-hidden="true" />}
            返却する
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="rounded-card border border-warning-border bg-warning-surface p-3">
        <p className="text-sub">
          貸出先: {card.borrower_company || '（会社名なし）'} / {card.borrower_person}
        </p>
        <p className="text-sub mt-1 flex items-center gap-1.5 text-muted-foreground">
          貸出の期間
          <DateRange start={card.lent_on} end={card.due_on} className="text-sub" />
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="返してもらった日" type="date" value={returnedOn} onChange={setReturnedOn} />
      </div>
      <div>
        <Label htmlFor="return-notes">返却のときのメモ</Label>
        <textarea id="return-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={TEXTAREA} placeholder="任意" />
      </div>
    </Shell>
  );
}

function Shell({ title, onClose, footer, children }: {
  title: string; onClose: () => void; footer: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <FormDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title} footer={footer}>
      <div className="flex flex-col gap-3">{children}</div>
    </FormDialog>
  );
}

function Field({
  label, value, onChange, placeholder, type, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
