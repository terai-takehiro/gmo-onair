/**
 * 内覧会 来場予約 — 登録・編集ダイアログ (v4)
 *
 * **フォームは同行者の「氏名」しか送らない。** 同行者ごとの受付記録は
 * サーバーが氏名で突き合わせて引き継ぐ (migration 154)。ここで受付記録まで
 * 送ろうとすると、編集するたびに当日の受付が消える事故になる。
 *
 * v4 で変えたのは、**保存に失敗したときに理由を出すようにした**ところ。
 * 以前は `onSuccess` しか渡していないので、失敗すると閉じずに黙っていた
 * (押した人には「効かないボタン」に見える)。
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { InviewRegistration } from '@/lib/types';
import { useCreateInview, useUpdateInview, type InviewInput } from '@/lib/inviewApi';
import { companionsOf } from './logic';

const TEXTAREA = 'mt-1 w-full rounded-control border border-border bg-background px-3 py-2 text-sub';

export function InviewDialog({
  initial, presetSessionLabel, onClose,
}: {
  initial: InviewRegistration | null;
  /** 新規登録をその日の回に入れるための初期値 (日ページから開いたとき) */
  presetSessionLabel?: string;
  onClose: () => void;
}) {
  const create = useCreateInview();
  const update = useUpdateInview();
  const initialCompanionNames = (initial ? companionsOf(initial) : []).map((c) => c.name);
  const [f, setF] = useState<InviewInput>({
    session_label: initial?.session_label ?? presetSessionLabel ?? '',
    name: initial?.name ?? '',
    furigana: initial?.furigana ?? '',
    email: initial?.email ?? '',
    company: initial?.company ?? '',
    role: initial?.role ?? '',
    postal_code: initial?.postal_code ?? '',
    address: initial?.address ?? '',
    phone: initial?.phone ?? '',
    mobile: initial?.mobile ?? '',
    fax: initial?.fax ?? '',
    party_size: initial?.party_size ?? 1,
    companions: initialCompanionNames,
    visit_time: initial?.visit_time ?? '',
    interests: initial?.interests ?? '',
    notes: initial?.notes ?? '',
  });
  const [companionsText, setCompanionsText] = useState(initialCompanionNames.join('\n'));
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const payload: InviewInput = {
      ...f,
      companions: companionsText.split('\n').map((s) => s.trim()).filter(Boolean),
      party_size: Number(f.party_size) || 1,
    };
    const done = () => { notifySuccess(initial ? '来場予約を直しました' : '来場予約を足しました'); onClose(); };
    const fail = (e: unknown) => notifyApiError(initial ? '保存できませんでした' : '追加できませんでした', e);
    if (initial) update.mutate({ id: initial.id, fields: payload }, { onSuccess: done, onError: fail });
    else create.mutate(payload, { onSuccess: done, onError: fail });
  };

  const upd = (k: keyof InviewInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? '来場予約を直す' : '来場予約を足す'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>参加希望の回 <span className="text-destructive">*</span></Label>
            <Input
              value={f.session_label ?? ''}
              onChange={upd('session_label')}
              placeholder="例: 2026/7/29(水)14:00-17:00｜イベント主催者向け"
            />
            <p className="text-note mt-1 text-muted-foreground">
              日付・時間帯・対象は自動で読み取ります（日付を変えると別の日のページに移ります）
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="名前" required value={f.name ?? ''} onChange={upd('name')} placeholder="生城山 博敏" />
            <Field label="ふりがな" value={f.furigana ?? ''} onChange={upd('furigana')} />
            <Field label="会社情報" value={f.company ?? ''} onChange={upd('company')} placeholder="株式会社◯◯ ◯◯部" />
            <Field label="役職" value={f.role ?? ''} onChange={upd('role')} />
            <Field label="メールアドレス" value={f.email ?? ''} onChange={upd('email')} />
            <Field label="電話番号" value={f.phone ?? ''} onChange={upd('phone')} />
            <Field label="携帯番号" value={f.mobile ?? ''} onChange={upd('mobile')} />
            <Field label="FAX番号" value={f.fax ?? ''} onChange={upd('fax')} />
            <Field label="郵便番号" value={f.postal_code ?? ''} onChange={upd('postal_code')} placeholder="1020083" />
            <div>
              <Label>ご参加人数</Label>
              <Input
                type="number"
                min={1}
                value={f.party_size ?? 1}
                onChange={(e) => setF((p) => ({ ...p, party_size: Number(e.target.value) || 1 }))}
              />
            </div>
          </div>

          <Field label="住所" value={f.address ?? ''} onChange={upd('address')} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="ご来場予定時間" value={f.visit_time ?? ''} onChange={upd('visit_time')} />
            <div>
              <Label>同行者 (1行に1名)</Label>
              <textarea
                className={TEXTAREA}
                rows={2}
                value={companionsText}
                onChange={(e) => setCompanionsText(e.target.value)}
                placeholder="同行者がいれば1行ずつ"
              />
              <p className="text-note mt-1 text-muted-foreground">
                氏名を入れると1人の参加者として並び、当日は1人ずつ受付できます
              </p>
            </div>
          </div>

          <div>
            <Label>ご興味・ご相談事項</Label>
            <textarea
              className={TEXTAREA}
              rows={2}
              value={f.interests ?? ''}
              onChange={(e) => setF((p) => ({ ...p, interests: e.target.value }))}
            />
          </div>
          <div>
            <Label>運営メモ</Label>
            <textarea
              className={TEXTAREA}
              rows={2}
              value={f.notes ?? ''}
              onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-tap" onClick={onClose}>やめる</Button>
          <Button
            className="min-h-tap"
            onClick={submit}
            disabled={pending || !f.name?.trim() || !f.session_label?.trim()}
          >
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {initial ? '保存' : '追加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, value, onChange, placeholder, required,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label>{label}{required ? <span className="text-destructive"> *</span> : null}</Label>
      <Input value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
