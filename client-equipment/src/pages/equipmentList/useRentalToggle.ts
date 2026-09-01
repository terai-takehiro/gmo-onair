/**
 * 機材台帳の「貸出可」の切り替え。**台帳の列から直接押せる**（モックどおり）。
 *
 * `ItemsPanel.tsx` から切り出したものです。貸出の一覧・設定タブ・
 * ダッシュボードの数はどれも同じフラグを見ているので、まとめて読み直す
 * （片方だけ古いままだと「押したのに増えない」になる）。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { EquipmentRecord } from './types';

export function useRentalToggle() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: (item: EquipmentRecord) =>
      api.put(`/equipment/rental-settings/${item.id}`, { is_rental_listed: !item.is_rental_listed }),
    onMutate: (item) => { setBusyId(item.id); },
    onSettled: () => setBusyId(null),
    onSuccess: (_res, item) => {
      qc.invalidateQueries({ queryKey: ['equipment-items'] });
      // 設定タブ（`settings/RentalRulesTab.tsx`）の鍵は `['rental-settings', …]`。
      // 貸出機材タブは `['model-groups', …]`・貸出ダイアログは `['equipment-lendable']`
      // （staleTime 30秒）。前方一致で引数つきの変種も落ちる
      qc.invalidateQueries({ queryKey: ['rental-settings'] });
      qc.invalidateQueries({ queryKey: ['model-groups'] });
      qc.invalidateQueries({ queryKey: ['equipment-lendable'] });
      qc.invalidateQueries({ queryKey: ['equipment-stats'] });
      notifySuccess(`${item.name} を${item.is_rental_listed ? '常設に戻しました' : '貸出可にしました'}`);
    },
    onError: (e) => notifyApiError('貸出可を切り替えられませんでした', e),
  });

  return { busyId, toggle: (item: EquipmentRecord) => toggle.mutate(item) };
}
