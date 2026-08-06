/**
 * 拠点・種別のマスタ (保管場所タブから開く)
 *
 * 保管場所の「拠点」と「種別 (ラック／オペ卓／AV盤)」は選択肢そのものなので、
 * 場所の登録画面から離れた場所に置くと**選択肢が無いことに気づいてから探す**ことに
 * なります。場所タブの中から開けるようにしてあります。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';

export function MasterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>拠点・種別</DialogTitle></DialogHeader>
        <p className="text-note text-muted-foreground">
          拠点は機材IDの先頭 (Y／S) になります。種別に「ラック」を選んだ場所だけが
          Uサイズを持ち、ラック図に1本として並びます。
        </p>
        <div className="space-y-6">
          <MasterSection
            title="拠点"
            apiPath="/equipment/branches"
            queryKey="equipment-branches"
            placeholder="例: 用賀、渋谷、青山"
          />
          <MasterSection
            title="種別"
            apiPath="/equipment/rack-types"
            queryKey="equipment-rack-types"
            placeholder="例: ラック、オペ卓、AV盤"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MasterSection({ title, apiPath, queryKey, placeholder }: {
  title: string;
  apiPath: string;
  queryKey: string;
  placeholder: string;
}) {
  const qc = useQueryClient();
  const [addName, setAddName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => (await api.get(apiPath)).data.data,
  });
  const items: { id: string; name: string }[] = data ?? [];

  const add = useMutation({
    mutationFn: (name: string) => api.post(apiPath, { name, sort_order: items.length }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); setAddName(''); notifySuccess(`${title}を足しました`); },
    onError: (e) => notifyApiError('足せませんでした', e),
  });
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.put(`${apiPath}/${id}`, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); setEditingId(null); notifySuccess('名前を直しました'); },
    onError: (e) => notifyApiError('直せませんでした', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${apiPath}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); notifySuccess(`${title}を消しました`); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const onDelete = async (item: { id: string; name: string }) => {
    const ok = await confirmAction({
      title: `${title}「${item.name}」を消しますか`,
      description: '使われている場所があると消せません。消せた場合も取り消せません。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) remove.mutate(item.id);
  };

  return (
    <div className="space-y-2">
      <p className="text-cardtitle">{title}</p>
      <div className="divide-y divide-border-faint rounded-control border border-border">
        {items.length === 0 && <p className="px-3 py-2 text-sub-sm text-muted-foreground">まだありません</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-3 py-2">
            {editingId === item.id ? (
              <>
                <Input
                  className="h-9 flex-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editName.trim()) update.mutate({ id: item.id, name: editName.trim() });
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                />
                <Button
                  size="sm"
                  disabled={!editName.trim() || update.isPending}
                  onClick={() => update.mutate({ id: item.id, name: editName.trim() })}
                >
                  直す
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>やめる</Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sub">{item.name}</span>
                <Button
                  variant="ghost" size="icon-sm" aria-label={`${item.name} の名前を直す`}
                  onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" className="text-destructive" aria-label={`${item.name} を消す`}
                  disabled={remove.isPending}
                  onClick={() => onDelete(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 px-3 py-2">
          <Input
            className="h-9 flex-1"
            placeholder={placeholder}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && addName.trim()) add.mutate(addName.trim()); }}
          />
          <Button size="sm" disabled={!addName.trim() || add.isPending} onClick={() => add.mutate(addName.trim())}>
            {add.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            足す
          </Button>
        </div>
      </div>
    </div>
  );
}
