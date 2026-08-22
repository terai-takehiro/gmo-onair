/**
 * ⑦ 貸出・返却 ／ 貸出を登録する (2段階)
 *
 *   ①機材を選ぶ (種別のタブ ＋ カード) → ②借りる人と日付を入れる
 *
 * 2段階なのは、現場では**先に機材を並べてから誰が持つかを決める**ためです
 * (1画面にすると、選んでいる最中に上の入力欄が邪魔になる)。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, Loader2, Search, X } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { TYPE_CODES } from '@/lib/constants';

export interface LendableItem {
  id: string;
  name: string;
  eq_code: string;
  unit_number: number | null;
  equipment_type_code: string;
  location_name: string | null;
  parent_id: string | null;
  current_lending?: unknown;
}

export interface LendingPayload {
  equipment_ids: string[];
  borrower_name: string;
  purpose: string;
  lent_at: string;
  due_date: string | null;
  notes: string;
  project_id: string | null;
  /** 出庫予定日 (migration 168)。入れると「予定」の行になり、まだ持ち出していない扱いになる */
  planned_out_date: string | null;
}

const today = () => new Date().toISOString().split('T')[0];

export function LendingDialog({ open, saving, error, onClose, onSubmit }: {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: LendingPayload) => void;
}) {
  const [step, setStep] = useState<'select' | 'form'>('select');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [typeTab, setTypeTab] = useState('');
  const [kind, setKind] = useState<'standalone' | 'program'>('standalone');
  const [projectSearch, setProjectSearch] = useState('');
  const [form, setForm] = useState({
    borrower_name: '', purpose: '', lent_at: today(), due_date: '', notes: '', project_id: '',
  });
  /** 出庫予定として登録するか (migration 168)。入だと「まだ持ち出していない」行になる */
  const [planned, setPlanned] = useState(false);

  const lendable = useQuery({
    queryKey: ['equipment-lendable'],
    queryFn: async () => (await api.get('/equipment/items', {
      params: { is_rental_listed: 'true', status: 'active', include_children: '1' },
    })).data.data as LendableItem[],
    enabled: open,
    staleTime: 30_000,
  });
  const items = useMemo(() => lendable.data ?? [], [lendable.data]);

  const projects = useQuery({
    queryKey: ['equipment-projects', projectSearch],
    queryFn: async () => (await api.get('/equipment/projects', { params: { search: projectSearch } })).data.data,
    enabled: open && kind === 'program' && projectSearch.length >= 1,
  });

  const childrenMap = useMemo(() => {
    const map = new Map<string, LendableItem[]>();
    for (const item of items) {
      if (!item.parent_id) continue;
      if (!map.has(item.parent_id)) map.set(item.parent_id, []);
      map.get(item.parent_id)!.push(item);
    }
    return map;
  }, [items]);

  const parents = useMemo(() => items.filter((i) => !i.parent_id), [items]);
  const availableTypes = useMemo(() => {
    const codes = new Set(parents.map((i) => i.equipment_type_code));
    return TYPE_CODES.filter((t) => codes.has(t.code));
  }, [parents]);
  const shown = typeTab ? parents.filter((i) => i.equipment_type_code === typeTab) : parents;
  const selected = parents.filter((i) => selectedIds.has(i.id));

  const toggle = (item: LendableItem) => {
    if (item.current_lending) return;
    const kids = childrenMap.get(item.id) ?? [];
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
        kids.forEach((c) => next.delete(c.id));
      } else {
        next.add(item.id);
        kids.filter((c) => !c.current_lending).forEach((c) => next.add(c.id));
      }
      return next;
    });
  };

  const reset = () => {
    setStep('select');
    setSelectedIds(new Set());
    setTypeTab('');
    setKind('standalone');
    setProjectSearch('');
    setForm({ borrower_name: '', purpose: '', lent_at: today(), due_date: '', notes: '', project_id: '' });
    setPlanned(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}
      title={step === 'select' ? '持ち出す機材を選ぶ' : '借りる人と日付'}
      // 旧実装は `sm:max-w-2xl`（672px）で PC 幅を広く取っていた複合画面
      // （選択ステップの機材カードが `grid-cols-3`・入力ステップの日付欄が
      // `sm:grid-cols-2`）なので、既定の640pxに押し込めず `wide` を渡す
      wide
      footer={
        step === 'select' ? (
          <div className="flex w-full flex-col gap-2">
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((item) => (
                  <span key={item.id} className="inline-flex items-center gap-1 rounded-chip bg-primary-surface px-2 py-0.5 text-sub-sm text-primary">
                    {item.name}{item.unit_number != null ? ` No.${item.unit_number}` : ''}
                    <button type="button" onClick={() => toggle(item)} aria-label={`${item.name} を外す`}>
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sub text-muted-foreground">
                {selected.length > 0 ? `${selected.length} 台を選んでいます` : '機材を押して選びます'}
              </span>
              <Button disabled={selected.length === 0} onClick={() => setStep('form')}>
                次へ ({selected.length} 台)
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full justify-between gap-2">
            <Button variant="outline" onClick={() => setStep('select')}>機材を選び直す</Button>
            <Button
              onClick={() => onSubmit({
                equipment_ids: Array.from(selectedIds),
                borrower_name: form.borrower_name,
                purpose: form.purpose,
                lent_at: form.lent_at,
                notes: form.notes,
                due_date: form.due_date || null,
                project_id: kind === 'program' ? (form.project_id || null) : null,
                planned_out_date: planned ? (form.lent_at || null) : null,
              })}
              disabled={!form.borrower_name || (kind === 'program' && !form.project_id) || saving}
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {selectedIds.size} 台を{planned ? '出庫予定に入れる' : '貸出として記録'}
            </Button>
          </div>
        )
      }
    >
      {error && (
        <p className="mb-3 rounded-control border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
          {error}
        </p>
      )}

      {step === 'select' ? (
        <div className="flex flex-col gap-3">
          <div className="sticky top-0 z-10 -mt-1 flex gap-1.5 overflow-x-auto border-b border-border bg-card py-2.5">
            <button
              type="button"
              onClick={() => setTypeTab('')}
              className={cn(
                'min-h-tap shrink-0 rounded-chip px-3 text-sub lg:min-h-[36px]',
                !typeTab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-background',
              )}
            >
              すべて {parents.length}
            </button>
            {availableTypes.map((t) => (
              <button
                key={t.code}
                type="button"
                onClick={() => setTypeTab(t.code)}
                className={cn(
                  'min-h-tap shrink-0 rounded-chip px-3 text-sub lg:min-h-[36px]',
                  typeTab === t.code ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-background',
                )}
              >
                {t.label} {parents.filter((i) => i.equipment_type_code === t.code).length}
              </button>
            ))}
          </div>

          {lendable.isLoading ? (
            <p className="py-12 text-center text-sub text-muted-foreground">
              <Loader2 className="mr-2 inline h-5 w-5 animate-spin" aria-hidden="true" />読み込んでいます
            </p>
          ) : shown.length === 0 ? (
            <EmptyState
              title="持ち出せる機材がありません"
              description="設定の「貸出の決めごと」で貸出可にした、稼働中の機材だけが出ます。"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shown.map((item) => {
                const on = selectedIds.has(item.id);
                const lent = !!item.current_lending;
                const kids = childrenMap.get(item.id)?.length ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={lent}
                    onClick={() => toggle(item)}
                    aria-pressed={on}
                    className={cn(
                      'min-h-tap relative w-full rounded-card border p-2.5 text-left text-sub',
                      on ? 'border-primary bg-primary-surface' : 'border-border hover:bg-muted',
                      lent && 'cursor-not-allowed bg-muted opacity-50',
                    )}
                  >
                    {on && (
                      <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-chip bg-primary">
                        <Check className="h-2.5 w-2.5 text-primary-foreground" aria-hidden="true" />
                      </span>
                    )}
                    <span className="line-clamp-2 block pr-5 text-list">{item.name}</span>
                    <span className="font-number mt-1 block text-sub-sm text-muted-foreground">
                      {item.unit_number != null ? `No.${item.unit_number}` : item.eq_code}
                    </span>
                    {item.location_name && (
                      <span className="mt-0.5 block truncate text-sub-sm text-muted-foreground">{item.location_name}</span>
                    )}
                    {kids > 0 && <span className="mt-1 block text-note text-primary">付属品 {kids} 点も一緒</span>}
                    {lent && <span className="mt-1 block text-note text-warning">いま貸出中</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-card border border-border bg-muted px-3 py-2.5">
            <p className="mb-1.5 text-th text-muted-foreground">持ち出す機材 ({selected.length} 台)</p>
            <div className="flex flex-wrap gap-1.5">
              {selected.map((item) => (
                <span key={item.id} className="rounded-chip bg-primary-surface px-2 py-0.5 text-sub-sm text-primary">
                  {item.name}{item.unit_number != null ? ` No.${item.unit_number}` : ''}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>貸出の種類</Label>
            <div className="grid grid-cols-2 gap-2">
              {([['standalone', '単独で持ち出す'], ['program', '案件で使う']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={kind === v}
                  className={cn(
                    'min-h-tap rounded-card border px-3 text-sub lg:min-h-[40px]',
                    kind === v ? 'border-primary bg-primary-surface text-primary' : 'border-border hover:bg-muted',
                  )}
                  onClick={() => { setKind(v); if (v === 'standalone') setForm((f) => ({ ...f, project_id: '' })); }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {kind === 'program' && (
            <div className="space-y-1">
              <Label>案件 (GLS) *</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="pl-9"
                  placeholder="GLS番号か案件名で探す"
                  value={projectSearch}
                  onChange={(e) => {
                    setProjectSearch(e.target.value);
                    if (!e.target.value) setForm((f) => ({ ...f, project_id: '' }));
                  }}
                />
              </div>
              {(projects.data ?? []).length > 0 && !form.project_id && (
                <div className="max-h-32 overflow-y-auto rounded-control border border-border">
                  {(projects.data as { id: string; gls_number: string; name: string }[]).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="min-h-tap w-full px-3 text-left text-sub hover:bg-muted lg:min-h-[36px]"
                      onClick={() => { setForm((f) => ({ ...f, project_id: p.id })); setProjectSearch(`${p.gls_number} ${p.name}`); }}
                    >
                      <span className="font-number text-primary">{p.gls_number}</span>
                      <span className="ml-2">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {form.project_id && (
                <Button
                  variant="ghost"
                  onClick={() => { setForm((f) => ({ ...f, project_id: '' })); setProjectSearch(''); }}
                >
                  案件を選び直す
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label>借りる人 *</Label>
            <Input
              value={form.borrower_name}
              onChange={(e) => setForm((f) => ({ ...f, borrower_name: e.target.value }))}
              placeholder="氏名"
            />
          </div>
          <div className="space-y-1">
            <Label>使いみち</Label>
            <Input
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="夏フェス 中継"
            />
          </div>
          {/* **予定と実物を分ける** (migration 168)。予定の行は「まだ外に出ていない」ので、
              貸出中の一覧には出ず、ダッシュボードの「今日/明日 出す」に出る。
              入れておかないと、先の予定を入れた瞬間に「いま貸出中」になってしまう */}
          <label className="flex min-h-tap cursor-pointer items-start gap-2 rounded-control border border-border bg-surface-subtle p-3 lg:min-h-[44px]">
            <input
              type="checkbox"
              checked={planned}
              onChange={(e) => setPlanned(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span className="min-w-0">
              <span className="text-list block">まだ持ち出さない（出庫の予定として登録する）</span>
              <span className="text-sub-sm block text-muted-foreground">
                予定のあいだは「貸出中」になりません。出した日に一覧の「出した」を押します
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{planned ? '出庫の予定日' : '持ち出す日'}</Label>
              <Input type="date" value={form.lent_at} onChange={(e) => setForm((f) => ({ ...f, lent_at: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>返す予定の日</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          <p className="text-note text-muted-foreground">
            返す予定の日は空でも登録できます。入れておくと、過ぎたときにダッシュボードに出ます。
          </p>
        </div>
      )}
    </FormDialog>
  );
}
