import { useMemo, useState } from 'react';
import {
  KeyRound, ShieldCheck, DoorOpen, Search, ArrowRightLeft, Undo2, Loader2,
  Building2, User, CalendarClock, AlertTriangle, CheckCircle2, X, Pencil, Table2, History, LayoutGrid, CircleUserRound,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { formatDateJa } from '@/lib/types';
import {
  SECURITY_AREAS, useSecurityCards, useSecurityCardStats, useCardLendings, useOnairUsers,
  useLendCard, useReturnCard, useUpdateCard, todayStr, fmtMd,
  type SecurityCard, type Lending, type LendInput,
} from '@/lib/securityCardApi';
import { Delayed, EmptyState, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { PageTitle } from '@gmo-onair/shared/src/client/ui';

const STUDIO_LABEL = 'GMOサムライスタジオ用賀';

/*
 * レベルごとの色。**どのレベルが「危ない」わけでもない**ので、
 * 状態の色 (destructive / warning) ではなく「見分けるための色」を使う
 * (`cat-1`〜`cat-8`。tokens.css)。AI 用の紫 (`ai`) も使わない。
 */
const LEVEL_STYLE: Record<string, string> = {
  master: 'bg-cat-7/10 text-cat-7 border-cat-7/40',
  room_a: 'bg-cat-1/10 text-cat-1 border-cat-1/40',
  room_b: 'bg-cat-3/10 text-cat-3 border-cat-3/40',
  room_c: 'bg-cat-5/10 text-cat-5 border-cat-5/40',
  meeting: 'bg-muted text-muted-foreground border-border',
  vip: 'bg-cat-6/10 text-cat-6 border-cat-6/40',
};

function enabledAreaLabels(access: Record<string, boolean>): string[] {
  return SECURITY_AREAS.filter((a) => access[a.key]).map((a) => a.label);
}

// ── ステータスバッジ ───────────────────────────────────────
function StatusBadge({ card }: { card: SecurityCard }) {
  if (card.status === 'available') {
    return (
      <Badge variant="outline" className="gap-1 border-success bg-success-surface text-success">
        <CheckCircle2 className="h-3 w-3" /> 利用可能
      </Badge>
    );
  }
  if (card.overdue) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive bg-destructive-surface text-destructive">
        <AlertTriangle className="h-3 w-3" /> 返却期限超過
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-warning bg-warning-surface text-warning-strong">
      <ArrowRightLeft className="h-3 w-3" /> 貸出中
    </Badge>
  );
}

// ── カードタイル ───────────────────────────────────────────
function CardTile({ card, onOpen }: { card: SecurityCard; onOpen: () => void }) {
  const labels = enabledAreaLabels(card.access);
  const isMaster = card.security_level === 'master';
  return (
    <button
      onClick={onOpen}
      className="group text-left rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-base font-bold ${LEVEL_STYLE[card.security_level] ?? 'bg-muted text-foreground border-border'}`}>
            {card.card_no}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground">No.{card.card_no}</div>
            <div className="text-sm font-semibold truncate">{card.level_label}</div>
          </div>
        </div>
        <StatusBadge card={card} />
      </div>

      {/* 解錠できる部屋 */}
      <div className="mt-3 flex flex-wrap gap-1">
        {isMaster ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-cat-7/10 px-1.5 py-0.5 text-[11px] font-medium text-cat-7">
            <ShieldCheck className="h-3 w-3" /> 全エリア (マスター)
          </span>
        ) : (
          labels.map((l) => (
            <span key={l} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {l}
            </span>
          ))
        )}
      </div>

      {/* 貸出中の情報 */}
      {card.status === 'lent' && (
        <div className={`mt-3 rounded-lg border px-2.5 py-2 text-xs ${card.overdue ? 'border-destructive bg-destructive-surface/60' : 'border-warning bg-warning-surface/60'}`}>
          <div className="flex items-center gap-1 font-medium text-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{card.borrower_company || '（会社名なし）'}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{card.borrower_person}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
            <CalendarClock className="h-3 w-3 shrink-0" />
            <span>{fmtMd(card.lent_on)} 〜 {card.due_on ? `${fmtMd(card.due_on)} 返却予定` : '返却予定日なし'}</span>
          </div>
        </div>
      )}

      {!card.is_active && (
        <div className="mt-2 text-[11px] text-destructive">※ 運用対象外 (紛失/廃止)</div>
      )}
    </button>
  );
}

// ── 貸出フォーム ───────────────────────────────────────────
function LendForm({ card, onDone }: { card: SecurityCard; onDone: () => void }) {
  const { currentUser } = useAuth();
  const users = useOnairUsers();
  const lend = useLendCard();
  const [company, setCompany] = useState('');
  const [person, setPerson] = useState('');
  const [contact, setContact] = useState('');
  const [purpose, setPurpose] = useState('');
  const [lentOn, setLentOn] = useState(todayStr());
  const [dueOn, setDueOn] = useState('');
  const [handlerId, setHandlerId] = useState(currentUser?.id ?? '');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    if (!person.trim()) { setErr('貸出先の担当者は必須です'); return; }
    const handler = users.data?.find((u) => u.id === handlerId);
    const input: LendInput = {
      borrower_person: person.trim(),
      borrower_company: company.trim() || null,
      borrower_contact: contact.trim() || null,
      purpose: purpose.trim() || null,
      lent_on: lentOn || todayStr(),
      due_on: dueOn || null,
      lent_by_user_id: handlerId || currentUser?.id || null,
      lent_by_name: handler?.name ?? currentUser?.name ?? null,
      notes: notes.trim() || null,
    };
    lend.mutate({ id: card.id, input }, {
      onSuccess: onDone,
      onError: (e: any) => setErr(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? '貸出に失敗しました'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">No.{card.card_no}・{card.level_label}</span> を貸し出します
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">貸出先の会社</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="例：株式会社〇〇" />
        </div>
        <div>
          <Label className="text-xs">担当者 <span className="text-destructive">*</span></Label>
          <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="例：山田 太郎" />
        </div>
        <div>
          <Label className="text-xs">連絡先</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="電話 / メール" />
        </div>
        <div>
          <Label className="text-xs">利用目的</Label>
          <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：収録立ち会い" />
        </div>
        <div>
          <Label className="text-xs">貸出日</Label>
          <Input type="date" value={lentOn} onChange={(e) => setLentOn(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">返却予定日</Label>
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs flex items-center gap-1"><CircleUserRound className="h-3.5 w-3.5" /> 貸出対応者 (ONAiR メンバー)</Label>
          <select
            value={handlerId}
            onChange={(e) => setHandlerId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {!currentUser && <option value="">選択してください</option>}
            {users.data?.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs">メモ</Label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
            placeholder="任意"
          />
        </div>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>キャンセル</Button>
        <Button onClick={submit} disabled={lend.isPending} className="gap-1.5">
          {lend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
          貸し出す
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── 返却フォーム ───────────────────────────────────────────
function ReturnForm({ card, onDone }: { card: SecurityCard; onDone: () => void }) {
  const ret = useReturnCard();
  const [returnedOn, setReturnedOn] = useState(todayStr());
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');

  const submit = () => {
    ret.mutate({ id: card.id, input: { returned_on: returnedOn || todayStr(), notes: notes.trim() || null } }, {
      onSuccess: onDone,
      onError: (e: any) => setErr(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? '返却に失敗しました'),
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-warning-surface border border-warning px-3 py-2.5 text-xs">
        <div className="font-medium text-foreground">No.{card.card_no}・{card.level_label} を返却します</div>
        <div className="mt-1 text-muted-foreground">
          貸出先: {card.borrower_company || '（会社名なし）'} / {card.borrower_person}<br />
          貸出日: {fmtMd(card.lent_on)}{card.due_on ? ` ・返却予定 ${fmtMd(card.due_on)}` : ''}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">返却日</Label>
          <Input type="date" value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} />
        </div>
      </div>
      <div>
        <Label className="text-xs">返却時のメモ</Label>
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
          placeholder="任意"
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>キャンセル</Button>
        <Button onClick={submit} disabled={ret.isPending} className="gap-1.5">
          {ret.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
          返却する
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── 詳細ダイアログ ─────────────────────────────────────────
type DetailMode = 'view' | 'lend' | 'return' | 'edit';

function DetailDialog({ card, canEdit, onClose }: { card: SecurityCard; canEdit: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<DetailMode>('view');
  const history = useCardLendings({ card_id: card.id }, mode === 'view');
  const update = useUpdateCard();
  const [label, setLabel] = useState(card.label ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [isActive, setIsActive] = useState(card.is_active);

  const saveEdit = () => {
    update.mutate({ id: card.id, fields: { label: label.trim() || null, notes: notes.trim() || null, is_active: isActive } }, {
      onSuccess: () => setMode('view'),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm font-bold ${LEVEL_STYLE[card.security_level] ?? 'bg-muted border-border'}`}>{card.card_no}</span>
            <span>セキュリティカード No.{card.card_no}</span>
          </DialogTitle>
        </DialogHeader>

        {mode === 'lend' && <LendForm card={card} onDone={() => setMode('view')} />}
        {mode === 'return' && <ReturnForm card={card} onDone={() => setMode('view')} />}

        {mode === 'edit' && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">表示名 / メモ (任意)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：貸出用 予備" />
            </div>
            <div>
              <Label className="text-xs">備考</Label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              運用対象にする (オフ = 紛失/廃止で貸出不可)
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMode('view')}>キャンセル</Button>
              <Button onClick={saveEdit} disabled={update.isPending}>保存</Button>
            </DialogFooter>
          </div>
        )}

        {mode === 'view' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${LEVEL_STYLE[card.security_level] ?? 'bg-muted border-border'}`}>
                <KeyRound className="h-3 w-3" /> {card.level_label}
              </span>
              <StatusBadge card={card} />
            </div>

            {/* アクセス一覧 (このカードで解錠できる部屋) */}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">解錠できる部屋</div>
              <div className="grid grid-cols-2 gap-1.5">
                {SECURITY_AREAS.map((a) => {
                  const ok = !!card.access[a.key];
                  return (
                    <div key={a.key} className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${ok ? 'border-success bg-success-surface text-success' : 'border-border bg-muted/40 text-muted-foreground line-through'}`}>
                      {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" /> : <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="truncate">{a.label}</span>
                      <span className="ml-auto text-[10px] opacity-60">{a.floor}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 現在の貸出 */}
            {card.status === 'lent' && (
              <div className={`rounded-lg border px-3 py-2.5 text-sm ${card.overdue ? 'border-destructive bg-destructive-surface/60' : 'border-warning bg-warning-surface/60'}`}>
                <div className="text-xs font-semibold text-muted-foreground mb-1">現在の貸出</div>
                <div className="flex items-center gap-1.5"><Building2 className="h-4 w-4 text-muted-foreground" />{card.borrower_company || '（会社名なし）'}</div>
                <div className="flex items-center gap-1.5 mt-0.5"><User className="h-4 w-4 text-muted-foreground" />{card.borrower_person}{card.borrower_contact ? `（${card.borrower_contact}）` : ''}</div>
                <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground"><CalendarClock className="h-4 w-4" />{fmtMd(card.lent_on)} 〜 {card.due_on ? `${fmtMd(card.due_on)} 返却予定` : '返却予定日なし'}{card.overdue ? ' ・期限超過' : ''}</div>
                {card.lent_by_name && <div className="mt-0.5 text-xs text-muted-foreground">対応: {card.lent_by_name}</div>}
                {card.purpose && <div className="mt-0.5 text-xs text-muted-foreground">目的: {card.purpose}</div>}
              </div>
            )}

            {/* アクション */}
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {card.status === 'available' ? (
                  <Button onClick={() => setMode('lend')} disabled={!card.is_active} className="gap-1.5 flex-1">
                    <ArrowRightLeft className="h-4 w-4" /> 貸し出す
                  </Button>
                ) : (
                  <Button onClick={() => setMode('return')} variant="default" className="gap-1.5 flex-1">
                    <Undo2 className="h-4 w-4" /> 返却する
                  </Button>
                )}
                <Button variant="outline" onClick={() => setMode('edit')} className="gap-1.5">
                  <Pencil className="h-4 w-4" /> 編集
                </Button>
              </div>
            )}

            {/* 貸出履歴 */}
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">貸出履歴</div>
              {history.isLoading ? (
                <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
              ) : (history.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">このカードはまだ貸し出されていません。</p>
              ) : (
                <ul className="space-y-1.5">
                  {(history.data ?? []).map((h) => (
                    <li key={h.id} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{h.borrower_company || '（会社名なし）'} / {h.borrower_person}</span>
                        {h.status === 'active' ? (
                          <Badge variant="outline" className="border-warning text-warning-strong shrink-0">貸出中</Badge>
                        ) : (
                          <Badge variant="outline" className="border-border text-muted-foreground shrink-0">返却済</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        {fmtMd(h.lent_on)} 〜 {h.returned_on ? `${fmtMd(h.returned_on)} 返却` : (h.due_on ? `${fmtMd(h.due_on)} 返却予定` : '返却予定日なし')}
                        {h.lent_by_name ? ` ・貸出対応 ${h.lent_by_name}` : ''}
                        {h.returned_by_name ? ` / 返却対応 ${h.returned_by_name}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── アクセス一覧表 (仕様書の ◯/✗ グリッド) ─────────────────
function AccessMatrixTable({ cards }: { cards: SecurityCard[] }) {
  const floors = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of SECURITY_AREAS) map[a.floor] = (map[a.floor] ?? 0) + 1;
    return map;
  }, []);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-[820px] w-full text-xs">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-10 bg-muted/60 px-2 py-1.5 text-left font-semibold">No.</th>
            <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">レベル</th>
            {Object.entries(floors).map(([floor, span]) => (
              <th key={floor} colSpan={span} className="px-2 py-1 text-center font-semibold border-l border-border">{floor}</th>
            ))}
          </tr>
          <tr className="bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/40 px-2 py-1.5" />
            <th className="px-2 py-1.5" />
            {SECURITY_AREAS.map((a, i) => (
              <th key={a.key} className={`px-2 py-1.5 text-center font-medium whitespace-nowrap ${i === 0 || a.floor !== SECURITY_AREAS[i - 1].floor ? 'border-l border-border' : ''}`}>
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.id} className="border-t border-border hover:bg-muted/30">
              <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-bold">{c.card_no}</td>
              <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{c.level_label}</td>
              {SECURITY_AREAS.map((a, i) => (
                <td key={a.key} className={`px-2 py-1.5 text-center ${i === 0 || a.floor !== SECURITY_AREAS[i - 1].floor ? 'border-l border-border' : ''}`}>
                  {c.access[a.key]
                    ? <span className="text-success font-bold">◯</span>
                    : <span className="text-muted-foreground">✕</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 貸出履歴タブ ───────────────────────────────────────────
function HistoryTab() {
  const [status, setStatus] = useState<'all' | 'active' | 'returned'>('all');
  const lendings = useCardLendings(status === 'all' ? {} : { status });
  const rows = lendings.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'active', 'returned'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${status === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
            {s === 'all' ? 'すべて' : s === 'active' ? '貸出中' : '返却済'}
          </button>
        ))}
      </div>
      {lendings.isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title="貸出の履歴はまだありません"
          description="カードを貸し出すと、誰にいつ渡して いつ返ってきたかがここに並びます。"
        />
      ) : (
        <div className="space-y-2">
          {rows.map((h: Lending) => (
            <Card key={h.id}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">{h.card_no}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{h.borrower_company || '（会社名なし）'} / {h.borrower_person}</div>
                      <div className="text-xs text-muted-foreground">{h.level_label}</div>
                    </div>
                  </div>
                  {h.status === 'active' ? (
                    h.overdue
                      ? <Badge variant="outline" className="border-destructive text-destructive shrink-0">期限超過</Badge>
                      : <Badge variant="outline" className="border-warning text-warning-strong shrink-0">貸出中</Badge>
                  ) : (
                    <Badge variant="outline" className="border-border text-muted-foreground shrink-0">返却済</Badge>
                  )}
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  {formatDateJa(h.lent_on)} 〜 {h.returned_on ? `${formatDateJa(h.returned_on)} 返却` : (h.due_on ? `${formatDateJa(h.due_on)} 返却予定` : '返却予定日なし')}
                  {h.lent_by_name ? ` ・貸出対応 ${h.lent_by_name}` : ''}
                  {h.returned_by_name ? ` / 返却対応 ${h.returned_by_name}` : ''}
                  {h.purpose ? ` ・目的 ${h.purpose}` : ''}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ページ本体 ─────────────────────────────────────────────
export default function SecurityCardsPage() {
  const { canEdit } = usePermissions();
  const cardsQuery = useSecurityCards();
  const stats = useSecurityCardStats();
  const [filter, setFilter] = useState<'all' | 'available' | 'lent'>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const allCards = useMemo(() => cardsQuery.data ?? [], [cardsQuery.data]);
  const filtered = useMemo(() => {
    let out = allCards;
    if (filter !== 'all') out = out.filter((c) => c.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((c) =>
        String(c.card_no).includes(q) ||
        c.level_label.toLowerCase().includes(q) ||
        (c.borrower_company ?? '').toLowerCase().includes(q) ||
        (c.borrower_person ?? '').toLowerCase().includes(q));
    }
    return out;
  }, [allCards, filter, search]);

  const openCard = allCards.find((c) => c.id === openId) ?? null;
  const s = stats.data;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      {/* ヘッダー */}
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></div>
          <div>
            <PageTitle>セキュリティカード管理</PageTitle>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><DoorOpen className="h-3 w-3" />{STUDIO_LABEL}</p>
          </div>
        </div>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard label="カード総数" value={s?.total ?? 24} tone="default" icon={<KeyRound className="h-4 w-4" />} />
        <StatCard label="利用可能" value={s?.available ?? 0} tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="貸出中" value={s?.lent ?? 0} tone="amber" icon={<ArrowRightLeft className="h-4 w-4" />} />
        <StatCard label="返却期限超過" value={s?.overdue ?? 0} tone="red" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="cards">
        <TabsList>
          <TabsTrigger value="cards" className="gap-1.5"><LayoutGrid className="h-4 w-4" /> カード</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History className="h-4 w-4" /> 貸出履歴</TabsTrigger>
          <TabsTrigger value="matrix" className="gap-1.5"><Table2 className="h-4 w-4" /> アクセス表</TabsTrigger>
        </TabsList>

        {/* カード一覧 */}
        <TabsContent value="cards" className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex gap-1.5">
              {(['all', 'available', 'lent'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                  {f === 'all' ? 'すべて' : f === 'available' ? '利用可能' : '貸出中'}
                </button>
              ))}
            </div>
            <div className="relative sm:ml-auto sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="番号 / 会社 / 担当者で検索" className="pl-8" />
            </div>
          </div>

          {cardsQuery.isLoading ? (
            <Delayed><SkeletonRows rows={4} /></Delayed>
          ) : filtered.length === 0 ? (
            <NoSearchResults keyword={search || undefined} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((c) => (
                <CardTile key={c.id} card={c} onOpen={() => setOpenId(c.id)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="pt-2">
          <HistoryTab />
        </TabsContent>

        <TabsContent value="matrix" className="pt-2 space-y-2">
          <p className="text-xs text-muted-foreground">◯ = 解錠可 / ✕ = 解錠不可。セキュリティレベルに応じて貸し出すカードを選びます。</p>
          <AccessMatrixTable cards={allCards} />
        </TabsContent>
      </Tabs>

      {openCard && <DetailDialog card={openCard} canEdit={canEdit} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function StatCard({ label, value, tone, icon }: { label: string; value: number; tone: 'default' | 'emerald' | 'amber' | 'red'; icon: React.ReactNode }) {
  const toneClass = {
    default: 'text-foreground',
    emerald: 'text-success',
    amber: 'text-warning-strong',
    red: value > 0 ? 'text-destructive' : 'text-muted-foreground',
  }[tone];
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
