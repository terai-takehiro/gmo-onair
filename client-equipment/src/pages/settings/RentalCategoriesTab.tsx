/**
 * ⑧ 設定 ／ 貸出カテゴリ (v4)
 *
 * 貸出機材の一覧をまとめる見出しです。並び順がそのまま一覧の並びになります。
 *
 * ── 同じ画面が2つあったのを1つにした ──────────────────────
 *
 * `RentalCategoryPage`（`/equipment/rental-categories`・**メニューに出ていなかった**）と
 * `ModelGroupPage` の中の `CategoryManagerDialog` が、**同じ4つの API を叩く
 * 同じ画面**でした。ダイアログのほうを消し、貸出機材の一覧からはここへ送ります。
 *
 * 並び順は**↑↓で2つ入れ替える**形のままにしてあります (数字を入力させると、
 * 同じ数字を2つ入れたときに並びが不定になります)。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, Loader2, Plus, X } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row, RowMain, RowSlot, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { RowActions } from './RowActions';

interface RentalCategory { id: string; name: string; sort_order: number }

export function RentalCategoriesTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const list = useQuery<RentalCategory[]>({
    queryKey: ['rental-categories'],
    queryFn: async () => (await api.get('/equipment/rental-categories')).data.data,
  });
  const categories = list.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['rental-categories'] });
    qc.invalidateQueries({ queryKey: ['model-groups'] });
  };

  const create = useMutation({
    mutationFn: (name: string) => api.post('/equipment/rental-categories', { name }),
    onSuccess: () => { invalidate(); setNewName(''); notifySuccess('カテゴリを足しました'); },
    onError: (e) => notifyApiError('足せませんでした', e),
  });
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/equipment/rental-categories/${id}`, { name }),
    onSuccess: () => { invalidate(); setEditingId(null); notifySuccess('名前を直しました'); },
    onError: (e) => notifyApiError('直せませんでした', e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/rental-categories/${id}`),
    onSuccess: () => { invalidate(); notifySuccess('カテゴリを消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });
  const reorder = useMutation({
    mutationFn: (order: { id: string; sort_order: number }[]) =>
      api.put('/equipment/rental-categories/reorder', { order }),
    onSuccess: invalidate,
    onError: (e) => notifyApiError('並べ替えられませんでした', e),
  });

  const move = (idx: number, dir: 'up' | 'down') => {
    const list2 = [...categories];
    const target = dir === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= list2.length) return;
    [list2[idx], list2[target]] = [list2[target], list2[idx]];
    reorder.mutate(list2.map((c, i) => ({ id: c.id, sort_order: i })));
  };

  const onDelete = async (cat: RentalCategory) => {
    const ok = await confirmAction({
      title: `カテゴリ「${cat.name}」を消しますか`,
      description: '割り当てている機材は消えません。カテゴリなしに戻り、貸出機材の一覧の末尾にまとまります。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) remove.mutate(cat.id);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="text-sub text-muted-foreground">
          貸出機材の一覧をまとめる見出しです。並び順がそのまま一覧の並びになります
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="新しいカテゴリ名 (例: コンバーター)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) create.mutate(newName.trim()); }}
            className="flex-1"
            aria-label="新しいカテゴリ名"
          />
          <Button disabled={!newName.trim() || create.isPending} onClick={() => create.mutate(newName.trim())}>
            {create.isPending
              ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Plus className="mr-1 h-4 w-4" aria-hidden="true" />}
            追加
          </Button>
        </div>

        {list.isError ? (
          <ErrorPanel title="カテゴリを読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
        ) : list.isLoading ? (
          <Delayed><SkeletonRows rows={4} rowHeight={44} /></Delayed>
        ) : categories.length === 0 ? (
          <EmptyState
            title="貸出カテゴリがまだ1件もありません"
            description="カテゴリを作ると、貸出機材の一覧がこの並びで見出しごとにまとまります。"
          />
        ) : (
          <div className="flex flex-col rounded-card border border-border bg-card">
            {categories.map((cat, idx) => (
              <Row key={cat.id} divider>
                <RowSlot w={56} align="center">
                  <span className="flex flex-col">
                    <button
                      type="button"
                      className="rounded-badge-xs p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      disabled={idx === 0 || reorder.isPending}
                      onClick={() => move(idx, 'up')}
                      aria-label={`${cat.name} を上へ`}
                    >
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="rounded-badge-xs p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      disabled={idx === categories.length - 1 || reorder.isPending}
                      onClick={() => move(idx, 'down')}
                      aria-label={`${cat.name} を下へ`}
                    >
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                </RowSlot>
                <RowMain>
                  {editingId === cat.id ? (
                    <span className="flex items-center gap-1">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editingName.trim()) update.mutate({ id: cat.id, name: editingName.trim() });
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="h-9"
                        aria-label="カテゴリ名"
                        autoFocus
                      />
                      <Button
                        variant="ghost" size="icon-sm" aria-label="名前を確定する"
                        disabled={update.isPending || !editingName.trim()}
                        onClick={() => update.mutate({ id: cat.id, name: editingName.trim() })}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="キャンセル" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </span>
                  ) : (
                    <RowTitle>{cat.name}</RowTitle>
                  )}
                </RowMain>
                <RowSlot w={96} align="right" placeholder="">
                  {editingId === cat.id ? null : (
                    <RowActions
                      name={cat.name}
                      onEdit={() => { setEditingId(cat.id); setEditingName(cat.name); }}
                      onDelete={() => onDelete(cat)}
                    />
                  )}
                </RowSlot>
              </Row>
            ))}
          </div>
        )}
      </div>

      <div className="w-full shrink-0 rounded-note border border-info-border bg-info-surface p-4 lg:w-[320px]">
        <p className="text-note text-secondary-foreground">
          カテゴリを消しても機材は消えず、カテゴリなしに戻ります。
          <strong className="font-bold">どの機材をどのカテゴリに入れるか</strong>は、
          機材台帳の「貸出機材」タブで型名ごとにまとめて決めます。
        </p>
      </div>
    </div>
  );
}
