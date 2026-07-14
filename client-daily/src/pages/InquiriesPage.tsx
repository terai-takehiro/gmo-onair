import { useState } from 'react';
import {
  Inbox, Plus, Sparkles, Loader2, Pencil, Trash2, CheckCircle2, Circle, ExternalLink, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { IMPORTANCE_LABELS, formatDateJa, type MiscInquiry, type Importance } from '@/lib/types';
import {
  useInquiries, useCreateInquiry, useUpdateInquiry, useHandleInquiry, useDeleteInquiry, type InquiryInput,
} from '@/lib/inboxApi';

const IMP_STYLE: Record<Importance, string> = {
  high: 'border-rose-300 text-rose-700 bg-rose-50',
  medium: 'border-amber-300 text-amber-700 bg-amber-50',
  low: 'border-slate-300 text-slate-600 bg-slate-50',
};

export default function InquiriesPage() {
  const { canEdit } = usePermissions();
  const [unhandledOnly, setUnhandledOnly] = useState(false);
  const { data: rows, isLoading } = useInquiries(unhandledOnly ? { unhandled: true } : {});
  const [editing, setEditing] = useState<MiscInquiry | null>(null);
  const [adding, setAdding] = useState(false);
  const list = rows ?? [];

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold"><Inbox className="h-5 w-5 text-primary" />その他問い合わせ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            案件・営業・見積請求・内覧会のいずれにも属さない有益なメール。AI がスパム・営業・メルマガを除いて分類・重要度づけします。
          </p>
        </div>
        {canEdit && <Button size="sm" onClick={() => setAdding(true)} className="shrink-0"><Plus className="h-4 w-4 mr-1" />追加</Button>}
      </div>

      <div className="flex items-center gap-1.5 text-sm">
        <button onClick={() => setUnhandledOnly(false)} className={`rounded-md px-3 py-1.5 ${!unhandledOnly ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}>すべて</button>
        <button onClick={() => setUnhandledOnly(true)} className={`rounded-md px-3 py-1.5 ${unhandledOnly ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}>未対応のみ</button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">問い合わせはありません。</CardContent></Card>
      ) : (
        <div className="space-y-2">{list.map((q) => <InquiryCard key={q.id} q={q} canEdit={canEdit} onEdit={() => setEditing(q)} />)}</div>
      )}

      {(adding || editing) && <InquiryDialog initial={editing} onClose={() => { setAdding(false); setEditing(null); }} />}
    </div>
  );
}

function InquiryCard({ q, canEdit, onEdit }: { q: MiscInquiry; canEdit: boolean; onEdit: () => void }) {
  const handle = useHandleInquiry();
  const del = useDeleteInquiry();
  const isAi = q.source === 'email';
  return (
    <Card className={q.handled_at ? 'opacity-70' : q.importance === 'high' ? 'border-rose-200' : ''}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="outline" className={`text-[11px] ${IMP_STYLE[q.importance]}`}>
                {q.importance === 'high' && <AlertTriangle className="h-3 w-3 mr-0.5" />}重要度 {IMPORTANCE_LABELS[q.importance]}
              </Badge>
              {q.category && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{q.category}</span>}
              {isAi && <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700"><Sparkles className="h-3 w-3" />AI取込</span>}
              {q.handled_at && <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 text-[11px]"><CheckCircle2 className="h-3 w-3" />対応済み</Badge>}
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">{q.summary}</p>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {q.sender && <span>{q.sender}</span>}
              {q.subject && <span className="truncate">件名: {q.subject}</span>}
              {q.received_at && <span>受信 {formatDateJa(q.received_at)}</span>}
              {q.url && <a href={q.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline"><ExternalLink className="h-3 w-3" />リンク</a>}
            </div>
            {q.action_needed && <p className="mt-1 text-xs text-blue-700">👉 {q.action_needed}</p>}
            {q.notes && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">📝 {q.notes}</p>}
          </div>
          {canEdit && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Button size="sm" variant={q.handled_at ? 'outline' : 'default'} className="h-8 gap-1 text-xs"
                disabled={handle.isPending} onClick={() => handle.mutate({ id: q.id, handled: !q.handled_at })}>
                {q.handled_at ? <><Circle className="h-3.5 w-3.5" />未対応に戻す</> : <><CheckCircle2 className="h-3.5 w-3.5" />対応済みにする</>}
              </Button>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm('この問い合わせを削除しますか？')) del.mutate(q.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InquiryDialog({ initial, onClose }: { initial: MiscInquiry | null; onClose: () => void }) {
  const create = useCreateInquiry();
  const update = useUpdateInquiry();
  const [f, setF] = useState<InquiryInput>({
    summary: initial?.summary ?? '',
    sender: initial?.sender ?? '',
    subject: initial?.subject ?? '',
    category: initial?.category ?? '',
    importance: initial?.importance ?? 'medium',
    action_needed: initial?.action_needed ?? '',
    url: initial?.url ?? '',
    received_at: initial?.received_at ?? '',
    notes: initial?.notes ?? '',
  });
  const pending = create.isPending || update.isPending;
  const submit = () => {
    const done = () => onClose();
    if (initial) update.mutate({ id: initial.id, fields: f }, { onSuccess: done });
    else create.mutate(f, { onSuccess: done });
  };
  const upd = (k: keyof InquiryInput) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{initial ? '問い合わせを編集' : '問い合わせを追加'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>要約 <span className="text-destructive">*</span></Label>
            <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={2}
              value={f.summary ?? ''} onChange={(e) => setF((p) => ({ ...p, summary: e.target.value }))} placeholder="内容の1行要約" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>送信者</Label><Input value={f.sender ?? ''} onChange={upd('sender')} /></div>
            <div><Label>重要度</Label>
              <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={f.importance} onChange={(e) => setF((p) => ({ ...p, importance: e.target.value as Importance }))}>
                <option value="high">高</option><option value="medium">中</option><option value="low">低</option>
              </select>
            </div>
          </div>
          <div><Label>件名</Label><Input value={f.subject ?? ''} onChange={upd('subject')} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>分類</Label><Input value={f.category ?? ''} onChange={upd('category')} placeholder="協業/取材/採用 等" /></div>
            <div><Label>受信日</Label><Input type="date" value={f.received_at ?? ''} onChange={upd('received_at')} /></div>
          </div>
          <div><Label>推奨アクション</Label><Input value={f.action_needed ?? ''} onChange={upd('action_needed')} /></div>
          <div><Label>参考URL</Label><Input value={f.url ?? ''} onChange={upd('url')} placeholder="https://..." /></div>
          <div><Label>メモ</Label>
            <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={2}
              value={f.notes ?? ''} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={submit} disabled={pending || !f.summary?.trim()}>{pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}{initial ? '保存' : '追加'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
