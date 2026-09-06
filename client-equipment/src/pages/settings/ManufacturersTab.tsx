/**
 * ⑧ 設定 ／ メーカー・色 (v4)
 *
 * メーカー名の表記ゆれを1つにまとめる場所です。右に「機材の色」を並べています
 * (モックと同じ配置 — どちらも機材に貼る属性なので、別タブにすると探すときに
 * どちらにあるか思い出す必要があります)。
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { useCrudPage } from '@/hooks/useCrudPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { RowActions } from './RowActions';
import { ColorsCard } from './ColorsCard';

interface Manufacturer {
  id: string;
  name: string;
  contact_person?: string;
  address?: string;
  phone?: string;
  email?: string;
  sort_order?: number;
  notes?: string;
}

interface ManufacturerForm {
  name: string; contact_person: string; address: string;
  phone: string; email: string; sort_order: string; notes: string;
}

const EMPTY_FORM: ManufacturerForm = {
  name: '', contact_person: '', address: '', phone: '', email: '', sort_order: '0', notes: '',
};

export function ManufacturersTab() {
  const [form, setForm] = useState<ManufacturerForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  const crud = useCrudPage<Manufacturer>({
    endpoint: '/equipment/manufacturers',
    queryKey: ['equipment-manufacturers'],
    onSaveSuccess: () => { setSaveError(null); notifySuccess('メーカーを保存しました'); },
    onDeleteSuccess: () => notifySuccess('メーカーを削除しました'),
    onError: (action, err) => {
      if (action === 'save') {
        const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
        setSaveError(e?.response?.data?.error?.message || e?.message || '保存できませんでした');
      } else {
        notifyApiError('削除できませんでした', err);
      }
    },
  });

  useEffect(() => {
    const m = crud.editingItem;
    setForm(m ? {
      name: m.name || '',
      contact_person: m.contact_person || '',
      address: m.address || '',
      phone: m.phone || '',
      email: m.email || '',
      sort_order: m.sort_order?.toString() || '0',
      notes: m.notes || '',
    } : EMPTY_FORM);
    setSaveError(null);
  }, [crud.editingItem]);

  const onDelete = async (m: Manufacturer) => {
    const ok = await confirmAction({
      title: `メーカー「${m.name}」を削除しますか`,
      description: 'このメーカーを選んでいる機材・ケーブル・コネクタはメーカーなしに戻ります。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) crud.remove.mutate(m.id);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sub text-muted-foreground">メーカー名の表記ゆれを1つにまとめます</p>
          <div className="flex-1" />
          <Button onClick={crud.openAdd}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />メーカーを追加
          </Button>
        </div>

        {crud.isError ? (
          <ErrorPanel title="メーカーを読み込めませんでした" error={crud.error} onRetry={() => crud.refetch()} />
        ) : crud.isLoading ? (
          <Delayed><SkeletonRows rows={5} /></Delayed>
        ) : crud.items.length === 0 ? (
          <EmptyState
            title="メーカーがまだ1件もありません"
            description="機材・ケーブル・コネクタのメーカー欄はここで作った名前から選びます。"
          />
        ) : (
          <div className="flex flex-col rounded-card border border-border bg-card">
            <RowHeader className="hidden sm:flex">
              <RowMain>メーカー ／ メール</RowMain>
              <RowSlot w={96}>担当者</RowSlot>
              <RowSlot w={128}>電話</RowSlot>
              <RowSlot w={96} align="right">{''}</RowSlot>
            </RowHeader>
            {crud.items.map((m) => (
              <Row key={m.id} divider interactive stackOnMobile>
                <RowMain>
                  <RowTitle>{m.name}</RowTitle>
                  <RowSub>{m.email || m.address || '連絡先なし'}</RowSub>
                </RowMain>
                <RowSlot w={96} hideOnMobile>
                  {m.contact_person && (
                    <span className="truncate text-sub-sm text-secondary-foreground">{m.contact_person}</span>
                  )}
                </RowSlot>
                <RowSlot w={128} hideOnMobile>
                  {m.phone && <span className="font-number text-sub-sm text-secondary-foreground">{m.phone}</span>}
                </RowSlot>
                <RowSlot w={96} align="right" placeholder="">
                  <RowActions name={m.name} onEdit={() => crud.openEdit(m)} onDelete={() => onDelete(m)} />
                </RowSlot>
              </Row>
            ))}
          </div>
        )}
      </div>

      <div className="w-full shrink-0 lg:w-[340px]">
        <ColorsCard />
      </div>

      <FormDialog
        open={crud.dialogOpen}
        onOpenChange={crud.setDialogOpen}
        title={crud.isEditing ? 'メーカーを編集' : 'メーカーを追加'}
        // 入力7個・電話/メール・表示順/備考の2列グリッドを2つ持つので `lg`(840px)
        size="lg"
        footer={
          <FormDialogFooter>
            <Button variant="outline" onClick={crud.closeDialog}>キャンセル</Button>
            <Button
              onClick={() => crud.save.mutate({ ...form, sort_order: Number(form.sort_order) || 0 })}
              disabled={crud.save.isPending || !form.name.trim()}
            >
              {crud.save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              {crud.isEditing ? '編集' : '追加'}
            </Button>
          </FormDialogFooter>
        }
      >
        {saveError && (
          <p className="mb-3 rounded-control border border-destructive-border bg-destructive-surface px-3 py-2 text-sub text-destructive">
            {saveError}
          </p>
        )}
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>メーカー名 *</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="SONY" autoFocus />
          </div>
          <div className="space-y-1">
            <Label>担当者</Label>
            <Input value={form.contact_person} onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))} placeholder="山田 太郎" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>電話</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="03-0000-0000" />
            </div>
            <div className="space-y-1">
              <Label>メール</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="support@example.com" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>住所</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="東京都渋谷区…" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>表示順</Label>
              <Input type="number" min="0" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>
      </FormDialog>
    </div>
  );
}
