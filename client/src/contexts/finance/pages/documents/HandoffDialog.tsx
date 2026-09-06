/**
 * 受領書類を仕入・販管費に登録するダイアログ（⑥ 受領書類）
 *
 * **ここが「登録済」の中身です。** 以前は状態が変わるだけで台帳に何も作られず、
 * 同じ請求書を2回入力していました（届いた記録 ＋ 台帳の記録）。
 *
 * ── 副題は1文にする（用語の決めごと）────────────────────────
 *
 * 以前の副題は「請求書『件名』（送付者）を仕入か販管費として登録します。登録すると
 * 処理完了になります。」で、**1文に3つの情報**（何の書類か・何をするか・そのあとどうなるか）
 * が入っていて読み切れなかった。副題は**何をするか1文**だけにし、
 * **どの書類が対象かは本文の先頭に別行で出す**。
 *
 * ── 金額を勝手に割り戻さない ────────────────────────────────
 *
 * 書類の金額は**税込**で入っています（AI がメールから読むときの決まり）。
 * 台帳は税抜なので、**税抜の金額を人に確かめてもらいます**。
 * 書類に税区分が無いので、こちらで割り戻すと必ずどこかでずれます。
 * 目安として「税込 ÷ (1+税率)」を初期値に入れ、**そう入れたことを画面に書きます**。
 * **税区分を選び直したらその場で入れ直します**（区分だけ変えても金額が動かないと、
 * 画面の説明文と実際の金額が食い違ったまま登録できてしまう）。
 *
 * ── 仕入か販管費か ──────────────────────────────────────────
 *
 * 案件に紐づくものが仕入、紐づかないものが販管費です。
 * GLS番号が書類に入っていれば**仕入を初期選択**します（AI が読み取っている）。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Info } from 'lucide-react';
import api from '@/lib/api';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TaxCategoryLabels, taxRateOf } from '@/types';
import type { Vendor } from '@/types';
import { TYPE_LABEL, type FinanceDoc } from './types';

/**
 * 税込 → 税抜の目安。**あくまで初期値**で、人が直せる。
 *
 * ⚠️ **税区分を渡すこと。** 以前は 10% 固定で割り戻していたので、
 * 8%（軽減）や非課税・不課税を選び直しても金額が動かず、
 * **画面には「10% として割り戻した」と書いてあるのに区分だけ違う**行ができていた。
 * 率は `taxRateOf`（サーバーの `tax-category.service` と同じ規則）に合わせる。
 */
function exclTax(incl: number, taxCategory: string): number {
  return Math.round(incl / (1 + taxRateOf(taxCategory)));
}

export interface HandoffPayload {
  kind: 'purchase' | 'sga';
  amount: number;
  tax_category: string;
  recognition_date: string;
  payment_due_date: string | null;
  description: string | null;
  project_id?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
}

export function HandoffDialog({
  doc, saving, onClose, onSubmit,
}: {
  doc: FinanceDoc;
  saving: boolean;
  onClose: () => void;
  onSubmit: (p: HandoffPayload) => void;
}) {
  const incl = Number(doc.amount) || 0;
  /*
    行き先の初期選択。**人が受領書類の画面で決めた当て先を最優先**にする（migration 281）。

    以前は GLS 番号の有無だけで決めていたので、**人が束の当て先を「この案件」と
    決めていても、ここでは販管費に倒れて**いました（決めた意味が無い）。
    見る順は 人が決めた行き先 → 当て先の案件 → GLS 番号 → 販管費。
  */
  const [kind, setKind] = useState<'purchase' | 'sga'>(
    doc.expense_kind ?? (doc.project_id || doc.gls_number ? 'purchase' : 'sga'),
  );
  const [tax, setTax] = useState('tax10');
  const [amount, setAmount] = useState(exclTax(incl, 'tax10'));
  const [month, setMonth] = useState(doc.closing_month || (doc.received_at ?? '').slice(0, 7));
  const [due, setDue] = useState(doc.payment_due ?? '');
  const [description, setDescription] = useState(doc.subject ?? '');
  // **当て先が決まっていればそれを初期値に**（空にすると人が選び直す羽目になる）
  const [projectId, setProjectId] = useState(doc.project_id ?? '');
  const [vendorId, setVendorId] = useState('');

  // **GLS発番済みではなく「受注確定済み」で絞る**（v4.1.8・矛盾修正。理由は PurchaseListPage と同じ）
  const { data: projectsData } = useQuery({
    queryKey: ['won-projects-for-handoff'],
    queryFn: async () => (await api.get('/projects/won-projects')).data,
    enabled: kind === 'purchase',
  });
  // **毎回新しい配列を作らない** — 下の `useMemo` の依存に入るので、
  // `?? []` を素で書くと毎描画で作り直されて `useMemo` が意味を失う
  const projects = useMemo<{ id: string; gls_number: string | null; name: string }[]>(
    () => projectsData?.data ?? [],
    [projectsData],
  );

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors?limit=200')).data,
    enabled: kind === 'purchase',
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  /*
    書類の GLS番号 と同じ案件があれば初期選択（AI が読み取った値を活かす）。
    **当て先（`doc.project_id`）が入っていればそちらが先**で、これは
    「番号は読めたが当て先はまだ決めていない」ときの受け皿。
  */
  const guessedProject = useMemo(
    () => (doc.gls_number ? projects.find((p) => p.gls_number === doc.gls_number) : undefined),
    [projects, doc.gls_number],
  );
  const effectiveProject = projectId || guessedProject?.id || '';

  const ready = kind === 'sga'
    ? !!month && amount > 0
    : !!month && amount > 0 && !!effectiveProject && !!vendorId;

  const submit = () => onSubmit({
    kind,
    amount,
    tax_category: tax,
    recognition_date: `${month}-01`,
    payment_due_date: due || null,
    description: description || null,
    project_id: kind === 'purchase' ? effectiveProject : null,
    vendor_id: kind === 'purchase' ? vendorId : null,
    vendor_name: kind === 'sga' ? doc.sender : null,
  });

  return (
    <FormDialog
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title="仕入・販管費に登録"
      size="lg"
      sub="仕入か販管費に登録します。登録すると「登録済」になります。"
      // Enter キーで登録できるようにする（`docs/design/v4/_form-order.md` 4）。
      // **明細行を持たないフォームなので、入力中の Enter が誤送信になる心配が無い。**
      // 登録ボタンは `type="submit"` にして `onClick` を外してある（両方あると二重送信）。
      onSubmit={(e) => { e.preventDefault(); if (!ready || saving) return; submit(); }}
      footer={
        <FormDialogFooter>
          {/* ⚠️ 送信以外のボタンには必ず `type="button"` を付ける
              （`<form>` の中では既定が submit になり、押すと登録が走る） */}
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button
            type="submit"
            disabled={!ready || saving}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {kind === 'purchase' ? '仕入に登録' : '販管費に登録'}
          </Button>
        </FormDialogFooter>
      }
    >
        <div className="flex flex-col gap-4">
          {/* **どの書類が対象か**は副題から本文の先頭へ移した（ファイル冒頭コメント参照） */}
          <p className="text-sub rounded-note border border-border-faint bg-surface-subtle px-3 py-2 text-secondary-foreground">
            {TYPE_LABEL[doc.doc_type]}「{doc.subject || '件名なし'}」（{doc.sender || '送付者なし'}）
          </p>

          <div>
            <Label>どちらに登録しますか</Label>
            <div role="group" className="rounded-control mt-1 inline-flex overflow-hidden border border-border">
              {([['purchase', '仕入（案件に紐づく）'], ['sga', '販管費（案件に紐づかない）']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`min-h-tap px-3 text-sub lg:min-h-[36px] ${
                    kind === k ? 'bg-primary font-bold text-primary-foreground' : 'text-secondary-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {kind === 'purchase' && (
            <>
              <div>
                <Label>案件 *</Label>
                <SearchableSelect
                  options={projects.map((p) => ({ value: p.id, label: `${p.gls_number || 'GLS未発番'} ${p.name}` }))}
                  value={effectiveProject}
                  onChange={setProjectId}
                  placeholder="GLS番号で検索â¦"
                />
                {guessedProject && !projectId && (
                  <p className="text-note mt-1 text-info">
                    書類の GLS番号（{doc.gls_number}）から選びました。違うときは選び直してください
                  </p>
                )}
                <p className="text-note mt-1 text-muted-foreground">受注（A 受注済）以降の案件だけが選べます</p>
              </div>
              <div>
                <Label>仕入先 *</Label>
                <SearchableSelect
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder="仕入先を検索â¦"
                />
                <p className="text-note mt-1 text-muted-foreground">
                  書類の送付者は「{doc.sender || '—'}」です
                </p>
              </div>
            </>
          )}

          {/* **税区分は金額より上。** 税抜の金額はこの区分で割り戻した結果なので、
              材料になる欄を先に置く（`docs/design/v4/_form-order.md` 2-3）。
              選び直したらその場で金額も入れ直す（⑦ 取り込みの `PdfReviewForm` と同じ扱い） */}
          <div>
            <Label>税区分</Label>
            <Select
              value={tax}
              onValueChange={(v) => { setTax(v); setAmount(exclTax(incl, v)); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TaxCategoryLabels).map(([v, label]) => (
                  <SelectItem key={v} value={v}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>金額（税抜）*</Label>
            <CurrencyInput value={amount} onChange={setAmount} />
            {/* **勝手に割り戻していることを書く。** 黙って割ると書類と静かにずれる */}
            <p className="text-note mt-1 flex items-start gap-1.5 text-warning">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                書類の金額 <strong className="font-bold">{incl.toLocaleString()}円は税込</strong>です。
                {taxRateOf(tax) > 0
                  ? `${TaxCategoryLabels[tax as keyof typeof TaxCategoryLabels]} として割り戻した目安を入れています（${exclTax(incl, tax).toLocaleString()}円）。`
                  : `${TaxCategoryLabels[tax as keyof typeof TaxCategoryLabels]} なので割り戻していません（${exclTax(incl, tax).toLocaleString()}円）。`}
                <strong className="font-bold">書類を見て確かめてください。</strong>
              </span>
            </p>
          </div>

          {/* 必須の計上月を先頭に置く。着手前は任意の税区分と支払期日に挟まれた
              3列の真ん中で、必須と任意が交互に並んでいた（同 2-2） */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>計上月 *</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div>
              <Label>支払期日</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>説明</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
    </FormDialog>
  );
}
