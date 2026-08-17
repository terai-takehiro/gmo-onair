/**
 * ② 機材台帳 ／ 貸出機材 (v4・旧 `ModelGroupPage.tsx`)
 *
 * 「貸出可」にした機材だけが並びます。型番ごとにまとめ、開くと1台ずつ出ます。
 *
 * ── 直したこと ────────────────────────────────────────────
 *
 *  ・**カテゴリ管理のダイアログを外した。** 同じ4つの API を叩く同じ画面が
 *    `/equipment/rental-categories` にもあり、**そちらはメニューに出ていません**
 *    でした。設定の「貸出カテゴリ」に1本化し、ここからはそこへ送ります。
 *  ・件数のチップを足した (押す前に 0 件だと分かるように)。
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Settings2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { SearchField } from '@/components/parts/SearchField';
import { useDebounced } from '@/hooks/useDebounced';
import { TYPE_CODES, TYPE_LABELS } from '@/lib/constants';
import { RentalSection } from './RentalSection';
import { groupKey, type CategorySection, type ModelGroup, type RentalCategory } from './rentalTypes';

export function RentalPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 400);
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [editGroup, setEditGroup] = useState<ModelGroup | null>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');

  const { data: categoriesData } = useQuery<RentalCategory[]>({
    queryKey: ['rental-categories'],
    queryFn: async () => (await api.get('/equipment/rental-categories')).data.data,
    staleTime: 60_000,
  });
  const allCategories = useMemo(() => categoriesData ?? [], [categoriesData]);

  // 種別の件数を出すため、**種別だけサーバーに渡さず**画面で掛ける
  const list = useQuery({
    queryKey: ['model-groups', debounced, categoryFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (debounced) params.q = debounced;
      if (categoryFilter) params.category = categoryFilter;
      return (await api.get('/equipment/model-groups', { params })).data.data as ModelGroup[];
    },
    staleTime: 30_000,
  });
  const base = useMemo(() => list.data ?? [], [list.data]);
  const groups = useMemo(
    () => (typeFilter ? base.filter((g) => g.equipment_type_code === typeFilter) : base),
    [base, typeFilter],
  );

  useEffect(() => { setExpanded(new Set()); }, [debounced, typeFilter, categoryFilter]);

  const totalUnits = useMemo(() => groups.reduce((s, g) => s + g.total_count, 0), [groups]);
  const inRepair = useMemo(
    () => groups.reduce((s, g) => s + g.units.filter((u) => u.status === 'in_repair').length, 0),
    [groups],
  );

  const typeChips = useMemo(() => ([
    { key: '', label: 'すべて', count: base.length },
    ...TYPE_CODES
      .filter((t) => base.some((g) => g.equipment_type_code === t.code))
      .map((t) => ({
        key: t.code,
        label: t.label,
        count: base.filter((g) => g.equipment_type_code === t.code).length,
      })),
  ]), [base]);

  const sections = useMemo<CategorySection[]>(() => {
    if (categoryFilter) {
      const name = categoryFilter === '_none'
        ? 'カテゴリなし'
        : (allCategories.find((c) => c.id === categoryFilter)?.name ?? '');
      return [{ id: categoryFilter === '_none' ? null : categoryFilter, name, sort_order: 0, groups }];
    }
    const map = new Map<string, CategorySection>();
    for (const g of groups) {
      const key = g.rental_category_id ?? '_none';
      if (!map.has(key)) {
        map.set(key, {
          id: g.rental_category_id,
          name: g.rental_category_name ?? 'カテゴリなし',
          sort_order: g.rental_category_sort_order ?? 9999,
          groups: [],
        });
      }
      map.get(key)!.groups.push(g);
    }
    return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
  }, [groups, categoryFilter, allCategories]);

  const showSectionHeaders = !categoryFilter && sections.length > 1;
  const allKeys = useMemo(() => groups.map(groupKey), [groups]);
  const allOpen = groups.length > 0 && allKeys.every((k) => expanded.has(k));

  const save = useMutation({
    mutationFn: (p: { ids: string[]; rental_category_id: string | null; rental_display_name: string | null }) =>
      api.put('/equipment/items/batch-rental', p),
    onSuccess: (_r, p) => {
      qc.invalidateQueries({ queryKey: ['model-groups'] });
      setEditGroup(null);
      notifySuccess(`${p.ids.length} 台の貸出の出しかたを直しました`);
    },
    onError: (e) => notifyApiError('直せませんでした', e),
  });

  const filtering = !!(debounced || typeFilter || categoryFilter);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sub text-muted-foreground">
          <span className="font-number font-bold">{groups.length}</span> 型番 ／{' '}
          <span className="font-number font-bold">{totalUnits}</span> 台
          {inRepair > 0 && <span className="text-warning"> ・ 修理中 {inRepair} 台</span>}
        </p>
        <div className="flex-1" />
        <Button variant="outline" asChild>
          <Link to="/equipment/settings?tab=cat">
            <Settings2 className="mr-1 h-4 w-4" aria-hidden="true" />貸出カテゴリを直す
          </Link>
        </Button>
        {groups.length > 0 && (
          <Button variant="outline" onClick={() => setExpanded(allOpen ? new Set() : new Set(allKeys))}>
            {allOpen ? 'すべて閉じる' : 'すべて開く'}
          </Button>
        )}
      </div>

      <FilterChips label="種別で絞り込む" items={typeChips} value={typeFilter} onChange={setTypeFilter} />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="商品名・型名・メーカーで探す" />
        {allCategories.length > 0 && (
          <Select value={categoryFilter || '_all'} onValueChange={(v) => setCategoryFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="w-40" aria-label="貸出カテゴリで絞り込む">
              <SelectValue placeholder="カテゴリすべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">カテゴリすべて</SelectItem>
              {allCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              <SelectItem value="_none">カテゴリなし</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {list.isError ? (
        <ErrorPanel title="貸出機材を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : groups.length === 0 && filtering ? (
        <NoSearchResults
          keyword={debounced || undefined}
          activeFilters={[
            typeFilter ? `種別: ${TYPE_LABELS[typeFilter] ?? typeFilter}` : '',
            categoryFilter ? `カテゴリ: ${categoryFilter === '_none' ? 'なし' : (allCategories.find((c) => c.id === categoryFilter)?.name ?? '')}` : '',
          ].filter(Boolean)}
          onClearFilters={() => { setSearch(''); setTypeFilter(''); setCategoryFilter(''); }}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="貸出可にした機材がまだ1台もありません"
          description="設定の「貸出の決めごと」で貸出の対象にすると、ここと貸出・返却に出てきます。"
          action={<Button asChild><Link to="/equipment/settings?tab=rule">貸出の対象を決める</Link></Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <RentalSection
              key={section.id ?? '_none'}
              section={section}
              showHeader={showSectionHeaders}
              expanded={expanded}
              onToggle={(key) => setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}
              onEditRental={(g) => {
                setEditGroup(g);
                setEditCategoryId(g.rental_category_id ?? '');
                setEditDisplayName(g.rental_display_name ?? '');
              }}
              onOpenUnit={(id) => navigate(`/equipment/items/${id}`)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!editGroup} onOpenChange={(o) => { if (!o) setEditGroup(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>貸出の出しかた</DialogTitle></DialogHeader>
          {editGroup && (
            <div className="space-y-4">
              <div className="rounded-control bg-muted px-3 py-2">
                <p className="truncate text-list">{editGroup.name}</p>
                {editGroup.model_number && (
                  <p className="font-number text-sub-sm text-muted-foreground">{editGroup.model_number}</p>
                )}
                <p className="mt-1 text-note text-muted-foreground">{editGroup.total_count} 台にまとめて当てます</p>
              </div>
              <div className="space-y-1">
                <Label>貸出カテゴリ</Label>
                <Select value={editCategoryId || '_none'} onValueChange={(v) => setEditCategoryId(v === '_none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="なし" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">なし</SelectItem>
                    {allCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>貸出のときの名前</Label>
                <Input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder={`${editGroup.name} (空なら商品名を使います)`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditGroup(null)}>やめる</Button>
                <Button
                  onClick={() => save.mutate({
                    ids: editGroup.units.map((u) => u.id),
                    rental_category_id: editCategoryId || null,
                    rental_display_name: editDisplayName || null,
                  })}
                  disabled={save.isPending}
                >
                  {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                  直す
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
