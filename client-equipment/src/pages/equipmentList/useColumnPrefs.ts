/**
 * 機材台帳の「どの列を・どの順で出すか」(利用者ごとに `localStorage` に残す)
 *
 * `EquipmentListPage.tsx` に散っていた6つの `localStorage` の鍵と
 * 4つの並べ替え関数をここに集めました。**鍵の名前と保存する形は変えていません** —
 * 変えると、いま使っている人の列の設定が既定に戻ります。
 */
import { useEffect, useState } from 'react';
import { COL_DEFS, type ColKey } from './types';

const VIS_KEY = 'eq-visible-cols';
const ORDER_KEY = 'eq-col-order';
const CUSTOM_VIS_KEY = 'eq-visible-custom-cols';
const CUSTOM_ORDER_KEY = 'eq-custom-col-order';
const CUSTOM_SEEN_KEY = 'eq-seen-custom-cols';

const DEFAULT_ORDER = COL_DEFS.map((c) => c.key) as ColKey[];
const DEFAULT_VISIBLE = () => new Set(COL_DEFS.filter((c) => c.default).map((c) => c.key)) as Set<ColKey>;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

/** 2つを入れ替える (全件に振り直すと、見ていない列まで動く) */
function swap<T>(list: T[], idx: number, dir: 'up' | 'down'): T[] {
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export function useColumnPrefs(customColumnIds: string[]) {
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    const saved = readJson<ColKey[]>(VIS_KEY);
    return saved ? (new Set(saved) as Set<ColKey>) : DEFAULT_VISIBLE();
  });

  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    const saved = readJson<ColKey[]>(ORDER_KEY);
    if (!saved) return DEFAULT_ORDER;
    // 後から足した列は末尾に置く (保存済みの並びに無い列が消えないように)
    return [...saved.filter((k) => DEFAULT_ORDER.includes(k)), ...DEFAULT_ORDER.filter((k) => !saved.includes(k))];
  });

  const [visibleCustomCols, setVisibleCustomCols] = useState<Set<string>>(
    () => new Set(readJson<string[]>(CUSTOM_VIS_KEY) ?? []),
  );
  const [customColOrder, setCustomColOrder] = useState<string[]>(() => readJson<string[]>(CUSTOM_ORDER_KEY) ?? []);

  const toggleCol = (key: ColKey) => setVisibleCols((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    localStorage.setItem(VIS_KEY, JSON.stringify([...next]));
    return next;
  });

  const moveCol = (key: ColKey, dir: 'up' | 'down') => setColOrder((prev) => {
    const next = swap(prev, prev.indexOf(key), dir);
    localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    return next;
  });

  const toggleCustomCol = (id: string) => setVisibleCustomCols((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    localStorage.setItem(CUSTOM_VIS_KEY, JSON.stringify([...next]));
    return next;
  });

  const moveCustomCol = (id: string, dir: 'up' | 'down', allIds: string[]) => setCustomColOrder((prev) => {
    const current = [...prev.filter((i) => allIds.includes(i)), ...allIds.filter((i) => !prev.includes(i))];
    const next = swap(current, current.indexOf(id), dir);
    localStorage.setItem(CUSTOM_ORDER_KEY, JSON.stringify(next));
    return next;
  });

  const reset = () => {
    for (const k of [VIS_KEY, ORDER_KEY, CUSTOM_VIS_KEY, CUSTOM_ORDER_KEY, CUSTOM_SEEN_KEY]) {
      localStorage.removeItem(k);
    }
    setColOrder(DEFAULT_ORDER);
    setVisibleCols(DEFAULT_VISIBLE());
    setVisibleCustomCols(new Set<string>());
    setCustomColOrder([]);
  };

  /*
   * 新しく作られたカスタム列は自動で出す。
   *
   * 「利用者が自分で消した列」と「まだ見たことがない新しい列」を区別するため、
   * **見たことのある列の id を別の鍵で持つ** (これが無いと、消した列が
   * 毎回「新しい列」として復活する)。
   */
  const idsKey = customColumnIds.join(',');
  useEffect(() => {
    if (customColumnIds.length === 0) return;
    const savedSeen = localStorage.getItem(CUSTOM_SEEN_KEY);
    const savedVis = localStorage.getItem(CUSTOM_VIS_KEY);

    if (savedSeen === null && savedVis === null) {
      setVisibleCustomCols(new Set(customColumnIds));
      localStorage.setItem(CUSTOM_VIS_KEY, JSON.stringify(customColumnIds));
      localStorage.setItem(CUSTOM_SEEN_KEY, JSON.stringify(customColumnIds));
      return;
    }

    let seen: string[] = [];
    try {
      seen = savedSeen ? JSON.parse(savedSeen) : (savedVis ? JSON.parse(savedVis) : []);
    } catch { seen = []; }
    if (savedSeen === null) localStorage.setItem(CUSTOM_SEEN_KEY, JSON.stringify(seen));

    const seenSet = new Set(seen);
    const brandNew = customColumnIds.filter((id) => !seenSet.has(id));
    if (brandNew.length === 0) return;

    setVisibleCustomCols((prev) => {
      const next = new Set(prev);
      brandNew.forEach((id) => next.add(id));
      localStorage.setItem(CUSTOM_VIS_KEY, JSON.stringify([...next]));
      return next;
    });
    localStorage.setItem(CUSTOM_SEEN_KEY, JSON.stringify([...seen, ...brandNew]));
    // 列の一覧そのものが変わったときだけ見る (中身の名前が変わっても走らせない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return {
    visibleCols, colOrder, visibleCustomCols, customColOrder,
    toggleCol, moveCol, toggleCustomCol, moveCustomCol, reset,
  };
}

export type ColumnPrefs = ReturnType<typeof useColumnPrefs>;
