import { useRef, useState } from 'react';
import {
  FileText, Plus, Sparkles, Loader2, Pencil, Trash2, CheckCircle2, XCircle, ArrowRight, RotateCcw, CalendarClock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { formatCurrency } from '@gmo-onair/shared/src/client/format';
import FinanceDocOriginal from '@gmo-onair/shared/src/client/finance/FinanceDocOriginal';
import { useQueryClient } from '@tanstack/react-query';
import {
  FINANCE_DOC_TYPE_LABELS, FINANCE_DOC_STATUS_LABELS, formatDateJa,
  type FinanceDoc, type FinanceDocType, type FinanceDocStatus,
} from '@/lib/types';
import {
  useFinanceDocs, useCreateFinanceDoc, useUpdateFinanceDoc, useDeleteFinanceDoc, type FinanceDocInput,
} from '@/lib/inboxApi';

const STATUS_STYLE: Record<FinanceDocStatus, string> = {
  new: 'border-blue-300 text-blue-700 bg-blue-50',
  reviewing: 'border-amber-300 text-amber-700 bg-amber-50',
  approved: 'border-violet-300 text-violet-700 bg-violet-50',
  rejected: 'border-rose-300 text-rose-700 bg-rose-50',
  processed: 'border-emerald-300 text-emerald-700 bg-emerald-50',
};
const TYPE_STYLE: Record<FinanceDocType, string> = {
  quote: 'bg-sky-100 text-sky-800',
  invoice: 'bg-indigo-100 text-indigo-800',
  order: 'bg-teal-100 text-teal-800',
};

function yen(v: number | string | null): string {
  if (v === null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return formatCurrency(n);
}

export default function FinanceDocsPage() {
  const { canEdit } = usePermissions();
  const [typeTab, setTypeTab] = useState<FinanceDocType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | FinanceDocStatus>('pending');
  const { data: rows, isLoading } = useFinanceDocs({ doc_type: typeTab === 'all' ? undefined : typeTab });
  const [editing, setEditing] = useState<FinanceDoc | null>(null);
  const [adding, setAdding] = useState(false);

  const list = (rows ?? []).filter((d) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return d.status !== 'processed' && d.status !== 'rejected';
    return d.status === statusFilter;
  });

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold"><FileText className="h-5 w-5 text-primary" />見積 / 請求書</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            メールで受信した見積書・請求書・注文書の処理進捗。AI が取り込み、確認 → 承認/却下 → 処理完了 で管理します。
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <UploadNewButton />
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" />手で追加</Button>
          </div>
        )}
      </div>

      {/* 種別タブ */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {([['all', 'すべて'], ['quote', '見積書'], ['invoice', '請求書'], ['order', '注文書']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTypeTab(k)}
            className={`rounded-md px-3 py-1.5 ${typeTab === k ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}>{label}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {([['pending', '未処理'], ['all', '全ステータス'], ['processed', '処理完了']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={`rounded-md px-2.5 py-1.5 text-xs ${statusFilter === k ? 'bg-foreground/10 font-medium' : 'text-muted-foreground hover:bg-accent'}`}>{label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">該当する書類はありません。</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {list.map((d) => <FinanceCard key={d.id} d={d} canEdit={canEdit} onEdit={() => setEditing(d)} />)}
        </div>
      )}

      {(adding || editing) && <FinanceDialog initial={editing} onClose={() => { setAdding(false); setEditing(null); }} />}
    </div>
  );
}

function FinanceCard({ d, canEdit, onEdit }: { d: FinanceDoc; canEdit: boolean; onEdit: () => void }) {
  const qc = useQueryClient();
  const update = useUpdateFinanceDoc();
  const del = useDeleteFinanceDoc();
  const isAi = d.source === 'email';
  const setStatus = (status: FinanceDocStatus) => update.mutate({ id: d.id, fields: { status } });

  return (
    <Card className={d.status === 'processed' ? 'border-emerald-200 bg-emerald-50/20' : ''}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TYPE_STYLE[d.doc_type]}`}>{FINANCE_DOC_TYPE_LABELS[d.doc_type]}</span>
              <Badge variant="outline" className={`text-[11px] ${STATUS_STYLE[d.status]}`}>{FINANCE_DOC_STATUS_LABELS[d.status]}</Badge>
              {isAi && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700"><Sparkles className="h-3 w-3" />AI取込</span>}
              {d.sender && <span className="text-sm font-medium">{d.sender}</span>}
            </div>
            {d.subject && <p className="mt-1 text-sm font-medium text-foreground truncate">{d.subject}</p>}
            {d.content && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{d.content}</p>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {d.closing_month && <span>締月 {d.closing_month}</span>}
              {d.payment_due && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />支払期日 {formatDateJa(d.payment_due)}</span>}
              {d.received_at && <span>受信 {formatDateJa(d.received_at)}</span>}
              {d.gls_number && <span>{d.gls_number}</span>}
              {d.processed_by && <span className="text-emerald-700">処理: {d.processed_by}</span>}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-base font-semibold tabular-nums">{yen(d.amount)}</div>
          </div>
        </div>
        {/* 原本 (PDF/画像)。承認する前に読めるようにする */}
        <div className="mt-2 border-t border-border pt-2">
          <FinanceDocOriginal
            api={api}
            docId={d.id}
            hasOriginal={!!d.has_original}
            originalName={d.original_name ?? null}
            originalKind={d.original_kind ?? null}
            canEdit={canEdit}
            onChanged={() => qc.invalidateQueries({ queryKey: ['dailyops', 'finance-docs'] })}
          />
        </div>
        {canEdit && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
            {d.status === 'new' && <StepBtn onClick={() => setStatus('reviewing')} icon={ArrowRight}>確認中にする</StepBtn>}
            {d.status === 'reviewing' && <>
              <StepBtn onClick={() => setStatus('approved')} icon={CheckCircle2} tone="violet">承認</StepBtn>
              <StepBtn onClick={() => setStatus('rejected')} icon={XCircle} tone="rose">却下</StepBtn>
            </>}
            {d.status === 'approved' && <StepBtn onClick={() => setStatus('processed')} icon={CheckCircle2} tone="emerald">処理完了にする</StepBtn>}
            {(d.status === 'processed' || d.status === 'rejected') && <StepBtn onClick={() => setStatus('new')} icon={RotateCcw}>受信に戻す</StepBtn>}
            <div className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm('この書類を削除しますか？')) del.mutate(d.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * PDF を落として**新しい行を作る**。メールが無い請求書 (Slack で渡された / 紙を撮った) の入口。
 * 下読みできた値はフォームに埋まった状態で行ができ、読めなかったことは注意として出す。
 */
function UploadNewButton() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; lines: string[] } | null>(null);

  const send = async (file: File) => {
    setBusy(true); setNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/dailyops/finance-docs/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const warnings = (res.data?.data?.warnings ?? []) as string[];
      qc.invalidateQueries({ queryKey: ['dailyops', 'finance-docs'] });
      setNotice({ kind: 'ok', lines: ['登録しました。内容を確認してください。', ...warnings] });
    } catch (e) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      setNotice({ kind: 'error', lines: [err?.response?.data?.error?.message ?? '登録できませんでした'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
        PDFを落として登録
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void send(f); }}
      />
      {notice && (
        <div className={`w-full rounded-md border px-3 py-2 text-xs ${notice.kind === 'ok' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800'}`}>
          {notice.lines.map((l, i) => <p key={i}>{l}</p>)}
          <button type="button" className="mt-1 underline" onClick={() => setNotice(null)}>閉じる</button>
        </div>
      )}
    </>
  );
}

function StepBtn({ onClick, icon: Icon, tone, children }: { onClick: () => void; icon: React.ElementType; tone?: 'violet' | 'rose' | 'emerald'; children: React.ReactNode }) {
  const cls = tone === 'violet' ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
    : tone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
    : tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
    : 'border-border bg-muted/40 text-foreground hover:bg-accent';
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${cls}`}>
      <Icon className="h-3.5 w-3.5" />{children}
    </button>
  );
}

function FinanceDialog({ initial, onClose }: { initial: FinanceDoc | null; onClose: () => void }) {
  const create = useCreateFinanceDoc();
  const update = useUpdateFinanceDoc();
  const [f, setF] = useState<FinanceDocInput>({
    doc_type: initial?.doc_type ?? 'invoice',
    sender: initial?.sender ?? '',
    subject: initial?.subject ?? '',
    content: initial?.content ?? '',
    amount: initial?.amount != null ? Number(initial.amount) : null,
    closing_month: initial?.closing_month ?? '',
    payment_due: initial?.payment_due ?? '',
    received_at: initial?.received_at ?? '',
    gls_number: initial?.gls_number ?? '',
    notes: initial?.notes ?? '',
    status: initial?.status,
  });
  const pending = create.isPending || update.isPending;
  const submit = () => {
    const done = () => onClose();
    if (initial) update.mutate({ id: initial.id, fields: f }, { onSuccess: done });
    else create.mutate(f, { onSuccess: done });
  };
  const upd = (k: keyof FinanceDocInput) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{initial ? '書類を編集' : '書類を追加'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>種別</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={f.doc_type} onChange={(e) => setF((p) => ({ ...p, doc_type: e.target.value as FinanceDocType }))}>
                <option value="quote">見積書</option><option value="invoice">請求書</option><option value="order">注文書</option>
              </select>
            </div>
            <div>
              <Label>金額 (税込)</Label>
              <Input type="number" value={f.amount ?? ''} onChange={(e) => setF((p) => ({ ...p, amount: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
          </div>
          <div><Label>送付者</Label><Input value={f.sender ?? ''} onChange={upd('sender')} placeholder="取引先・担当者" /></div>
          <div><Label>件名</Label><Input value={f.subject ?? ''} onChange={upd('subject')} /></div>
          <div><Label>内容</Label>
            <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={2}
              value={f.content ?? ''} onChange={(e) => setF((p) => ({ ...p, content: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>締月</Label><Input type="month" value={f.closing_month ?? ''} onChange={upd('closing_month')} /></div>
            <div><Label>支払期日</Label><Input type="date" value={f.payment_due ?? ''} onChange={upd('payment_due')} /></div>
            <div><Label>受信日</Label><Input type="date" value={f.received_at ?? ''} onChange={upd('received_at')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>関連GLS</Label><Input value={f.gls_number ?? ''} onChange={upd('gls_number')} placeholder="GLS-B001 等" /></div>
            {initial && (
              <div><Label>ステータス</Label>
                <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value as FinanceDocStatus }))}>
                  {Object.entries(FINANCE_DOC_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={submit} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}{initial ? '保存' : '追加'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
