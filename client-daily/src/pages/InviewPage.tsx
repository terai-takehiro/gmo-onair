import { useMemo, useState } from 'react';
import {
  CalendarCheck, Plus, Users, Mail, Phone, Smartphone, Building2, Sparkles,
  CheckCircle2, Circle, Pencil, Trash2, Clock, MapPin, Loader2, Briefcase, ExternalLink,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDateJa, type InviewRegistration } from '@/lib/types';
import {
  useInviewList, useCreateInview, useUpdateInview, useCheckInInview, useDeleteInview,
  usePromoteInview, type InviewInput,
} from '@/lib/inviewApi';

// セッション (回) キー
function sessionKey(r: InviewRegistration): string {
  return `${r.session_date ?? ''}${r.session_label}`;
}

export default function InviewPage() {
  const { canEdit } = usePermissions();
  const [upcoming, setUpcoming] = useState(false);
  const { data: rows, isLoading } = useInviewList({ upcoming });
  const [editing, setEditing] = useState<InviewRegistration | null>(null);
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    const list = rows ?? [];
    const map = new Map<string, { label: string; date: string | null; time: string | null; audience: string | null; items: InviewRegistration[] }>();
    for (const r of list) {
      const k = sessionKey(r);
      if (!map.has(k)) map.set(k, { label: r.session_label, date: r.session_date, time: r.session_time, audience: r.session_audience, items: [] });
      map.get(k)!.items.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <CalendarCheck className="h-5 w-5 text-primary" />
            内覧会 来場予約
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            定期内覧会の回ごとの参加者名簿。Kairos3 の登録通知メールを AI が取り込み、当日は来場チェックに使えます。
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setAdding(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> 来場予約を追加
          </Button>
        )}
      </div>

      {/* 表示切替 */}
      <div className="flex items-center gap-1.5 text-sm">
        <button
          onClick={() => setUpcoming(false)}
          className={`rounded-md px-3 py-1.5 ${!upcoming ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}
        >すべて</button>
        <button
          onClick={() => setUpcoming(true)}
          className={`rounded-md px-3 py-1.5 ${upcoming ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}
        >今後の回のみ</button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          来場予約はまだありません。Kairos3 のメールを AI が取り込むか、「来場予約を追加」から登録してください。
        </CardContent></Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const headcount = g.items.reduce((a, r) => a + (r.party_size || 1), 0);
            const checkedIn = g.items.filter((r) => r.checked_in_at).length;
            return (
              <div key={`${g.date}-${g.label}`} className="space-y-2">
                {/* 回ヘッダー */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
                  <span className="font-semibold">
                    {g.date ? formatDateJa(g.date) : '日付未定'}
                    {g.time ? <span className="ml-1.5 text-sm font-normal text-muted-foreground">{g.time}</span> : null}
                  </span>
                  {g.audience ? <Badge variant="outline" className="text-xs">{g.audience}</Badge> : null}
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{g.items.length}組 / {headcount}名</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />来場 {checkedIn}</span>
                  </span>
                </div>
                {/* 回のフル文字列 (抽出前の生ラベル) */}
                {g.label && (g.date ? formatDateJa(g.date) : '') !== g.label && (
                  <p className="text-[11px] text-muted-foreground/70">{g.label}</p>
                )}
                <div className="space-y-2">
                  {g.items.map((r) => (
                    <AttendeeCard key={r.id} r={r} canEdit={canEdit} onEdit={() => setEditing(r)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && (
        <InviewDialog
          initial={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function AttendeeCard({ r, canEdit, onEdit }: { r: InviewRegistration; canEdit: boolean; onEdit: () => void }) {
  const checkIn = useCheckInInview();
  const del = useDeleteInview();
  const promote = usePromoteInview();
  const isKairos = r.source === 'kairos3';
  const isPromoted = !!r.promoted_project_id;
  return (
    <Card className={r.checked_in_at ? 'border-emerald-200 bg-emerald-50/30' : ''}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{r.name}</span>
              {r.furigana ? <span className="text-xs text-muted-foreground">{r.furigana}</span> : null}
              <Badge variant="outline" className="text-[11px]"><Users className="h-3 w-3 mr-0.5" />{r.party_size}名</Badge>
              {isKairos ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700" title={r.requested_by ? `AI取込 (指示: ${r.requested_by})` : 'AI (メール) 取込'}>
                  <Sparkles className="h-3 w-3" />AI取込
                </span>
              ) : null}
              {r.checked_in_at ? (
                <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 text-[11px]">
                  <CheckCircle2 className="h-3 w-3" />来場済み
                </Badge>
              ) : null}
              {isPromoted ? (
                <a
                  href={`/sales/projects/${r.promoted_project_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 hover:underline"
                  title="この来場予約から作成された案件を開く"
                >
                  <Briefcase className="h-3 w-3" />案件化済み<ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : null}
            </div>
            {(r.company || r.role) && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{[r.company, r.role].filter(Boolean).join(' / ')}</span>
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {r.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</span> : null}
              {r.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</span> : null}
              {r.mobile ? <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" />{r.mobile}</span> : null}
              {r.address ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.postal_code ? `〒${r.postal_code} ` : ''}{r.address}</span> : null}
              {r.visit_time ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />来場予定 {r.visit_time}</span> : null}
            </div>
            {r.companions && r.companions.length > 0 && (
              <p className="mt-1 text-xs"><span className="text-muted-foreground">同行者:</span> {r.companions.join('、')}</p>
            )}
            {r.interests ? <p className="mt-1 text-xs text-foreground/80 whitespace-pre-line">💬 {r.interests}</p> : null}
            {r.notes ? <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">📝 {r.notes}</p> : null}
          </div>
          {canEdit && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Button
                size="sm"
                variant={r.checked_in_at ? 'outline' : 'default'}
                className="h-8 gap-1 text-xs"
                disabled={checkIn.isPending}
                onClick={() => checkIn.mutate({ id: r.id, checkedIn: !r.checked_in_at })}
              >
                {r.checked_in_at ? <><Circle className="h-3.5 w-3.5" />受付取消</> : <><CheckCircle2 className="h-3.5 w-3.5" />受付する</>}
              </Button>
              {!isPromoted && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 border-blue-300 text-xs text-blue-700 hover:bg-blue-50"
                  disabled={promote.isPending}
                  onClick={() => {
                    if (!confirm(`${r.company || r.name} を案件化しますか？\n顧客・ヨミ案件・来場の活動記録を作成します。`)) return;
                    promote.mutate({ id: r.id }, {
                      onSuccess: (res) => {
                        alert(res.customer_created
                          ? '案件化しました（新規顧客も作成）。案件管理アプリでヨミ案件を確認できます。'
                          : '案件化しました。案件管理アプリでヨミ案件を確認できます。');
                      },
                      onError: (e: unknown) => {
                        const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
                        alert(`案件化に失敗しました: ${msg || '不明なエラー'}`);
                      },
                    });
                  }}
                >
                  {promote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Briefcase className="h-3.5 w-3.5" />}
                  案件化
                </Button>
              )}
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit} aria-label="編集"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="削除"
                  onClick={() => { if (confirm(`${r.name} さんの来場予約を削除しますか？`)) del.mutate(r.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InviewDialog({ initial, onClose }: { initial: InviewRegistration | null; onClose: () => void }) {
  const create = useCreateInview();
  const update = useUpdateInview();
  const [f, setF] = useState<InviewInput>({
    session_label: initial?.session_label ?? '',
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
    companions: initial?.companions ?? [],
    visit_time: initial?.visit_time ?? '',
    interests: initial?.interests ?? '',
    notes: initial?.notes ?? '',
  });
  const [companionsText, setCompanionsText] = useState((initial?.companions ?? []).join('\n'));
  const pending = create.isPending || update.isPending;

  const submit = () => {
    const payload: InviewInput = {
      ...f,
      companions: companionsText.split('\n').map((s) => s.trim()).filter(Boolean),
      party_size: Number(f.party_size) || 1,
    };
    const done = () => onClose();
    if (initial) update.mutate({ id: initial.id, fields: payload }, { onSuccess: done });
    else create.mutate(payload, { onSuccess: done });
  };

  const upd = (k: keyof InviewInput) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? '来場予約を編集' : '来場予約を追加'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>参加希望の回 <span className="text-destructive">*</span></Label>
            <Input value={f.session_label ?? ''} onChange={upd('session_label')} placeholder="例: 2026/7/29(水)14:00-17:00｜イベント主催者向け" />
            <p className="mt-1 text-[11px] text-muted-foreground">日付・時間帯・対象は自動抽出されます</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>名前 <span className="text-destructive">*</span></Label>
              <Input value={f.name ?? ''} onChange={upd('name')} placeholder="生城山 博敏" />
            </div>
            <div>
              <Label>ふりがな</Label>
              <Input value={f.furigana ?? ''} onChange={upd('furigana')} />
            </div>
            <div>
              <Label>会社情報</Label>
              <Input value={f.company ?? ''} onChange={upd('company')} placeholder="株式会社◯◯ ◯◯部" />
            </div>
            <div>
              <Label>役職</Label>
              <Input value={f.role ?? ''} onChange={upd('role')} />
            </div>
            <div>
              <Label>メールアドレス</Label>
              <Input value={f.email ?? ''} onChange={upd('email')} />
            </div>
            <div>
              <Label>電話番号</Label>
              <Input value={f.phone ?? ''} onChange={upd('phone')} />
            </div>
            <div>
              <Label>携帯番号</Label>
              <Input value={f.mobile ?? ''} onChange={upd('mobile')} />
            </div>
            <div>
              <Label>FAX番号</Label>
              <Input value={f.fax ?? ''} onChange={upd('fax')} />
            </div>
            <div>
              <Label>郵便番号</Label>
              <Input value={f.postal_code ?? ''} onChange={upd('postal_code')} placeholder="1020083" />
            </div>
            <div>
              <Label>ご参加人数</Label>
              <Input type="number" min={1} value={f.party_size ?? 1} onChange={(e) => setF((p) => ({ ...p, party_size: Number(e.target.value) || 1 }))} />
            </div>
          </div>
          <div>
            <Label>住所</Label>
            <Input value={f.address ?? ''} onChange={upd('address')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>ご来場予定時間</Label>
              <Input value={f.visit_time ?? ''} onChange={upd('visit_time')} />
            </div>
            <div>
              <Label>同行者 (1行に1名)</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                rows={2}
                value={companionsText}
                onChange={(e) => setCompanionsText(e.target.value)}
                placeholder="同行者がいれば1行ずつ"
              />
            </div>
          </div>
          <div>
            <Label>ご興味・ご相談事項</Label>
            <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={2}
              value={f.interests ?? ''} onChange={(e) => setF((p) => ({ ...p, interests: e.target.value }))} />
          </div>
          <div>
            <Label>運営メモ</Label>
            <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={2}
              value={f.notes ?? ''} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={submit} disabled={pending || !f.name?.trim() || !f.session_label?.trim()}>
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            {initial ? '保存' : '追加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
