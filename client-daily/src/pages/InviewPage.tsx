import { useMemo, useState } from 'react';
import {
  CalendarCheck, Plus, Users, Mail, Phone, Smartphone, Building2, Sparkles,
  CheckCircle2, Circle, Pencil, Trash2, Clock, MapPin, Loader2, Briefcase, ExternalLink,
  Download, ArrowDownUp, User, UserPlus, PieChart,
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
  useInviewList, useCreateInview, useUpdateInview, useCheckInInview, useCheckInInviewCompanion,
  useDeleteInview, usePromoteInview, type InviewInput,
} from '@/lib/inviewApi';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { aiOriginTitle } from '@gmo-onair/shared/src/client/aiAttribution';
import { notifyError, notifySuccess } from '@/lib/notify';
import { PageTitle } from '@gmo-onair/shared/src/client/ui';

// セッション (回) キー
function sessionKey(r: InviewRegistration): string {
  return `${r.session_date ?? ''}${r.session_label}`;
}

// 予約の参加人数 (party_size は代表+同行を含む合計。未設定なら 1 + 同行者数)
function headOf(r: InviewRegistration): number {
  const named = 1 + (r.companions?.length ?? 0);
  return Math.max(r.party_size || 0, named, 1);
}

type SortKey = 'default' | 'company' | 'name' | 'party' | 'checkin';
const SORT_LABELS: Record<SortKey, string> = {
  default: '登録順',
  company: '会社名',
  name: '氏名 (ふりがな)',
  party: '参加人数 (多い順)',
  checkin: '来場状況 (未受付を先に)',
};

function sortRegs(items: InviewRegistration[], key: SortKey): InviewRegistration[] {
  const arr = [...items];
  const byName = (r: InviewRegistration) => (r.furigana || r.name || '').toString();
  switch (key) {
    case 'company':
      return arr.sort((a, b) =>
        (a.company || '￿').localeCompare(b.company || '￿', 'ja') || byName(a).localeCompare(byName(b), 'ja'));
    case 'name':
      return arr.sort((a, b) => byName(a).localeCompare(byName(b), 'ja'));
    case 'party':
      return arr.sort((a, b) => headOf(b) - headOf(a) || byName(a).localeCompare(byName(b), 'ja'));
    case 'checkin':
      return arr.sort((a, b) => (a.checked_in_at ? 1 : 0) - (b.checked_in_at ? 1 : 0) || byName(a).localeCompare(byName(b), 'ja'));
    default:
      return arr; // list() が返す登録順 (created_at ASC) を維持
  }
}

// ── CSV 出力 ────────────────────────────────────────
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADERS = [
  '回日付', '回ラベル', '時間帯', '対象', '区分', '氏名', 'ふりがな', '登録者',
  '会社情報', '役職', 'メール', '電話', '携帯', 'FAX', '郵便番号', '住所',
  '参加人数', '来場予定時間', '興味・ご相談', '運営メモ', '来場状況', '受付者',
  '案件化', '登録元', '登録日時',
];

/** 予約を「参加者ごとの行」に展開して CSV を組み立てる (代表 + 同行者を各1行)。 */
function buildCsv(rows: InviewRegistration[]): string {
  const lines: string[][] = [CSV_HEADERS];
  for (const r of rows) {
    const sessionDate = r.session_date ? formatDateJa(r.session_date) : '';
    const checkin = r.checked_in_at ? '来場済み' : '未受付';
    const promoted = r.promoted_project_id ? '案件化済み' : '';
    const src = r.source === 'kairos3' ? 'AI取込 (メール)' : '手入力';
    const createdAt = r.created_at ? new Date(r.created_at).toLocaleString('ja-JP') : '';
    // 代表 (登録者)
    lines.push([
      sessionDate, r.session_label ?? '', r.session_time ?? '', r.session_audience ?? '',
      '代表', r.name ?? '', r.furigana ?? '', '',
      r.company ?? '', r.role ?? '', r.email ?? '', r.phone ?? '', r.mobile ?? '', r.fax ?? '',
      r.postal_code ?? '', r.address ?? '', String(headOf(r)), r.visit_time ?? '',
      r.interests ?? '', r.notes ?? '', checkin, r.checked_in_by ?? '', promoted, src, createdAt,
    ].map(csvCell));
    // 同行者 (会社・回は代表から継承。来場状況は同行者ごとに個別)
    for (const c of r.companions ?? []) {
      const companionCheckin = c.checked_in_at ? '来場済み' : '未受付';
      lines.push([
        sessionDate, r.session_label ?? '', r.session_time ?? '', r.session_audience ?? '',
        '同行', c.name, '', r.name ?? '',
        r.company ?? '', '', '', '', '', '', '', '', '', '', '', '', companionCheckin, c.checked_in_by ?? '', '', src, '',
      ].map(csvCell));
    }
  }
  return lines.map((cols) => cols.join(',')).join('\r\n');
}

function downloadCsv(rows: InviewRegistration[]) {
  const csv = buildCsv(rows);
  // UTF-8 BOM を付与して Excel での文字化けを防ぐ
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `内覧会来場予約_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function InviewPage() {
  const { canEdit } = usePermissions();
  const [upcoming, setUpcoming] = useState(false);
  const { data: rows, isLoading } = useInviewList({ upcoming });
  const [editing, setEditing] = useState<InviewRegistration | null>(null);
  const [adding, setAdding] = useState(false);
  const [sessionAsc, setSessionAsc] = useState(false); // false = 新しい順 (既定)
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [showSummary, setShowSummary] = useState(false);

  const groups = useMemo(() => {
    const list = rows ?? [];
    const map = new Map<string, { label: string; date: string | null; time: string | null; audience: string | null; items: InviewRegistration[] }>();
    for (const r of list) {
      const k = sessionKey(r);
      if (!map.has(k)) map.set(k, { label: r.session_label, date: r.session_date, time: r.session_time, audience: r.session_audience, items: [] });
      map.get(k)!.items.push(r);
    }
    const arr = Array.from(map.values());
    // 回の並び順 (session_date、未定は末尾)
    arr.sort((a, b) => {
      if (!a.date && !b.date) return a.label.localeCompare(b.label, 'ja');
      if (!a.date) return 1;
      if (!b.date) return -1;
      return sessionAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
    // 回内の参加者並び替え
    for (const g of arr) g.items = sortRegs(g.items, sortKey);
    return arr;
  }, [rows, sessionAsc, sortKey]);

  const totalRegs = rows?.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PageTitle>
            <CalendarCheck className="h-5 w-5 text-primary" />
            内覧会 来場予約
          </PageTitle>
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

      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {/* 表示切替 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setUpcoming(false)}
            className={`rounded-md px-3 py-1.5 ${!upcoming ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}
          >すべて</button>
          <button
            onClick={() => setUpcoming(true)}
            className={`rounded-md px-3 py-1.5 ${upcoming ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'}`}
          >今後の回のみ</button>
        </div>

        <div className="hidden sm:block h-5 w-px bg-border" />

        {/* 回の順序 */}
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-xs">回</span>
          <select
            value={sessionAsc ? 'asc' : 'desc'}
            onChange={(e) => setSessionAsc(e.target.value === 'asc')}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="desc">新しい順</option>
            <option value="asc">古い順</option>
          </select>
        </label>

        {/* 回内の並び替え */}
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={showSummary ? 'default' : 'outline'}
            className="h-8 gap-1 text-xs"
            onClick={() => setShowSummary((v) => !v)}
          >
            <PieChart className="h-3.5 w-3.5" /> 会社別サマリー
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            disabled={!totalRegs}
            onClick={() => downloadCsv(rows ?? [])}
          >
            <Download className="h-3.5 w-3.5" /> CSV出力
          </Button>
        </div>
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
            const headcount = g.items.reduce((a, r) => a + headOf(r), 0);
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
                    <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />来場 {checkedIn}</span>
                  </span>
                </div>
                {/* 回のフル文字列 (抽出前の生ラベル) */}
                {g.label && (g.date ? formatDateJa(g.date) : '') !== g.label && (
                  <p className="text-[11px] text-muted-foreground">{g.label}</p>
                )}
                {/* 会社別サマリー */}
                {showSummary && <CompanySummary items={g.items} />}
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

// 会社名 | 組数 | 参加人数 のサマリー (回内)
function CompanySummary({ items }: { items: InviewRegistration[] }) {
  const summary = useMemo(() => {
    const map = new Map<string, { company: string; regs: number; head: number }>();
    for (const r of items) {
      const key = (r.company || '（会社名なし）').trim() || '（会社名なし）';
      if (!map.has(key)) map.set(key, { company: key, regs: 0, head: 0 });
      const e = map.get(key)!;
      e.regs += 1;
      e.head += headOf(r);
    }
    return Array.from(map.values()).sort((a, b) => b.head - a.head || a.company.localeCompare(b.company, 'ja'));
  }, [items]);
  const totalHead = summary.reduce((a, s) => a + s.head, 0);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" /> 会社別サマリー（{summary.length}社 / {totalHead}名）
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {summary.map((s) => (
          <div key={s.company} className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/50 py-0.5 text-sm">
            <span className="min-w-0 truncate">{s.company}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{s.head}</span> 名
              {s.regs > 1 ? <span className="ml-1 text-[11px]">({s.regs}組)</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttendeeCard({ r, canEdit, onEdit }: { r: InviewRegistration; canEdit: boolean; onEdit: () => void }) {
  const checkIn = useCheckInInview();
  const checkInCompanion = useCheckInInviewCompanion();
  const del = useDeleteInview();
  const promote = usePromoteInview();
  const isKairos = r.source === 'kairos3';
  const isPromoted = !!r.promoted_project_id;
  const companions = r.companions ?? [];
  const head = headOf(r);
  // 氏名が登録されていない同行者 (人数 - 代表1 - 同行者名の数)
  const unnamed = Math.max(head - 1 - companions.length, 0);
  const hasParticipants = companions.length > 0 || head > 1;
  return (
    <Card className={r.checked_in_at ? 'border-success bg-success-surface/30' : ''}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{r.name}</span>
              {r.furigana ? <span className="text-xs text-muted-foreground">{r.furigana}</span> : null}
              <Badge variant="outline" className="text-[11px]"><Users className="h-3 w-3 mr-0.5" />{head}名</Badge>
              {isKairos ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-ai-surface border border-ai px-1.5 py-0.5 text-[10px] text-ai" title={aiOriginTitle('メールから取り込み')}>
                  <Sparkles className="h-3 w-3" />AI取込
                </span>
              ) : null}
              {r.checked_in_at ? (
                <Badge variant="outline" className="gap-1 border-success text-success text-[11px]">
                  <CheckCircle2 className="h-3 w-3" />来場済み
                </Badge>
              ) : null}
              {isPromoted ? (
                <a
                  href={`/sales/projects/${r.promoted_project_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-primary bg-accent px-1.5 py-0.5 text-[10px] text-primary hover:underline"
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
            {/* 参加者 (代表 + 同行者) — 同行者も1人の参加者として表示 */}
            {hasParticipants && (
              <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Users className="h-3 w-3" /> 参加者 {head}名
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs">
                    <User className="h-3 w-3 text-primary" />
                    {r.name}
                    <span className="rounded bg-primary/20 px-1 text-[9px] font-medium text-primary">代表</span>
                  </span>
                  {unnamed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                      ほか {unnamed}名（氏名未登録）
                    </span>
                  )}
                </div>
                {/* 同行者 — 代表とは独立に1人ずつ受付できる */}
                {companions.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {companions.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs ${c.checked_in_at ? 'border-success bg-success-surface/40' : 'border-border bg-background'}`}
                      >
                        <span className="flex min-w-0 items-center gap-1">
                          <UserPlus className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{c.name}</span>
                          <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground">同行</span>
                        </span>
                        {canEdit ? (
                          <Button
                            size="sm"
                            variant={c.checked_in_at ? 'outline' : 'default'}
                            className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                            disabled={checkInCompanion.isPending}
                            onClick={() => checkInCompanion.mutate({ id: r.id, companionId: c.id, checkedIn: !c.checked_in_at })}
                          >
                            {c.checked_in_at ? <><Circle className="h-3 w-3" />取消</> : <><CheckCircle2 className="h-3 w-3" />受付</>}
                          </Button>
                        ) : c.checked_in_at ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" />来場済み</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {r.interests ? <p className="mt-1 text-xs text-foreground whitespace-pre-line">💬 {r.interests}</p> : null}
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
                  className="h-8 gap-1 border-primary text-xs text-primary hover:bg-accent"
                  disabled={promote.isPending}
                  onClick={async () => {
                    if (!(await confirmAction({ title: `${r.company || r.name} を案件化しますか？`, description: `顧客・ヨミ案件・来場の活動記録を作成します。` }))) return;
                    promote.mutate({ id: r.id }, {
                      onSuccess: (res) => {
                        notifySuccess(res.customer_created
                          ? '案件化しました（新規顧客も作成）。案件管理アプリでヨミ案件を確認できます。'
                          : '案件化しました。案件管理アプリでヨミ案件を確認できます。');
                      },
                      onError: (e: unknown) => {
                        const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
                        notifyError(`案件化に失敗しました: ${msg || '不明なエラー'}`);
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
                  onClick={async () => { if ((await confirmAction({ title: `${r.name} さんの来場予約を削除しますか？`, confirmLabel: '削除する', tone: 'danger' }))) del.mutate(r.id); }}>
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
    companions: (initial?.companions ?? []).map((c) => c.name),
    visit_time: initial?.visit_time ?? '',
    interests: initial?.interests ?? '',
    notes: initial?.notes ?? '',
  });
  const [companionsText, setCompanionsText] = useState((initial?.companions ?? []).map((c) => c.name).join('\n'));
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
              <p className="mt-1 text-[11px] text-muted-foreground">氏名を入れると各同行者が1人の参加者として表示されます</p>
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
