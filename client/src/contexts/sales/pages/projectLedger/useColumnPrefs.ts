/**
 * 案件台帳の「どの列を・どの順で出すか」（利用者ごとに `localStorage` に残す）
 *
 * 機材台帳の `equipmentList/useColumnPrefs.ts` と**同じ考え方**です
 * （鍵の名前だけ `pj-ledger-*` に分けてあります — 同じ鍵にすると
 * 機材の列の設定を案件が壊します）。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**並べ替えは隣と入れ替えるだけ。** 全件に番号を振り直すと、
 *    見ていない列まで動きます（料金表の並び順と同じ理由）
 *  ・**知らない鍵は落として読む。** 列を消した版に上げたとき、
 *    端末に残った古い設定で `undefined` の列が並ぶのを防ぎます
 *  ・**サーバーに持たせない。** 「どの列を見ているか」は業務の記録ではなく、
 *    端末ごとの好みです（`client-v4/recent.ts` と同じ判断）。
 *    別の端末では既定に戻ることを画面に書きます
 */
import { useCallback, useEffect, useState } from 'react';
import {
  COL_DEFS, DEFAULT_COL_ORDER, DEFAULT_VISIBLE_COLS, type LedgerColKey,
} from './types';

const VIS_KEY = 'pj-ledger-visible-cols';
const ORDER_KEY = 'pj-ledger-col-order';

const ALL: LedgerColKey[] = COL_DEFS.map((c) => c.key);

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

/** 端末に残っていた鍵のうち、いま実在するものだけ */
function known(list: unknown): LedgerColKey[] | null {
  if (!Array.isArray(list)) return null;
  const hit = list.filter((k): k is LedgerColKey => ALL.includes(k as LedgerColKey));
  return hit.length > 0 ? hit : null;
}

/** 2つを入れ替える（全件に振り直すと、見ていない列まで動く） */
function swap<T>(list: T[], idx: number, dir: 'up' | 'down'): T[] {
  const target = dir === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

export interface ColumnPrefs {
  /** 出す列を、出す順に並べたもの（表頭と本文はこれだけを読む） */
  shown: LedgerColKey[];
  /** 全部の列を、並べ替えた順で（`ColumnPicker` が並べる） */
  order: LedgerColKey[];
  visible: Set<LedgerColKey>;
  toggle: (key: LedgerColKey) => void;
  move: (key: LedgerColKey, dir: 'up' | 'down') => void;
  reset: () => void;
  /** 既定から変えているか（「元に戻す」を出すかどうか） */
  changed: boolean;
}

export function useColumnPrefs(): ColumnPrefs {
  const [visible, setVisible] = useState<Set<LedgerColKey>>(
    () => new Set(known(readJson(VIS_KEY)) ?? DEFAULT_VISIBLE_COLS),
  );
  const [order, setOrder] = useState<LedgerColKey[]>(() => {
    const saved = known(readJson(ORDER_KEY));
    if (!saved) return DEFAULT_COL_ORDER;
    // **あとから足した列を落とさない。** 保存した並びに無い列は末尾に足す
    return [...saved, ...DEFAULT_COL_ORDER.filter((k) => !saved.includes(k))];
  });

  useEffect(() => {
    try { localStorage.setItem(VIS_KEY, JSON.stringify([...visible])); } catch { /* 保存できなくても画面は動く */ }
  }, [visible]);
  useEffect(() => {
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* 同上 */ }
  }, [order]);

  const toggle = useCallback((key: LedgerColKey) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // **全部消させない。** 0 列にすると行が空の帯になり、戻し方も分からなくなる
        if (next.size <= 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const move = useCallback((key: LedgerColKey, dir: 'up' | 'down') => {
    setOrder((prev) => swap(prev, prev.indexOf(key), dir));
  }, []);

  const reset = useCallback(() => {
    setVisible(new Set(DEFAULT_VISIBLE_COLS));
    setOrder(DEFAULT_COL_ORDER);
  }, []);

  const shown = order.filter((k) => visible.has(k));
  const changed =
    shown.length !== DEFAULT_VISIBLE_COLS.length
    || shown.some((k, i) => k !== DEFAULT_COL_ORDER.filter((x) => DEFAULT_VISIBLE_COLS.includes(x))[i]);

  return { shown, order, visible, toggle, move, reset, changed };
}
