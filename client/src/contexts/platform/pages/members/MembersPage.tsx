/**
 * ③ 権限とメンバー（v4 設定・モックの3枚目）
 *
 * ── 権限モデルを単純化した（この版） ────────────────────────
 *
 * 以前は「役割（型）」と「人ごとの例外編集」の2階建てで、区画も実装の
 * 12個のままだった。ユーザーの指示（「アプリ単位で使える／使えないでいい」・
 * 「型だけにして個別の例外は廃止していい」）を受け、
 * - 区画を7つ（ブロックアプリ単位）に統合した
 * - 人ごとの例外編集（`UserPermissionsDialog`）を廃止し、**型だけ**にした
 * - 凍結4アプリも型の対象に含めた（以前は個人の例外編集でしか付けられなかった）
 *
 * 詳細は `docs/reviews/permission-model-simplification-plan.md`。
 *
 * ── 旧画面から変えたこと（引き続き有効） ────────────────────
 *
 * - **「権限修復」ボタンを外した。** 全スタッフに全区画を配る作りで、
 *   押すと**経理しか見てはいけない数字が全員に見えます**。役割ができた今は
 *   「役割を押し直す」が正しい直し方なので、そちらに置き換えました
 *   （API は残っているので、本当に要るときは system_admin から叩けます）。
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Users, ShieldAlert, UserPlus } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  EmptyState, Delayed, SkeletonRows, ErrorPanel, NoPermissionPanel,
} from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { MODULE_LABELS } from '@/contexts/platform/AuthContext';
import { ROLE_MODULE_ORDER, MODULE_TITLE, LEVEL_LABEL, LEVEL_TONE } from './moduleLabels';
import { RoleDialog } from './RoleDialog';
import { UserDialog } from './UserDialog';
import type { Member, Role, RolesResponse } from './types';

const STATUS_LABEL: Record<string, string> = {
  active: '在籍', invited: '招待中', inactive: '停止',
};

export default function MembersPage() {
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const isAdmin = currentUser?.role === 'system_admin';

  const [pickedRole, setPickedRole] = useState<string | null>(null);
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role: Role | null }>({ open: false, role: null });
  const [userDialog, setUserDialog] = useState<{ open: boolean; user: Member | null }>({ open: false, user: null });

  const rq = useQuery<RolesResponse>({
    queryKey: ['permission-roles'],
    queryFn: async () => (await api.get('/permission-roles')).data.data,
  });
  const uq = useQuery<Member[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users', { params: { limit: 200 } })).data.data,
  });

  const roles = rq.data?.roles ?? [];
  // 初回は先頭の役割を開く。**「全員」を初期にしない** — 役割が主役の画面なので
  const current = roles.find((r) => r.id === pickedRole) ?? (pickedRole === '__all' ? null : roles[0] ?? null);
  const showAll = pickedRole === '__all';

  const members = useMemo(() => {
    const all = uq.data ?? [];
    if (showAll || !current) return all;
    return all.filter((u) => u.permission_role_id === current.id);
  }, [uq.data, current, showAll]);

  const noRole = useMemo(() => (uq.data ?? []).filter((u) => !u.permission_role_id).length, [uq.data]);

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['permission-roles'] });
      notifySuccess('メンバーを消しました');
    },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  const delRole = useMutation({
    mutationFn: (id: string) => api.delete(`/permission-roles/${id}`),
    onSuccess: () => {
      setPickedRole(null);
      qc.invalidateQueries({ queryKey: ['permission-roles'] });
      notifySuccess('役割を消しました');
    },
    onError: (e) => notifyApiError('役割を消せませんでした', e),
  });

  if (!isAdmin) {
    return <NoPermissionPanel modules={['admin']} level="manager" target="権限とメンバー" />;
  }

  return (
    <div className="flex flex-col gap-3.5 p-3 lg:gap-4 lg:p-6">
      <PageHeader
        title="権限とメンバー"
        sub="権限は人ではなく役割に付けます。役割を押すと、その人の権限がまとめて書き換わります。"
        primaryAction={
          <Button onClick={() => setUserDialog({ open: true, user: null })}>
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />メンバーを招く
          </Button>
        }
      />

      {rq.isError ? (
        <ErrorPanel title="役割を読み込めませんでした" error={rq.error} onRetry={() => rq.refetch()} />
      ) : (
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start">
          {/* 役割のレール */}
          {/* モックのレールは 246px だが、幅は 7 段 (…200 / 240) から選ぶ決まりなので
              240px にした。6px の差は見て分からず、段を1つ増やすと以後のページで
              「レールは 246 か 240 か」が毎回ぶれる */}
          <div className="rounded-card w-full shrink-0 overflow-hidden border border-border bg-card lg:w-[240px]">
            <p className="text-th border-b border-border-faint px-3.5 py-2.5 text-muted-foreground">役割</p>
            {rq.isLoading ? (
              <Delayed><SkeletonRows rows={5} /></Delayed>
            ) : (
              <>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPickedRole(r.id)}
                    className={cn(
                      'min-h-tap flex w-full items-center gap-2.5 border-b border-border-faint px-3.5 py-2.5 text-left',
                      current?.id === r.id && !showAll ? 'bg-primary-surface-weak' : 'bg-card',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', current?.id === r.id && !showAll ? 'bg-primary' : 'bg-border')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('text-list block truncate', current?.id === r.id && !showAll && 'text-primary')}>{r.name}</span>
                      <span className="text-note block truncate text-muted-foreground">{r.description}</span>
                    </span>
                    <span className="text-note shrink-0 text-muted-foreground">{r.member_count}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPickedRole('__all')}
                  className={cn(
                    'min-h-tap flex w-full items-center gap-2.5 border-b border-border-faint px-3.5 py-2.5 text-left',
                    showAll ? 'bg-primary-surface-weak' : 'bg-card',
                  )}
                >
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className={cn('text-list block', showAll && 'text-primary')}>全員</span>
                    {noRole > 0 && (
                      <span className="text-note block text-warning">役割なしが {noRole} 名</span>
                    )}
                  </span>
                  <span className="text-note shrink-0 text-muted-foreground">{uq.data?.length ?? 0}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRoleDialog({ open: true, role: null })}
                  className="min-h-tap text-sub flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-primary"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />役割を足す
                </button>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            {/* 役割の中身 */}
            {current && !showAll && (
              <div className="rounded-card overflow-hidden border border-border bg-card">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="text-cardtitle block">{current.name}</span>
                    <span className="text-note block text-muted-foreground">{current.description}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setRoleDialog({ open: true, role: current })}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />直す
                  </Button>
                  {!current.is_builtin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => confirmAction({
                        title: `${current.name} を消しますか`,
                        description: 'この役割を押している人がいると消せません。先に別の役割へ移してください。',
                        confirmLabel: '消す',
                        tone: 'danger',
                      }).then((ok) => ok && delRole.mutate(current.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 px-4 py-3">
                  {ROLE_MODULE_ORDER.map((m) => {
                    const lv = current.modules[m] ?? 'none';
                    return (
                      <span
                        key={m}
                        className={cn('rounded-note text-note inline-flex items-center gap-1.5 px-2.5 py-1', LEVEL_TONE[lv])}
                      >
                        {MODULE_TITLE[m] ?? MODULE_LABELS[m] ?? m}
                        <strong className="font-bold">{LEVEL_LABEL[lv]}</strong>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* メンバー */}
            <div className="rounded-card overflow-hidden border border-border bg-card">
              <p className="text-th border-b border-border-faint px-4 py-2.5 text-muted-foreground">
                {showAll ? `全員 ${members.length} 名` : `この役割の人 ${members.length} 名`}
              </p>
              {uq.isError ? (
                <ErrorPanel title="メンバーを読み込めませんでした" error={uq.error} onRetry={() => uq.refetch()} />
              ) : uq.isLoading ? (
                <Delayed><SkeletonRows rows={5} /></Delayed>
              ) : members.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-6 w-6" aria-hidden="true" />}
                  title="この役割の人はまだいません"
                  description="メンバーを招くとき、または一覧の鉛筆から役割を押せます。"
                />
              ) : (
                <>
                  <RowHeader>
                    <RowMain>氏名</RowMain>
                    <RowSlot w={200} hideOnMobile>メール</RowSlot>
                    <RowSlot w={96}>状態</RowSlot>
                    <RowSlot w={128} hideOnMobile>最終ログイン</RowSlot>
                    <RowSlot w={128} align="right"> </RowSlot>
                  </RowHeader>
                  {members.map((u) => {
                    const role = roles.find((r) => r.id === u.permission_role_id) ?? null;
                    return (
                      <Row key={u.id} density="table" divider stackOnMobile>
                        <RowMain>
                          <span className="text-list block truncate">{u.name}</span>
                          <span className="text-note block truncate text-muted-foreground">
                            {u.role === 'system_admin' ? 'システム管理者' : (role?.name ?? '役割なし')}
                            <span className="sm:hidden"> ・ {u.email}</span>
                          </span>
                        </RowMain>
                        <RowSlot w={200} hideOnMobile>
                          <span className="text-sub truncate text-muted-foreground">{u.email}</span>
                        </RowSlot>
                        <RowSlot w={96}>
                          <TableBadge label={STATUS_LABEL[u.status ?? 'active'] ?? u.status ?? ''} w={96} />
                        </RowSlot>
                        <RowSlot w={128} hideOnMobile placeholder={<span className="text-note text-muted-foreground">—</span>}>
                          {u.last_login_at ? <span className="text-sub">{formatDate(u.last_login_at)}</span> : null}
                        </RowSlot>
                        <RowSlot w={128} align="right">
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="直す" onClick={() => setUserDialog({ open: true, user: u })}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              title="消す"
                              onClick={() => confirmAction({
                                title: `${u.name} を消しますか`,
                                description: 'ログインできなくなります。過去に作った案件や記録は残ります。',
                                confirmLabel: '消す',
                                tone: 'danger',
                              }).then((ok) => ok && del.mutate(u.id))}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </RowSlot>
                      </Row>
                    );
                  })}
                </>
              )}
            </div>

            <p className="rounded-note text-note flex items-start gap-2 border border-border bg-surface-subtle px-3.5 py-3 text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                権限を直しても、<strong className="font-bold">本人がログインし直すまで効きません</strong>
                （ログインしたときの権限を持ち歩く作りのため）。急ぐときは本人に一度ログアウトしてもらってください。
              </span>
            </p>
          </div>
        </div>
      )}

      <RoleDialog
        role={roleDialog.role}
        open={roleDialog.open}
        onOpenChange={(v) => setRoleDialog((s) => ({ ...s, open: v }))}
      />
      <UserDialog
        user={userDialog.user}
        roles={roles}
        open={userDialog.open}
        onOpenChange={(v) => setUserDialog((s) => ({ ...s, open: v }))}
      />
    </div>
  );
}
