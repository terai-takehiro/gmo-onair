/**
 * 自分で作る列 (カスタム列) の値の読み書き。
 *
 * ── なぜローカルの値を「正」にするか (旧実装からの引き継ぎ) ──
 *
 * セルは打った瞬間に見た目を変えたいのに、React Query の再取得が
 * 打っている途中の値を古い値で上書きしてしまいます。そこで
 * **書き込み中の (機材, 列) を覚えておき、その組だけサーバーの値で上書きしない**
 * 形にしてあります。挙動は旧実装のままで、置き場所だけ移しました。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { CustomColumn } from '@/components/CustomColumnDialog';

const pendingKey = (equipmentId: string, columnId: string) => `${equipmentId}::${columnId}`;

export function useCustomValues(itemIds: string[], customColumns: CustomColumn[]) {
  const idsKey = itemIds.join(',');

  const { data } = useQuery({
    queryKey: ['equipment-custom-values', idsKey],
    queryFn: async () => {
      if (itemIds.length === 0) return [];
      return (await api.get('/equipment/custom-values', { params: { equipment_ids: idsKey } })).data.data;
    },
    enabled: itemIds.length > 0 && customColumns.length > 0,
  });

  /** サーバーの値。機材 → 列 → 値 */
  const serverValues = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const row of (data ?? []) as { equipment_id: string; column_id: string; value?: string }[]) {
      if (!map[row.equipment_id]) map[row.equipment_id] = {};
      map[row.equipment_id][row.column_id] = row.value ?? '';
    }
    return map;
  }, [data]);

  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const pendingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const [eqId, colMap] of Object.entries(serverValues)) next[eqId] = { ...colMap };
      // 書き込み中のセルだけは打った値を残す
      for (const pk of pendingRef.current) {
        const [eqId, colId] = pk.split('::');
        if (!next[eqId]) next[eqId] = {};
        const local = prev[eqId]?.[colId];
        if (local !== undefined) next[eqId][colId] = local;
      }
      return next;
    });
  }, [serverValues]);

  const mutation = useMutation({
    mutationFn: ({ equipmentId, columnId, value }: { equipmentId: string; columnId: string; value: string }) =>
      api.put(`/equipment/custom-values/${columnId}/${equipmentId}`, { value }),
    onError: (err, vars) => {
      // 失敗したらサーバーの値に戻す (打った値のまま残ると入っていると誤解する)
      setValues((prev) => {
        const server = serverValues[vars.equipmentId]?.[vars.columnId] ?? '';
        return { ...prev, [vars.equipmentId]: { ...(prev[vars.equipmentId] ?? {}), [vars.columnId]: server } };
      });
      notifyApiError('列の値を保存できませんでした', err);
    },
    onSettled: (_d, _e, vars) => { pendingRef.current.delete(pendingKey(vars.equipmentId, vars.columnId)); },
  });

  const write = (equipmentId: string, columnId: string, value: string) => {
    pendingRef.current.add(pendingKey(equipmentId, columnId));
    setValues((prev) => ({ ...prev, [equipmentId]: { ...(prev[equipmentId] ?? {}), [columnId]: value } }));
    mutation.mutate({ equipmentId, columnId, value });
  };

  return { values, write };
}
