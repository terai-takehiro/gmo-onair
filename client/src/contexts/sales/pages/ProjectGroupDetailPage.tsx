/**
 * 按分グループ詳細 (v4・新設URL `/sales/project-groups/:id`)
 *
 * **旧実装は画面内の `useState` で一覧⇄詳細を切り替えていた**（URLが変わらない）。
 * ブラウザの戻るが効かず、詳細をブックマーク・共有できず、再読み込みすると
 * 一覧に戻っていた。v4の他の詳細画面（`/sales/projects/:id` 等）と同じく
 * URLで現在地を持たせる形にした。
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Delayed, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PcOnlyPanel } from '@gmo-onair/shared/src/client-v4/pcOnly';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { MembersCard } from './projectGroup/MembersCard';
import { RevenueSection } from './projectGroup/RevenueSection';
import { PurchaseSection } from './projectGroup/PurchaseSection';
import { GroupFormDialog } from './projectGroup/GroupFormDialog';
import { PurchaseDialog } from './projectGroup/PurchaseDialog';
import { RevenueDialog } from './projectGroup/RevenueDialog';
import type { GroupDetail, GroupPurchase, GroupRevenue } from './projectGroup/types';

export default function ProjectGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const canDelete = hasPermission('sales', 'manager');

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [purchaseEditing, setPurchaseEditing] = useState<GroupPurchase | 'new' | null>(null);
  const [revenueEditing, setRevenueEditing] = useState<GroupRevenue | 'new' | null>(null);

  /**
   * 「分け方」編集（`AllocationEditor.tsx`）だけは PC のまま (a) を選んだ。
   * 複数案件の金額をその場で比べながら入力する作業で、この画面のPC専用理由
   * そのもの（全体を見ながら決める必要がある）がここにそのまま残るため。
   * 所属案件・グループ売上・グループ仕入の**閲覧**（下の3つのセクション本体）と
   * 削除（比較を伴わない単純な操作）はスマホでも開放する — 止めるのは
   * 追加・編集ダイアログ（内側に `AllocationEditor` を持つ）を開く操作だけ。
   * ボタン自体は隠さず、押すと PC 案内を出して「それでもこのまま開く」を選べるようにする
   * （`docs/design/v4/mobile.md` の「先に理由を読ませてから本人に選ばせる」と同じ形）
   */
  const isMobile = useIsMobile();
  const [purchasePcOnly, setPurchasePcOnly] = useState<GroupPurchase | 'new' | null>(null);
  const [revenuePcOnly, setRevenuePcOnly] = useState<GroupRevenue | 'new' | null>(null);
  const openPurchaseEditor = (target: GroupPurchase | 'new') => {
    if (isMobile) { setPurchasePcOnly(target); return; }
    setPurchaseEditing(target);
  };
  const openRevenueEditor = (target: GroupRevenue | 'new') => {
    if (isMobile) { setRevenuePcOnly(target); return; }
    setRevenueEditing(target);
  };

  const query = useQuery<{ data: GroupDetail }>({
    queryKey: ['project-group-detail', id],
    queryFn: async () => (await api.get(`/project-groups/${id}`)).data,
    enabled: !!id,
  });
  const detail = query.data?.data;

  const deleteGroupMutation = useMutation({
    mutationFn: () => api.delete(`/project-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-groups'] });
      notifySuccess('グループを削除しました');
      navigate('/sales/project-groups');
    },
    onError: (err) => notifyApiError('グループの削除に失敗しました', err),
  });

  const deletePurchaseMutation = useMutation({
    mutationFn: (purchaseId: string) => api.delete(`/project-groups/${id}/purchases/${purchaseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-group-detail', id] });
      qc.invalidateQueries({ queryKey: ['purchases-all'] });
      qc.invalidateQueries({ queryKey: ['project-groups'] });
      notifySuccess('仕入を削除しました');
    },
    onError: (err) => notifyApiError('仕入の削除に失敗しました', err),
  });

  const deleteRevenueMutation = useMutation({
    mutationFn: (revenueId: string) => api.delete(`/project-groups/${id}/revenues/${revenueId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-group-detail', id] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      qc.invalidateQueries({ queryKey: ['project-groups'] });
      notifySuccess('売上を削除しました');
    },
    onError: (err) => notifyApiError('売上の削除に失敗しました', err),
  });

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <Button variant="ghost" size="sm" className="w-fit gap-1 text-muted-foreground" onClick={() => navigate('/sales/project-groups')}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        グループ一覧
      </Button>

      {query.isError ? (
        <ErrorPanel title="グループを読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : !detail ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h1">{detail.name}</h1>
            <TableBadge label={`${detail.members.length}案件`} w={null} />
            {canEdit && (
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setGroupDialogOpen(true)}>
                  <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />編集
                </Button>
                {canDelete && (
                  <Button
                    variant="outline" size="sm" className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      if (!(await confirmAction({
                        title: 'このグループを削除しますか？',
                        description: '登録済みのグループ売上・仕入の分けた額もすべて消えます。',
                        confirmLabel: '削除する', tone: 'danger',
                      }))) return;
                      deleteGroupMutation.mutate();
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />削除
                  </Button>
                )}
              </div>
            )}
          </div>
          {detail.description && <p className="text-sub text-muted-foreground">{detail.description}</p>}

          <MembersCard members={detail.members} />

          <RevenueSection
            revenues={detail.revenues}
            canEdit={canEdit && detail.members.length > 0}
            canDelete={canDelete}
            onAdd={() => openRevenueEditor('new')}
            onEdit={openRevenueEditor}
            onDelete={(revId) => deleteRevenueMutation.mutate(revId)}
          />

          <PurchaseSection
            purchases={detail.purchases}
            canEdit={canEdit && detail.members.length > 0}
            canDelete={canDelete}
            onAdd={() => openPurchaseEditor('new')}
            onEdit={openPurchaseEditor}
            onDelete={(puId) => deletePurchaseMutation.mutate(puId)}
          />

          {(detail.purchases.length > 0 || detail.revenues.length > 0) && (
            <div className="flex flex-wrap justify-end gap-3">
              {detail.revenues.length > 0 && (
                <div className="rounded-card bg-surface-subtle p-3 text-right">
                  <span className="text-sub mr-3 text-muted-foreground">グループ売上合計</span>
                  <Money value={detail.total_revenue} className="text-cardtitle font-bold" />
                </div>
              )}
              {detail.purchases.length > 0 && (
                <div className="rounded-card bg-surface-subtle p-3 text-right">
                  <span className="text-sub mr-3 text-muted-foreground">グループ仕入合計</span>
                  <Money value={detail.total_purchase} className="text-cardtitle font-bold" />
                </div>
              )}
            </div>
          )}

          {groupDialogOpen && (
            <GroupFormDialog
              editing={detail}
              onClose={() => setGroupDialogOpen(false)}
              onSaved={() => setGroupDialogOpen(false)}
            />
          )}
          {purchaseEditing && (
            <PurchaseDialog
              key={purchaseEditing === 'new' ? 'new' : purchaseEditing.id}
              groupId={detail.id}
              members={detail.members}
              editing={purchaseEditing === 'new' ? null : purchaseEditing}
              onClose={() => setPurchaseEditing(null)}
            />
          )}
          {revenueEditing && (
            <RevenueDialog
              key={revenueEditing === 'new' ? 'new' : revenueEditing.id}
              groupId={detail.id}
              members={detail.members}
              editing={revenueEditing === 'new' ? null : revenueEditing}
              onClose={() => setRevenueEditing(null)}
            />
          )}
          {purchasePcOnly && (
            <Dialog open onOpenChange={(o) => { if (!o) setPurchasePcOnly(null); }}>
              <DialogContent className="max-w-md">
                <PcOnlyPanel
                  inset
                  what="グループ仕入の登録・編集"
                  why="複数の案件へ分ける金額を、案件ごとにその場で比べながら入力する画面です。"
                  onOpenAnyway={() => { setPurchaseEditing(purchasePcOnly); setPurchasePcOnly(null); }}
                />
              </DialogContent>
            </Dialog>
          )}
          {revenuePcOnly && (
            <Dialog open onOpenChange={(o) => { if (!o) setRevenuePcOnly(null); }}>
              <DialogContent className="max-w-md">
                <PcOnlyPanel
                  inset
                  what="グループ売上の登録・編集"
                  why="複数の案件へ分ける金額を、案件ごとにその場で比べながら入力する画面です。"
                  onOpenAnyway={() => { setRevenueEditing(revenuePcOnly); setRevenuePcOnly(null); }}
                />
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
