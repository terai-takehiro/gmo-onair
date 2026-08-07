/**
 * ⑧ 設定 ／ 貸出の決めごと (v4)
 *
 * ── モックとの違い (意図したもの) ──────────────────────────
 *
 * モックのこのタブには決めごとが6つ並んでいます
 * (返却予定日の初期値／遅延を知らせるタイミング／社外への貸出を許可する／
 *  社外貸出は承認を必要とする／QRスキャンで貸出・返却を記録する／
 *  修理中・引退の機材は貸し出せないようにする)。
 *
 * **これらを入れる場所がまだ DB にありません。** 保存先の無いスイッチを置くと、
 * 押した人は「決めた」と思うのに何も変わりません (次に開くと戻っています)。
 * ですので**作らず、無いことを画面に書いています**。
 *
 * ── 代わりにここに置いたもの ────────────────────────────────
 *
 * 実際に効く決めごとは1つだけ = **どの機材を貸出の対象にするか**
 * (`equipment_items.is_rental_listed`)。旧「貸出機材設定」の画面がこれで、
 * メニューに別項目として出ていました。決めごとはここに集めます。
 *
 * **モックどおり、切り替えは機材台帳の列にも置きました**
 * (`equipmentList/EquipmentCells.tsx` の `RentalCell`)。権限が無い人には
 * 押せない印として出すので 403 にはなりません。
 * ここに残してあるのは**まとめて切り替える**ための一覧です
 * (台帳の絞り込みとは別に、貸出可だけを並べて見直す用途)。
 * 書き込むのは同じ1つの列 (`equipment_items.is_rental_listed`) なので食い違いません。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { SearchField } from '@/components/parts/SearchField';
import { useDebounced } from '@/hooks/useDebounced';
import { TYPE_CODES, TYPE_LABELS } from '@/lib/constants';

interface RentalItem {
  id: string;
  name: string;
  model_number: string | null;
  unit_number: number | null;
  eq_code: string;
  equipment_type_code: string;
  equipment_section: string | null;
  status: string;
  is_rental_listed: boolean;
  manufacturer_name: string | null;
  location_name: string | null;
}

/** まだ保存先が無い決めごと。**画面に「無い」と書くための一覧** */
const NOT_STORED = [
  '返却予定日の初期値 (3日／7日／14日)',
  '遅延を知らせるタイミング (当日／翌日／3日後)',
  '社外への貸出を許可するか',
  '社外貸出に承認を必要とするか',
  'QRスキャンから貸出・返却を記録するか',
  '修理中・引退の機材を貸し出せないようにするか',
];

export function RentalRulesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const debounced = useDebounced(search, 300);

  const list = useQuery({
    queryKey: ['rental-settings', debounced, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (debounced) params.q = debounced;
      if (typeFilter) params.type = typeFilter;
      return (await api.get('/equipment/rental-settings', { params })).data.data as RentalItem[];
    },
    staleTime: 10_000,
  });
  const items = useMemo(() => list.data ?? [], [list.data]);
  const listedCount = useMemo(() => items.filter((i) => i.is_rental_listed).length, [items]);

  const toggle = useMutation({
    mutationFn: ({ id, is_rental_listed }: { id: string; is_rental_listed: boolean }) =>
      api.put(`/equipment/rental-settings/${id}`, { is_rental_listed }),
    onMutate: async ({ id, is_rental_listed }) => {
      await qc.cancelQueries({ queryKey: ['rental-settings'] });
      const key = ['rental-settings', debounced, typeFilter];
      const prev = qc.getQueryData<RentalItem[]>(key);
      qc.setQueryData(key, (old: RentalItem[] | undefined) =>
        (old ?? []).map((i) => (i.id === id ? { ...i, is_rental_listed } : i)));
      return { prev, key };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      notifyApiError('貸出の対象を変えられませんでした', err, '機材管理の owner 権限が要ります');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['rental-settings'] });
      qc.invalidateQueries({ queryKey: ['model-groups'] });
    },
  });

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sub text-muted-foreground">
            入にした機材だけが「貸出機材」と「貸出・返却」に出ます ・
            この絞り込みで <span className="font-number font-bold">{items.length}</span> 台中{' '}
            <span className="font-number font-bold text-primary">{listedCount}</span> 台が貸出可
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={search} onChange={setSearch} placeholder="商品名・型名・メーカーで探す" />
          <Select value={typeFilter || '_all'} onValueChange={(v) => setTypeFilter(v === '_all' ? '' : v)}>
            <SelectTrigger className="w-36" aria-label="種別で絞り込む">
              <SelectValue placeholder="種別すべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">種別すべて</SelectItem>
              {TYPE_CODES.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {list.isError ? (
          <ErrorPanel title="機材を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : items.length === 0 ? (
          <NoSearchResults
            keyword={debounced || undefined}
            activeFilters={typeFilter ? [`種別: ${TYPE_LABELS[typeFilter] ?? typeFilter}`] : []}
            onClearFilters={() => { setSearch(''); setTypeFilter(''); }}
          />
        ) : (
          <div className="flex flex-col rounded-card border border-border bg-card">
            <RowHeader className="hidden sm:flex">
              <RowSlot w={56}>貸出可</RowSlot>
              <RowMain>商品名 ／ メーカー</RowMain>
              <RowSlot w={128}>型名</RowSlot>
              <RowSlot w={96}>No.／ID</RowSlot>
              <RowSlot w={72}>種別</RowSlot>
              <RowSlot w={160}>設置場所</RowSlot>
            </RowHeader>
            {items.map((item) => (
              <Row key={item.id} divider interactive stackOnMobile>
                <RowSlot w={56} align="center">
                  <Switch
                    checked={item.is_rental_listed}
                    onCheckedChange={(v) => toggle.mutate({ id: item.id, is_rental_listed: !!v })}
                    disabled={toggle.isPending}
                    aria-label={`${item.name} を貸出の対象にする`}
                  />
                </RowSlot>
                <RowMain>
                  <RowTitle>{item.name}</RowTitle>
                  <RowSub>{item.manufacturer_name || 'メーカーなし'}</RowSub>
                </RowMain>
                <RowSlot w={128} hideOnMobile>
                  {item.model_number && (
                    <span className="truncate text-sub-sm text-secondary-foreground">{item.model_number}</span>
                  )}
                </RowSlot>
                <RowSlot w={96} hideOnMobile>
                  <span className="font-number truncate text-sub-sm text-muted-foreground">
                    {item.unit_number != null ? `No.${item.unit_number}` : item.eq_code}
                  </span>
                </RowSlot>
                <RowSlot w={72} hideOnMobile>
                  <TableBadge
                    label={TYPE_LABELS[item.equipment_type_code] ?? item.equipment_type_code}
                    w={null}
                    className="bg-muted text-muted-foreground border-transparent"
                  />
                </RowSlot>
                <RowSlot w={160} hideOnMobile>
                  {item.location_name && (
                    <span className="truncate text-sub-sm text-secondary-foreground">{item.location_name}</span>
                  )}
                </RowSlot>
              </Row>
            ))}
          </div>
        )}
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[320px]">
        <div className="rounded-note border border-warning-border bg-warning-surface p-4">
          <p className="text-cardtitle text-foreground">まだ持てない決めごと</p>
          <p className="mt-1 text-note text-secondary-foreground">
            v4 のモックにある次の6つは、<strong className="font-bold">保存する場所がまだありません</strong>。
            押しても次に開くと戻ってしまうので、スイッチを出していません。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-note text-secondary-foreground">
            {NOT_STORED.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="mt-2 text-note text-secondary-foreground">
            いまは貸出の登録画面で1件ずつ入れます (返却予定日は空でも登録できます)。
          </p>
        </div>
        <div className="rounded-note border border-info-border bg-info-surface p-4">
          <p className="text-note text-secondary-foreground">
            ここを入にすると、その機材が貸出機材の一覧と貸出の登録に出ます。
            <strong className="font-bold">常設のままの機材は貸出の画面に出ません。</strong>
            切り替えには機材管理の owner 権限が要ります。
          </p>
        </div>
      </div>
    </div>
  );
}
