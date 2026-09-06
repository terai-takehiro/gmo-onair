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
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { InviewRegistration } from '@/lib/types';
import { useCreateInview, useUpdateInview, type InviewInput } from '@/lib/inviewApi';
import { companionsOf } from './logic';

const TEXTAREA = 'mt-1 w-full rounded-control border border-border bg-background px-3 py-2 text-sub';

export function InviewDialog({
  initial, presetSessionLabel, sessionOptions, onClose,
}: {
  initial: InviewRegistration | null;
  /** 新規登録をその日の回に入れるための初期値 (日ページから開いたとき) */
  presetSessionLabel?: string;
  /**
   * **その日 (一覧からは全日) に実在する回のラベル。** 候補として出すだけで、
   * 打ち込みは今までどおり自由 — 回の書式は「日付・時間帯・対象」を1行に
   * 詰めたもので、**新しい回はこの欄に打つことで生まれる**（日付を変えると
   * 別の日のページに移る）。`select` に閉じると新しい回を作れなくなるので、
   * `datalist` で候補を添えるだけにしてある。
   */
  sessionOptions?: string[];
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

  // **initial は一覧（react-query）由来で、ダイアログを開いたまま裏で
  // 更新されうる**（同じ来場者を選び直した・一覧が invalidate された等）。
  // props → state のコピーが初期値だけだと、開いたあとの更新に追随できず、
  // 古い内容のまま保存して直前の変更を巻き戻してしまう
  useEffect(() => {
    const names = (initial ? companionsOf(initial) : []).map((c) => c.name);
    setF({
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
      companions: names,
      visit_time: initial?.visit_time ?? '',
      interests: initial?.interests ?? '',
      notes: initial?.notes ?? '',
    });
    setCompanionsText(names.join('\n'));
  }, [initial, presetSessionLabel]);

  const submit = () => {
    const payload: InviewInput = {
      ...f,
      companions: companionsText.split('\n').map((s) => s.trim()).filter(Boolean),
      party_size: Number(f.party_size) || 1,
    };
    const done = () => { notifySuccess(initial ? '来場予約を保存しました' : '来場予約を追加しました'); onClose(); };
    const fail = (e: unknown) => notifyApiError(initial ? '保存できませんでした' : '追加できませんでした', e);
    if (initial) update.mutate({ id: initial.id, fields: payload }, { onSuccess: done, onError: fail });
    else create.mutate(payload, { onSuccess: done, onError: fail });
  };

  const upd = (k: keyof InviewInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={initial ? '来場予約を編集' : '来場予約を追加'}
      // 旧幅 sm:max-w-2xl（672px）。名乗り・連絡先・住所を2列グリッドで並べる
      // 複合フォームなので既定の640pxには押し込めず wide を渡す
      wide
      // **Enter で保存できるようにする**（欄のほとんどが1行の入力欄で、
      // 受付は片手で打ちながら進める画面）。送信ボタンは `type="submit"` にして
      // `onClick` を外す — 両方あると二重に送信される（`_form-order.md` 4節）
      onSubmit={(e) => { e.preventDefault(); if (pending || !f.name?.trim() || !f.session_label?.trim()) return; submit(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={onClose}>キャンセル</Button>
          <Button
            type="submit"
            className="min-h-tap"
            disabled={pending || !f.name?.trim() || !f.session_label?.trim()}
          >
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {initial ? '保存' : '追加'}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        {/* 段1 どの回にぶら下げるか。**先頭のまま動かさない** — この1行で
            開催日まで決まる（日付を変えると別の日のページに移る） */}
        <div>
          <Label htmlFor="inview-session">参加希望の回 <span className="text-destructive">*</span></Label>
          <Input
            id="inview-session"
            // **その日にある回を候補に出す。** 1日に2回以上あると自動では
            // 埋まらず、書式を丸ごと打ち直させていた（打ち間違えると別の回になる）
            list={sessionOptions && sessionOptions.length > 0 ? 'inview-session-options' : undefined}
            value={f.session_label ?? ''}
            onChange={upd('session_label')}
            placeholder="例: 2026/7/29(水)14:00-17:00｜イベント主催者向け"
          />
          {sessionOptions && sessionOptions.length > 0 && (
            <datalist id="inview-session-options">
              {sessionOptions.map((s) => <option key={s} value={s} />)}
            </datalist>
          )}
          <p className="text-note mt-1 text-muted-foreground">
            日付・時間帯・対象は自動で読み取ります（日付を変えると別の日のページに移ります）
          </p>
        </div>

        {/* 段2 誰か（名乗り）。一覧の見出しになる欄を先に埋めきる */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="名前" required value={f.name ?? ''} onChange={upd('name')} placeholder="生城山 博敏" />
          <Field label="ふりがな" value={f.furigana ?? ''} onChange={upd('furigana')} />
          <Field label="会社情報" value={f.company ?? ''} onChange={upd('company')} placeholder="株式会社◯◯ ◯◯部" />
          <Field label="役職" value={f.role ?? ''} onChange={upd('role')} />
        </div>

        {/* 連絡先。**名乗りの直後にまとめる**（受付から折り返す先） */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="メールアドレス" value={f.email ?? ''} onChange={upd('email')} />
          <Field label="電話番号" value={f.phone ?? ''} onChange={upd('phone')} />
          <Field label="携帯番号" value={f.mobile ?? ''} onChange={upd('mobile')} />
          <Field label="FAX番号" value={f.fax ?? ''} onChange={upd('fax')} />
        </div>

        {/* **郵便番号と住所は対で読む欄**なので横に並べる。以前は
            郵便番号の隣が「ご参加人数」で、住所だけ次の行に独りで落ちていた */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="郵便番号" value={f.postal_code ?? ''} onChange={upd('postal_code')} placeholder="1020083" />
          <Field label="住所" value={f.address ?? ''} onChange={upd('address')} />
        </div>

        {/* 段3 いつ来るか */}
        <Field label="ご来場予定時間" value={f.visit_time ?? ''} onChange={upd('visit_time')} />

        {/* 段4 来場する人。**人数と同行者は必ず隣に置く** —
            この2つの差で「氏名未登録N名」が出る（`AttendeeCard.tsx`）ので、
            離すと片方だけ直した予約が生まれる */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>ご参加人数</Label>
            <Input
              type="number"
              min={1}
              value={f.party_size ?? 1}
              onChange={(e) => setF((p) => ({ ...p, party_size: Number(e.target.value) || 1 }))}
            />
          </div>
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

        {/* 段6 無くても保存できるものは最後にまとめる */}
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
    </FormDialog>
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
