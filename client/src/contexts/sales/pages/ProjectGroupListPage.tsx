/**
 * 按分グループ 一覧 (v4)
 *
 * 複数のGLS案件にまたがる仕入・売上を、案件ごとに按分して記録する台帳。
 * 詳細は `ProjectGroupDetailPage.tsx`（`/sales/project-groups/:id`）。
 * **旧実装は一覧と詳細が同じファイル・同じ画面内 `useState` の切り替え**だった。
 * 詳細をURLで持てず、ブラウザの戻る・ブックマーク・再読み込みのどれも
 * 一覧に戻ってしまっていたので、v4の他の詳細画面と同じくURLを分けた。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonCard, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { GroupFormDialog } from './projectGroup/GroupFormDialog';
import type { GroupSummary } from './projectGroup/types';

export default function ProjectGroupListPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');

  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery<{ data: GroupSummary[] }>({
    queryKey: ['project-groups'],
    queryFn: async () => (await api.get('/project-groups?limit=100')).data,
  });
  const groups = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="費用を分け合うグループ"
        sub="複数の案件にまたがる仕入・売上を、案件ごとに金額を分けて記録します"
        primaryAction={
          canEdit ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />新規グループ
            </Button>
          ) : undefined
        }
      />

      {query.isError ? (
        <ErrorPanel title="費用を分け合うグループを読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Delayed>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </Delayed>
      ) : groups.length === 0 ? (
        <EmptyState
          title="費用を分け合うグループがありません"
          description="複数案件で費用や売上を共有するとき、グループを作成すると案件ごとに自動で金額を分けて記録します。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => navigate(`/sales/project-groups/${g.id}`)}
              className="rounded-card min-w-0 border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-background"
            >
              <div className="truncate font-bold">{g.name}</div>
              {g.description && <p className="text-note mt-1 truncate text-muted-foreground">{g.description}</p>}
              {/*
                **375pxで実測して見つけた崩れ（このタスクで修正）**: `grid` に列数の
                指定が無いモバイル幅では、グリッドの列がこのカードの中身（金額）の
                max-content 幅まで広がってしまい、カード自体が画面より広くなって
                右端の金額が画面外に切れていた（`document.scrollWidth` には出ない
                — `#root` の `overflow:hidden` で見えなくなるだけなので、
                横スクロールバーも出ず気づけない）。`grid-cols-1` で列幅を
                コンテナ幅に固定し、`min-w-0` でカード自身の縮みも許可した。
              */}
              <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <TableBadge label={`${g.member_count}案件`} w={null} />
                <div className="min-w-0 text-right text-note">
                  {g.total_revenue > 0 && <div>売上 <Money value={g.total_revenue} className="inline-flex font-bold" /></div>}
                  {g.total_purchase > 0 && <div>仕入 <Money value={g.total_purchase} className="inline-flex font-bold" /></div>}
                  {g.total_revenue === 0 && g.total_purchase === 0 && <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {dialogOpen && (
        <GroupFormDialog
          editing={null}
          onClose={() => setDialogOpen(false)}
          onSaved={(groupId) => { setDialogOpen(false); navigate(`/sales/project-groups/${groupId}`); }}
        />
      )}
    </div>
  );
}
