import { useState } from 'react';
import {
  FileText, Plus, Sparkles, Loader2, Pencil, Trash2, CheckCircle2, XCircle, ArrowRight, RotateCcw, CalendarClock,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { EmptyState, NoSearchResults, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { usePermissions } from '@/hooks/usePermissions';
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

  // 0件のときに「どれを外せば出るのか」を出すための一覧 (絞り込んでいないものは並べない)
  const activeFilters = [
    typeTab !== 'all' ? `種別: ${FINANCE_DOC_TYPE_LABELS[typeTab]}` : null,
    statusFilter === 'pending' ? '状態: 未処理' : null,
    statusFilter !== 'pending' && statusFilter !== 'all'
      ? `状態: ${FINANCE_DOC_STATUS_LABELS[statusFilter]}`
      : null,
  ].filter((f): f is string => f !== null);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold"><FileText className="h-5 w-5 text-primary" />見積 / 請求書</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            メールで受信した見積書・請求書・注文書の処理進捗。AI が取り込み、確認 → 承認/却下 → 処理完了 で管理します。
          </p>
        </div>
        {canEdit && <Button size="sm" onClick={() => setAdding(true)} className="shrink-0"><Plus className="h-4 w-4 mr-1" />追加</Button>}
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

      {/*
        中身が無いときの出し方を共通部品に寄せた (P3)。
        ・読み込み中は**全画面のスピナーにしない**。1秒未満は何も出さず (`Delayed`)、
          それを超えたら一覧の骨組みを出す (画面の枠は残したまま)
        ・0件は「該当なし」で終わらせず、**1件も無い**のか
          **絞り込みで消えている**のかを区別して、外すべき条件を名指しする
      */}
      {isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : (rows ?? []).length === 0 ? (
        <EmptyState
          title="受け取った書類はまだありません"
          description="メールで届いた見積書・請求書・注文書を AI が取り込みます。手で足すこともできます。"
          action={canEdit ? <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />追加</Button> : undefined}
        />
      ) : list.length === 0 ? (
        <NoSearchResults
          activeFilters={activeFilters}
          onClearFilters={() => { setTypeTab('all'); setStatusFilter('all'); }}
        />
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
  const update = useUpdateFinanceDoc();
  const del = useDeleteFinanceDoc();
  const isAi = d.source === 'email';
  const setStatus = (status: FinanceDocStatus) => update.mutate({ id: d.id, fields: { status } });

  return (
    <Card className={d.status === 'processed' ? 'border-emerald-200 bg-emerald-50/20' : ''}>
      <CardContent className="p-0">
        {/*
         * 列は固定幅のスロット、伸びるのは名前列だけ (docs/design/v4/_rules.md)。
         * 種別チップとステータスバッジを枠に入れたので、**行をまたいで左端がそろう**。
         * スマホでは固定列が 375px に入らないので `stackOnMobile` で名前列を1行にする。
         */}
        <Row align="start" stackOnMobile>
          <RowSlot w={56} hideOnMobile>
            <span className={`text-badge rounded px-1.5 py-0.5 ${TYPE_STYLE[d.doc_type]}`}>{FINANCE_DOC_TYPE_LABELS[d.doc_type]}</span>
          </RowSlot>
          <TableBadge w={96} label={FINANCE_DOC_STATUS_LABELS[d.status]} variant="outline" className={STATUS_STYLE[d.status]} />
          <RowMain>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {isAi && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700"><Sparkles className="h-3 w-3" />AI取込</span>}
              {d.sender && <span className="text-list">{d.sender}</span>}
            </div>
            {d.subject && <RowTitle className="mt-1">{d.subject}</RowTitle>}
            {d.content && <p className="text-sub mt-0.5 text-muted-foreground line-clamp-2 whitespace-pre-line">{d.content}</p>}
            <div className="text-sub-sm mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
              {d.closing_month && <span>締月 {d.closing_month}</span>}
              {d.payment_due && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />支払期日 {formatDateJa(d.payment_due)}</span>}
              {d.received_at && <span>受信 {formatDateJa(d.received_at)}</span>}
              {d.gls_number && <span>{d.gls_number}</span>}
              {d.processed_by && <span className="text-emerald-700">処理: {d.processed_by}</span>}
            </div>
          </RowMain>
          {/* 金額は ¥ を左端・数字を右端に分ける。縦に並べたとき桁が一直線になる */}
          <MoneyCell value={d.amount} width={128} className="text-base font-bold" />
        </Row>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2">
            {d.status === 'new' && <StepBtn onClick={() => setStatus('reviewing')} icon={ArrowRight}>確認中にする</StepBtn>}
            {d.status === 'reviewing' && <>
              <StepBtn onClick={() => setStatus('approved')} icon={CheckCircle2} tone="violet">承認</StepBtn>
              <StepBtn onClick={() => setStatus('rejected')} icon={XCircle} tone="rose">却下</StepBtn>
            </>}
            {d.status === 'approved' && <StepBtn onClick={() => setStatus('processed')} icon={CheckCircle2} tone="emerald">処理完了にする</StepBtn>}
            {(d.status === 'processed' || d.status === 'rejected') && <StepBtn onClick={() => setStatus('new')} icon={RotateCcw}>受信に戻す</StepBtn>}
            <div className="ml-auto flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
              {/*
                削除は `window.confirm` ではなく `confirmAction` (P3)。
                **一緒に何が消えるかを出す**のが要点で、「削除しますか？」だけだと
                取り込んだ本文や金額もまとめて消えることが伝わらない。
              */}
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={async () => {
                const ok = await confirmAction({
                  title: `${FINANCE_DOC_TYPE_LABELS[d.doc_type]}を削除しますか？`,
                  description: [
                    d.sender ? `差出人: ${d.sender}` : null,
                    d.subject ? `件名: ${d.subject}` : null,
                    '取り込んだ本文・金額・支払期日もいっしょに消えます。元に戻せません。',
                  ].filter(Boolean).join('\n'),
                  confirmLabel: '削除する',
                  tone: 'danger',
                });
                if (!ok) return;
                del.mutate(d.id, {
                  onSuccess: () => notifySuccess('書類を削除しました'),
                  onError: (err) => notifyApiError('書類を削除できませんでした', err),
                });
              }}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
