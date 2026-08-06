/**
 * 機材台帳の「選ぶ」と「付属品を開く」。
 *
 * ・Shift 押しで範囲を選ぶ (棚1本ぶんをまとめて直すときに要る)
 * ・付属品は開いたときに取りに行き、覚えておく (毎回取りに行くと開くたびに待つ)
 */
import { useState } from 'react';
import api from '@/lib/api';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { EquipmentRecord } from './types';

export function useItemSelection(items: EquipmentRecord[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastIndex, setLastIndex] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Record<string, EquipmentRecord[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());

  const click = (id: string, index: number, shiftKey: boolean) => {
    if (shiftKey && lastIndex !== null) {
      const start = Math.min(lastIndex, index);
      const end = Math.max(lastIndex, index);
      const range = items.slice(start, end + 1).map((it) => it.id);
      setSelectedIds((prev) => { const next = new Set(prev); range.forEach((r) => next.add(r)); return next; });
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLastIndex(index);
  };

  const toggleAll = () => {
    setSelectedIds((prev) =>
      (prev.size === items.length && items.length > 0) ? new Set() : new Set(items.map((it) => it.id)));
  };

  const clear = () => { setSelectedIds(new Set()); setLastIndex(null); };

  const toggleExpand = async (item: EquipmentRecord) => {
    const id = item.id;
    let opening = false;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      next.add(id);
      opening = true;
      return next;
    });
    if (!opening || childrenCache[id]) return;
    setLoadingChildren((prev) => new Set(prev).add(id));
    try {
      const res = await api.get('/equipment/items', { params: { parent_id: id } });
      setChildrenCache((prev) => ({ ...prev, [id]: res.data.data ?? [] }));
    } catch (e) {
      notifyApiError('付属品を読み込めませんでした', e);
    } finally {
      setLoadingChildren((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  /** 付属品を消したとき、覚えている一覧からも外す (残ると消えていないように見える) */
  const dropChild = (parentId: string, childId: string) => {
    setChildrenCache((prev) => ({
      ...prev,
      [parentId]: (prev[parentId] ?? []).filter((c) => c.id !== childId),
    }));
  };

  return {
    selectedIds, expandedIds, childrenCache, loadingChildren,
    click, toggleAll, clear, toggleExpand, dropChild,
  };
}
