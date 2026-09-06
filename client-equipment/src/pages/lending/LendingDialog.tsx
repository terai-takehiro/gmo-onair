/**
 * ⑦ 貸出・返却 ／ 貸出を登録する (2段階)
 *
 *   ①機材を選ぶ (種別のタブ ＋ カード) → ②借りる人と日付を入れる
 *
 * 2段階なのは、現場では**先に機材を並べてから誰が持つかを決める**ためです
 * (1画面にすると、選んでいる最中に上の入力欄が邪魔になる)。
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDebounced } from '@/hooks/useDebounced';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { localDateStr } from '@gmo-onair/shared/src/client/format';
import { LendingSelectStep } from './LendingSelectStep';
import type { LendableItem } from './types';

export interface LendingPayload {
  equipment_ids: string[];
  borrower_name: string;
  purpose: string;
  lent_at: string;
  due_date: string | null;
  notes: string;
  project_id: string | null;
  /** 持ち出し予定日 (migration 168)。入れると「予定」の行になり、まだ持ち出していない扱いになる */
  planned_out_date: string | null;
}

// UTC の日付 (toISOString) だと JST の 0〜9 時に前日になる
const today = () => localDateStr(new Date());

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
  /** 1段目の「名前・機材IDで探す」。種別タブと同じく親が持つ（次へ→選び直しで消えないように） */
  const [itemSearch, setItemSearch] = useState('');
  const [kind, setKind] = useState<'standalone' | 'program'>('standalone');
  const [projectSearch, setProjectSearch] = useState('');
  const [form, setForm] = useState({
    borrower_name: '', purpose: '', lent_at: today(), due_date: '', notes: '', project_id: '',
  });
  /** 持ち出し予定として登録するか (migration 168)。入だと「まだ持ち出していない」行になる */
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

  // 1キーストロークごとに問い合わせない (台帳の検索と同じ 400ms)。
  // 選択済み (`form.project_id` あり) の間は、選択でラベルを入力欄へ書き戻した分の
  // 問い合わせも含めて止める
  const debouncedProjectSearch = useDebounced(projectSearch);
  const projects = useQuery({
    queryKey: ['equipment-projects', debouncedProjectSearch],
    queryFn: async () => (await api.get('/equipment/projects', { params: { search: debouncedProjectSearch } })).data.data,
    enabled: open && kind === 'program' && !form.project_id && debouncedProjectSearch.length >= 1,
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
    setItemSearch('');
    setKind('standalone');
    setProjectSearch('');
    setForm({ borrower_name: '', purpose: '', lent_at: today(), due_date: '', notes: '', project_id: '' });
    setPlanned(false);
  };

  // 親が成功時に open を直接 false へ切り替える経路では Radix の onOpenChange が
  // 呼ばれないため、閉じたら必ずここで初期化する (残ると次回、前回の機材・氏名の
  // まま再送できてしまう)
  // open のみ依存にしたいので reset は依存に入れない（毎レンダー再生成される純関数）
  useEffect(() => { if (!open) reset(); }, [open]);

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
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
              {selectedIds.size} 台を{planned ? '持ち出し予定にする' : '貸出を記録'}
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
        <LendingSelectStep
          loading={lendable.isLoading}
          parents={parents}
          childrenMap={childrenMap}
          selectedIds={selectedIds}
          typeTab={typeTab}
          onTypeTabChange={setTypeTab}
          onToggle={toggle}
          search={itemSearch}
          onSearchChange={setItemSearch}
        />
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

          {/* **借りる人がいちばん上**。現場の順は「機材 → 誰に → いつ返す」で、
              必ず埋めるのはこの欄。「案件で使う」を選ぶと検索欄・候補・選び直しが
              下に伸びるので、これより上に置くとスマホで氏名が折り返しの下へ落ちる */}
          <div className="space-y-1">
            <Label>借りる人 *</Label>
            <Input
              value={form.borrower_name}
              onChange={(e) => setForm((f) => ({ ...f, borrower_name: e.target.value }))}
              placeholder="氏名"
            />
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

          {/* **予定と実物を分ける** (migration 168)。予定の行は「まだ外に出ていない」ので、
              貸出中の一覧には出ず、ダッシュボードの「今日 出す／明日 出す」に出る。
              入れておかないと、先の予定を入れた瞬間に「いま貸出中」になってしまう */}
          <label className="flex min-h-tap cursor-pointer items-start gap-2 rounded-control border border-border bg-surface-subtle p-3 lg:min-h-[44px]">
            <input
              type="checkbox"
              checked={planned}
              onChange={(e) => setPlanned(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span className="min-w-0">
              <span className="text-list block">持ち出しの予定として登録する</span>
              <span className="text-sub-sm block text-muted-foreground">
                予定のあいだは「貸出中」になりません。持ち出した日に一覧の「持ち出した」を押します
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{planned ? '持ち出しの予定日' : '持ち出す日'}</Label>
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

          {/* 使いみちは任意。必須（借りる人・案件）と日付のあいだに挟むと
              そこで手が止まるので、最後にまとめる */}
          <div className="space-y-1">
            <Label>使いみち</Label>
            <Input
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
              placeholder="夏フェス 中継"
            />
          </div>
        </div>
      )}
    </FormDialog>
  );
}
