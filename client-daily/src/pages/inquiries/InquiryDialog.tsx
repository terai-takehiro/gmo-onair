/**
 * 入ってきた情報を手で足す／直すダイアログ（⑤ 入ってきた情報・v4）
 *
 * ── AI が読み取った中身はここでは直せない ──────────────────
 *
 * `details`（項目に分けた中身）と `body_text`（メール原文）は**入力欄を出していません**。
 *
 * ・原文は**届いたものそのもの**で、人が書き換えるものではありません
 *   （書き換えられると「AI がどこを読み違えたか」を確かめる術が無くなります）
 * ・項目のほうは、直したいときに 要約・推奨アクション・メモ を直せば足ります。
 *   ブロックの配列を手で編集させる画面は、作っても誰も使いません
 *
 * **人が直した内容はサーバーが自動で差分に残します**
 * （`inbox-ai-feedback.service.ts`・会社方針「AI を使い捨てにしない」の条件2）。
 * ここで「何を直したか」を入力させないのはそのためです。
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import {
  IMPORTANCE_LABELS, INQUIRY_SOURCES, INQUIRY_SOURCE_LABELS,
  type MiscInquiry, type Importance,
} from '@/lib/types';
import { useCreateInquiry, useUpdateInquiry, type InquiryInput } from '@/lib/inboxApi';

export function InquiryDialog({ initial, onClose }: { initial: MiscInquiry | null; onClose: () => void }) {
  const create = useCreateInquiry();
  const update = useUpdateInquiry();
  /**
   * 手で足すときの出どころの既定は**電話**。
   * 手で入れるものは電話メモか口頭で、メールなら AI が取り込むためです
   * （メールを選び直すことはできます）。
   */
  const [f, setF] = useState<InquiryInput>({
    summary: initial?.summary ?? '',
    sender: initial?.sender ?? '',
    subject: initial?.subject ?? '',
    importance: initial?.importance ?? 'medium',
    action_needed: initial?.action_needed ?? '',
    url: initial?.url ?? '',
    received_at: initial?.received_at ?? '',
    notes: initial?.notes ?? '',
    source: initial?.source ?? 'phone',
    tags: initial?.tags ?? [],
  });
  const [tagText, setTagText] = useState((initial?.tags ?? []).join('、'));
  const pending = create.isPending || update.isPending;
  const set = (k: keyof InquiryInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = () => {
    const done = () => { notifySuccess(initial ? '保存しました' : '追加しました'); onClose(); };
    const fail = (e: unknown) => notifyApiError(initial ? '直せませんでした' : '足せませんでした', e);
    // 読点・カンマ・空白のどれで区切っても同じに扱う（打ち方で結果が変わらないように）
    const fields = { ...f, tags: tagText.split(/[、,\s]+/).map((t) => t.trim()).filter(Boolean) };
    if (initial) update.mutate({ id: initial.id, fields }, { onSuccess: done, onError: fail });
    else create.mutate(fields, { onSuccess: done, onError: fail });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={initial ? '問い合わせを編集' : '問い合わせを追加'}
      // 入力10個・送信者/重要度・出どころ/受信日の2列グリッドを持つので `lg`(840px)
      size="lg"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={submit} disabled={pending || !f.summary?.trim()}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {initial ? '保存' : '追加'}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        {initial?.is_ai && (
          <p className="text-sm text-muted-foreground">
            これは <strong className="font-bold">AI が取り込んだもの</strong>です。
            直した内容は AI の改善に使われます（何を直したかを入力する必要はありません）。
          </p>
        )}
        <div>
          <Label>要約 *</Label>
          <textarea
            className="rounded-control mt-1 w-full border border-border bg-background px-3 py-2 text-sub"
            rows={2}
            value={f.summary ?? ''}
            onChange={set('summary')}
            placeholder="内容の1行要約"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>送信者</Label><Input value={f.sender ?? ''} onChange={set('sender')} /></div>
          <div>
            <Label>重要度</Label>
            <Select
              value={f.importance ?? 'medium'}
              onValueChange={(v) => setF((p) => ({ ...p, importance: v as Importance }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['high', 'medium', 'low'] as const).map((k) => (
                  <SelectItem key={k} value={k}>{IMPORTANCE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>件名</Label><Input value={f.subject ?? ''} onChange={set('subject')} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>出どころ</Label>
            <Select value={f.source ?? 'phone'} onValueChange={(v) => setF((p) => ({ ...p, source: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INQUIRY_SOURCES.map((k) => (
                  <SelectItem key={k} value={k}>{INQUIRY_SOURCE_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>受信日</Label><Input type="date" value={f.received_at ?? ''} onChange={set('received_at')} /></div>
        </div>
        <div>
          <Label>タグ</Label>
          <Input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="協業、取材、GLS-2607-009" />
          <p className="text-note mt-1 text-muted-foreground">
            読点・カンマ・空白のどれで区切っても同じです（8個まで・各24文字まで）。
            <strong className="font-bold">「あとで見る」に入れたものを後から引く</strong>ための手がかりなので、
            短い語にしてください。
          </p>
        </div>
        <div><Label>推奨アクション</Label><Input value={f.action_needed ?? ''} onChange={set('action_needed')} /></div>
        <div><Label>参考URL</Label><Input value={f.url ?? ''} onChange={set('url')} placeholder="https://..." /></div>
        <div>
          <Label>メモ</Label>
          <textarea
            className="rounded-control mt-1 w-full border border-border bg-background px-3 py-2 text-sub"
            rows={2}
            value={f.notes ?? ''}
            onChange={set('notes')}
          />
        </div>
      </div>
    </FormDialog>
  );
}
