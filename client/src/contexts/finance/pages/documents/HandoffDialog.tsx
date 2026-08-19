/**
 * 受け取った書類を台帳へ渡すダイアログ（⑥ 受け取った書類）
 *
 * **ここが「処理完了」の中身です。** 以前は状態が変わるだけで台帳に何も作られず、
 * 同じ請求書を2回入力していました（届いた記録 ＋ 台帳の記録）。
 *
 * ── 金額を勝手に割り戻さない ────────────────────────────────
 *
 * 書類の金額は**税込**で入っています（AI がメールから読むときの決まり）。
 * 台帳は税抜なので、**税抜の金額を人に確かめてもらいます**。
 * 書類に税区分が無いので、こちらで割り戻すと必ずどこかでずれます。
 * 目安として「税込 ÷ 1.1」を初期値に入れ、**そう入れたことを画面に書きます**。
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TaxCategoryLabels } from '@/types';
import type { Vendor } from '@/types';
import { TYPE_LABEL, type FinanceDoc } from './types';

/** 税込 → 税抜の目安。**あくまで初期値**で、人が直せる */
function exclTax(incl: number): number {
  return Math.round(incl / 1.1);
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
  // GLS番号が読み取れていれば案件のものなので仕入を初期選択
  const [kind, setKind] = useState<'purchase' | 'sga'>(doc.gls_number ? 'purchase' : 'sga');
  const [amount, setAmount] = useState(exclTax(incl));
  const [tax, setTax] = useState('tax10');
  const [month, setMonth] = useState(doc.closing_month || (doc.received_at ?? '').slice(0, 7));
  const [due, setDue] = useState(doc.payment_due ?? '');
  const [description, setDescription] = useState(doc.subject ?? '');
  const [projectId, setProjectId] = useState('');
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

  // 書類の GLS番号 と同じ案件があれば初期選択（AI が読み取った値を活かす）
  const guessedProject = useMemo(
    () => (doc.gls_number ? projects.find((p) => p.gls_number === doc.gls_number) : undefined),
    [projects, doc.gls_number],
  );
  const effectiveProject = projectId || guessedProject?.id || '';

  const ready = kind === 'sga'
    ? !!month && amount > 0
    : !!month && amount > 0 && !!effectiveProject && !!vendorId;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>台帳に入れる</DialogTitle>
          <DialogDescription>
            {TYPE_LABEL[doc.doc_type]}「{doc.subject || '件名なし'}」（{doc.sender || '送付者なし'}）を
            仕入か販管費として登録します。<strong className="font-bold">登録すると処理完了になります。</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <Label>どちらに入れますか</Label>
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
                  placeholder="GLS番号で検索..."
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
                  placeholder="仕入先を検索..."
                />
                <p className="text-note mt-1 text-muted-foreground">
                  書類の送付者は「{doc.sender || '—'}」です
                </p>
              </div>
            </>
          )}

          <div>
            <Label>金額（税抜）*</Label>
            <CurrencyInput value={amount} onChange={setAmount} />
            {/* **勝手に割り戻していることを書く。** 黙って 1.1 で割ると、
                8% や 非課税 の書類で静かにずれる */}
            <p className="text-note mt-1 flex items-start gap-1.5 text-warning">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                書類の金額 <strong className="font-bold">{incl.toLocaleString()}円は税込</strong>です。
                10% として割り戻した目安を入れています（{exclTax(incl).toLocaleString()}円）。
                <strong className="font-bold">書類を見て確かめてください。</strong>
              </span>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label>税区分</Label>
              <Select value={tax} onValueChange={setTax}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TaxCategoryLabels).map(([v, label]) => (
                    <SelectItem key={v} value={v}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>やめる</Button>
          <Button
            disabled={!ready || saving}
            onClick={() => onSubmit({
              kind,
              amount,
              tax_category: tax,
              recognition_date: `${month}-01`,
              payment_due_date: due || null,
              description: description || null,
              project_id: kind === 'purchase' ? effectiveProject : null,
              vendor_id: kind === 'purchase' ? vendorId : null,
              vendor_name: kind === 'sga' ? doc.sender : null,
            })}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {kind === 'purchase' ? '仕入に入れる' : '販管費に入れる'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
