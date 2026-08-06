/**
 * ⑧ 設定 ／ メーカー・色 の右側「機材の色」
 *
 * ラック図のセルの色になります。既定は種別の色で、ここで作った色を機材ごとに
 * 上書きできます (モックもメーカーと同じタブに置いています — どちらも
 * 「機材に貼る属性」で、別のタブにすると探すときにどちらか思い出す必要があるため)。
 */
import { useEffect, useState } from 'react';
import { Loader2, Palette, Plus } from 'lucide-react';
import { useCrudPage } from '@/hooks/useCrudPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { RowActions } from './RowActions';

interface Color {
  id: string;
  name: string;
  color_hex: string;
  description?: string;
  sort_order?: number;
}

interface ColorForm { name: string; color_hex: string; description: string; sort_order: string }

const EMPTY_FORM: ColorForm = { name: '', color_hex: '#4A90E2', description: '', sort_order: '0' };

export function ColorsCard() {
  const crud = useCrudPage<Color>({
    endpoint: '/equipment/colors',
    queryKey: ['equipment-colors'],
    onSaveSuccess: () => notifySuccess('色を保存しました'),
    onDeleteSuccess: () => notifySuccess('色を消しました'),
    onError: (action, err) => notifyApiError(action === 'save' ? '保存できませんでした' : '消せませんでした', err),
  });
  const [form, setForm] = useState<ColorForm>(EMPTY_FORM);

  useEffect(() => {
    const c = crud.editingItem;
    setForm(c ? {
      name: c.name || '',
      color_hex: c.color_hex || '#4A90E2',
      description: c.description || '',
      sort_order: c.sort_order?.toString() || '0',
    } : EMPTY_FORM);
  }, [crud.editingItem]);

  const onDelete = async (c: Color) => {
    const ok = await confirmAction({
      title: `色「${c.name}」を消しますか`,
      description: 'この色を選んでいる機材はラック図で種別の色に戻ります。取り消せません。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) crud.remove.mutate(c.id);
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-cardtitle">機材の色</h3>
        <div className="flex-1" />
        <Button variant="outline" onClick={crud.openAdd}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />色を足す
        </Button>
      </div>
      <p className="text-note text-muted-foreground">
        ラック図のセルの色になります。既定は種別の色で、ここで機材ごとの色を上書きできます。
      </p>

      {crud.isError ? (
        <ErrorPanel title="色を読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
      ) : crud.isLoading ? (
        <Delayed><SkeletonRows rows={3} rowHeight={40} /></Delayed>
      ) : crud.items.length === 0 ? (
        <EmptyState
          title="色がまだ1件もありません"
          description="ラック図で機材を見分けるための色をここで作ります。"
        />
      ) : (
        <ul className="divide-y divide-border-faint">
          {crud.items.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <span
                className="h-7 w-7 shrink-0 rounded-control border border-border"
                style={{ background: c.color_hex }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-list">{c.name}</span>
                <span className="font-number block text-note text-muted-foreground">{c.color_hex}</span>
              </span>
              <RowActions name={c.name} onEdit={() => crud.openEdit(c)} onDelete={() => onDelete(c)} />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{crud.isEditing ? '色を直す' : '色を足す'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>色の名前 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="本線系" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="color-hex">色 *</Label>
              <div className="flex items-center gap-3">
                <input
                  id="color-hex"
                  type="color"
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  className="h-10 w-16 cursor-pointer rounded-control border border-input"
                />
                <Input
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  placeholder="#E6F2FF"
                  aria-label="色の16進表記"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>説明 (凡例に出ます)</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="配信系の機材" />
            </div>
            <div className="space-y-1">
              <Label>表示順</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={crud.closeDialog}>やめる</Button>
              <Button
                onClick={() => crud.save.mutate({
                  name: form.name,
                  color_hex: form.color_hex,
                  description: form.description || null,
                  sort_order: Number(form.sort_order) || 0,
                })}
                disabled={!form.name || !form.color_hex || crud.save.isPending}
              >
                {crud.save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                {crud.isEditing ? '直す' : '足す'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
