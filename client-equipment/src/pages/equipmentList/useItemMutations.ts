/**
 * 機材台帳の書き込み (追加・編集・削除・まとめて編集・その場で編集)。
 *
 * 画面の組み立て (`ItemsPanel.tsx`) と分けてあるのは、**1ファイル 400 行の上限**と、
 * 「どこで何を書いているか」を1か所で読めるようにするためです。
 * 送る値は旧 `EquipmentListPage.tsx` と同じです。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';

export function useItemMutations({ editingId, onSaved, onSaveError, onBulkError, onBulkDone }: {
  /** 編集しているときはその id。追加するときは null */
  editingId: string | null;
  onSaved: (wasEdit: boolean) => void;
  onSaveError: (message: string) => void;
  onBulkError: (message: string) => void;
  onBulkDone: (count: number) => void;
}) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['equipment-items'] });
    qc.invalidateQueries({ queryKey: ['equipment-stats'] });
  };

  const message = (err: unknown, fallback: string) => {
    const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
    return e?.response?.data?.error?.message || e?.message || fallback;
  };

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      (editingId ? api.put(`/equipment/items/${editingId}`, payload) : api.post('/equipment/items', payload)),
    onSuccess: () => { invalidate(); onSaved(!!editingId); },
    onError: (err) => onSaveError(message(err, '保存できませんでした')),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/items/${id}`),
    onSuccess: () => { invalidate(); notifySuccess('機材を削除しました'); },
    onError: (e) => notifyApiError('削除できませんでした', e),
  });

  const inlineEdit = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      api.patch(`/equipment/items/${id}`, data),
    onSuccess: () => invalidate(),
    onError: (e) => notifyApiError('その場で編集できませんでした', e),
  });

  const bulkUpdate = useMutation({
    mutationFn: (payload: { ids: string[]; fields: Record<string, unknown> }) =>
      api.put('/equipment/items/bulk-update', payload),
    onSuccess: (_r, v) => { invalidate(); onBulkDone(v.ids.length); },
    onError: (err) => onBulkError(message(err, '一括編集を保存できませんでした')),
  });

  return { save, remove, inlineEdit, bulkUpdate };
}

/** Excel を書き出す。失敗したら理由を出す (旧実装は黙って何も起きなかった) */
export async function downloadItemsExcel() {
  try {
    const res = await api.get('/equipment/items/export-xlsx', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `機材リスト_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    notifyApiError('Excel を書き出せませんでした', e);
  }
}
