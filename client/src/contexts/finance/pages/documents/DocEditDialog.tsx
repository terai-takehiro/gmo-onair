/**
 * 届いた書類そのものを人が直すダイアログ（migration 281・2026-09 のご指示）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * AI がメールから読み取った 金額・支払期日・締月・書類の種類 は**間違うことがあります**
 * （PDF に書いてある金額と、本文に書いてある概算が違う。「請求書」と書いてあるが
 * 中身は見積書、など）。直す手立てが無いと、人は
 * **書類ごと消して手で入れ直す**か、間違ったまま仕入・販管費に入れます。
 *
 * ── 直せるものと直せないもの ────────────────────────────────
 *
 * 直せる: 種類 / 金額（税込）/ 支払期日 / 締月 / 書類番号 / 見積の改定回数 / メモ
 *
 * **直せない: 件名・差出人・本文。** これらは**届いたメールそのもの**の記録で、
 * 直すと「AI が何を読んだか」を後から確かめられなくなります
 * （`body_text` を残している理由がそれです）。
 * **仕入・販管費に登録済みの書類も直せません** — 台帳の行と食い違うためです。
 * 先に登録を取り消してください。
 *
 * ── 直した差分は AI に返る ──────────────────────────────────
 *
 * サーバーが `ai_corrections` に **どのフィールドを・何から何に** 変えたかを
 * 自動で入れます（会社方針「AI を使い捨てにしない」の条件2）。
 * **人に「何を直したか」を入力させません** — 運用が続かないからです。
 */
import { useState } from 'react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { TYPE_LABEL, type DocType, type FinanceDoc } from './types';

export interface DocPatch {
  doc_type?: DocType;
  amount?: number | null;
  payment_due?: string | null;
  closing_month?: string | null;
  doc_no?: string | null;
  revision?: number | null;
  notes?: string | null;
}

const TYPES: DocType[] = ['quote', 'order', 'invoice'];

export function DocEditDialog({
  doc, saving, onClose, onSubmit,
}: {
  doc: FinanceDoc;
  saving: boolean;
  onClose: () => void;
  onSubmit: (patch: DocPatch) => void;
}) {
  const [docType, setDocType] = useState<DocType>(doc.doc_type);
  const [amount, setAmount] = useState<number | null>(doc.amount === null ? null : Number(doc.amount));
  const [due, setDue] = useState(doc.payment_due ?? '');
  const [closing, setClosing] = useState(doc.closing_month ?? '');
  const [docNo, setDocNo] = useState(doc.doc_no ?? '');
  const [revision, setRevision] = useState(doc.revision === null ? '' : String(doc.revision));
  const [notes, setNotes] = useState(doc.notes ?? '');

  const submit = () => {
    onSubmit({
      doc_type: docType,
      // **空を 0 にしない。** 「金額が書いていない」と「0円」は違う
      amount: amount === null || Number.isNaN(amount) ? null : amount,
      payment_due: due || null,
      closing_month: closing || null,
      doc_no: docNo.trim() || null,
      revision: revision.trim() === '' ? null : Number(revision),
      notes: notes.trim() || null,
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="届いた書類を直す"
      sub="AI が読み取った内容を人が直します。件名・本文は届いたままの記録なので直せません。"
      footer={(
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>やめる</Button>
          <Button onClick={submit} disabled={saving}>{saving ? '保存中…' : '保存する'}</Button>
        </FormDialogFooter>
      )}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sub text-secondary-foreground">{doc.subject || '（件名なし）'}</p>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sub-sm font-bold">書類の種類</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <Button
                key={t}
                type="button"
                variant={docType === t ? 'default' : 'outline'}
                onClick={() => setDocType(t)}
              >
                {TYPE_LABEL[t]}
              </Button>
            ))}
          </div>
          <p className="text-note text-muted-foreground">
            見積書は仕入・販管費に登録できません（発注書・請求書が届いてから登録します）。
          </p>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fd-amount">金額（税込）</Label>
          {/*
            ⚠️ **空欄を 0 として保存しない。** `CurrencyInput` は数値しか返さないので、
            「消した」を `null` に落とすのはこちらの責任
            （0 を入れると「0円と決めた」と見分けが付かなくなる）
          */}
          <CurrencyInput id="fd-amount" value={amount ?? ''} onChange={(v) => setAmount(v || null)} />
          <p className="text-note text-muted-foreground">
            書類に書いてある<strong className="font-bold">税込</strong>の金額を入れます。
            税抜への割り戻しは、仕入・販管費に登録するときに確かめます。
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fd-due">支払期日</Label>
            <Input id="fd-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fd-closing">締月</Label>
            <Input id="fd-closing" type="month" value={closing} onChange={(e) => setClosing(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fd-no">書類番号</Label>
            <Input id="fd-no" value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="見積番号・請求番号" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fd-rev">見積の改定回数</Label>
            <Input
              id="fd-rev" type="number" min={1} max={99} inputMode="numeric"
              value={revision} onChange={(e) => setRevision(e.target.value)}
              placeholder="改定されていなければ空のまま"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fd-notes">メモ</Label>
          <Textarea
            id="fd-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="パスワードは別送メールにあります／PDF の金額と本文の概算が違う など"
          />
        </div>
      </div>
    </FormDialog>
  );
}
