/**
 * 機材台帳の「いま何を見ているか」を URL に持つ。
 *
 * **URL に置くのが要点**で、機材の詳細から戻ったときに絞り込みと並び順が
 * 残ります (`useState` に置くと戻るたびに全件に戻り、探し直しになる)。
 *
 * ── 種別の絞り込みをサーバーから画面に移した ────────────────
 *
 * 旧実装は種別だけサーバーに投げていたので、**種別ごとの件数を出せません**
 * でした (押してみるまで 0 件か分からない)。区分・場所と同じく画面側で掛けると、
 * 1回の取得で全部の軸の件数が数えられます。
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useDebounced } from '@/hooks/useDebounced';
import type { EquipmentRecord } from './types';

export function useEquipmentListState() {
  const [params, setParams] = useSearchParams();

  const type = params.get('tab') ?? '';
  const section = params.get('sect') ?? '';
  const sortKey = params.get('sort') || null;
  const sortDir = (params.get('dir') as 'asc' | 'desc') || 'asc';
  const includeChildren = params.get('children') === '1';
  const urlSearch = params.get('q') ?? '';
  const locsParam = params.get('locs') ?? '';
  const locs = useMemo(() => new Set(locsParam ? locsParam.split(',') : []), [locsParam]);

  // 打っている間は URL を書き換えない (1文字ごとに履歴が積もる)
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search, 400);
  useEffect(() => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      if (debounced) n.set('q', debounced); else n.delete('q');
      return n;
    }, { replace: true });
    // setParams は毎回新しい関数なので依存に入れない (入れると無限に走る)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const patch = (fn: (n: URLSearchParams) => void) => {
    setParams((p) => { const n = new URLSearchParams(p); fn(n); return n; }, { replace: true });
  };

  const setType = (v: string) => patch((n) => { if (v) n.set('tab', v); else n.delete('tab'); });
  const setSection = (v: string) => patch((n) => { if (v) n.set('sect', v); else n.delete('sect'); });
  const setLocs = (next: Set<string>) => patch((n) => {
    if (next.size > 0) n.set('locs', [...next].join(',')); else n.delete('locs');
  });
  const toggleLoc = (id: string) => {
    const next = new Set(locs);
    if (next.has(id)) next.delete(id); else next.add(id);
    setLocs(next);
  };
  const setIncludeChildren = (v: boolean) => patch((n) => { if (v) n.set('children', '1'); else n.delete('children'); });
  /**
   * 絞り込みを全部外す（シートの「ぜんぶ外す」と 0 件のときの案内）。
   *
   * ⚠️ **「付属品も出す」も外すこと**（レビューでの指摘 #69）。
   * 数える側（`MobileFilters` の `activeCount`）は**これも1つとして数えます**
   * — 入れたままだと件数が急に増え、畳んでいると理由が分からないためです。
   * ところが外す側が `children` を消していなかったので、
   * **「ぜんぶ外す」を押しても札の数字が 1 のまま残り、付属品も一覧に出たまま**でした。
   * 押した人には**「全部外したのに外れていない」**としか見えません。
   */
  const clearFilters = () => {
    setSearch('');
    patch((n) => {
      n.delete('tab'); n.delete('sect'); n.delete('locs'); n.delete('q');
      n.delete('children');
    });
  };

  /** 3回押すと既定の並びに戻る (昇順 → 降順 → 既定) */
  const onSort = (key: string) => patch((n) => {
    if (sortKey !== key) { n.set('sort', key); n.set('dir', 'asc'); }
    else if (sortDir === 'asc') { n.set('dir', 'desc'); }
    else { n.delete('sort'); n.delete('dir'); }
  });

  // 種別・区分・場所は画面で掛けるので、サーバーには検索と付属品だけ渡す
  const query = useQuery({
    queryKey: ['equipment-items', urlSearch, includeChildren],
    queryFn: async () => {
      const p: Record<string, string> = {};
      if (urlSearch) p.search = urlSearch;
      if (includeChildren) p.include_children = '1';
      return (await api.get('/equipment/items', { params: p })).data.data as EquipmentRecord[];
    },
  });

  const raw = useMemo(() => query.data ?? [], [query.data]);

  const sortFn = useMemo(() => (a: EquipmentRecord, b: EquipmentRecord) => {
    if (!sortKey) return 0;
    const av = a?.[sortKey]; const bv = b?.[sortKey];
    const aNull = av == null || av === ''; const bNull = bv == null || bv === '';
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    const cmp = String(av).localeCompare(String(bv), 'ja');
    return sortDir === 'asc' ? cmp : -cmp;
  }, [sortKey, sortDir]);

  /** 絞り込みを掛けて並べる。`skip` に渡した軸だけ外す (件数を数えるため) */
  const apply = useMemo(() => (skip?: 'type' | 'section') => {
    const matches = (item: EquipmentRecord): boolean => {
      if (skip !== 'type' && type && item.equipment_type_code !== type) return false;
      if (skip !== 'section' && section && item.equipment_section !== section) return false;
      if (locs.size > 0 && !locs.has(item.location_id ?? '')) return false;
      return true;
    };

    if (!includeChildren) {
      const filtered = raw.filter(matches);
      if (sortKey) filtered.sort(sortFn);
      return filtered;
    }

    // 付属品も出す: 親子の木をたどって、当たった枝ごと出す
    const idMap = new Map(raw.map((i) => [i.id, i]));
    const byParent: Record<string, EquipmentRecord[]> = {};
    for (const item of raw) {
      if (!item.parent_id) continue;
      (byParent[item.parent_id] ??= []).push(item);
    }
    const roots = raw.filter((i) => !i.parent_id || !idMap.has(i.parent_id));
    const subtreeMatches = (item: EquipmentRecord): boolean =>
      matches(item) || (byParent[item.id] ?? []).some(subtreeMatches);
    const flatten = (item: EquipmentRecord): EquipmentRecord[] => {
      const kids = [...(byParent[item.id] ?? [])];
      if (sortKey) kids.sort(sortFn);
      return [item, ...kids.flatMap(flatten)];
    };
    const sortedRoots = [...roots];
    if (sortKey) sortedRoots.sort(sortFn);
    return sortedRoots.filter(subtreeMatches).flatMap(flatten);
  }, [raw, type, section, locs, includeChildren, sortKey, sortFn]);

  const items = useMemo(() => apply(), [apply]);
  const baseForType = useMemo(() => apply('type'), [apply]);
  const baseForSection = useMemo(() => apply('section'), [apply]);

  return {
    query, items, baseForType, baseForSection,
    filters: { type, section, locs, search, includeChildren },
    urlSearch, sortKey, sortDir,
    setType, setSection, setLocs, toggleLoc, setIncludeChildren, setSearch, clearFilters, onSort,
  };
}
