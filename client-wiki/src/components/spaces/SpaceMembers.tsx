/**
 * スペースのメンバー（閲覧範囲が「メンバーだけ」のとき・設計 §8）
 *
 * 追加と削除はその場で保存します（シートの「保存」を待たない）。メンバーは
 * 名前や説明と違って1人ずつの操作なので、まとめて保存にすると「追加したつもりで
 * 閉じたら消えていた」が起きるためです。
 *
 * ⚠️ サーバーが断るのは2つ（`wiki-space-admin.service.ts` の `removeSpaceMember`）:
 *   - **担当**は外せない（外すと見直しの通知が届かなくなる）
 *   - **自分**は外せない（外した瞬間にこのスペースが見えなくなり、戻せなくなる）
 * 画面でも同じ人の「削除」を押せなくして理由を添えます。判定の正はサーバーです。
 *
 * ⚠️ このコンポーネントはシートの `<form>` の中に置かれるので、**すべてのボタンに
 * `type="button"` を書きます**（書かないと押しただけでシートの保存が走る・`check-form-submit.mjs`）。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/hooks/useAuth';
import { useOnairUsers } from '@/components/page/pageOpsApi';
import {
  addSpaceMember,
  removeSpaceMember,
  spaceAdminKeys,
  useSpaceAdminRefresh,
  useSpaceMembers,
  type AdminSpace,
} from './spaceAdminApi';

const FIELD_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground lg:h-10 lg:min-h-0';

export default function SpaceMembers({ space }: { space: AdminSpace }) {
  const qc = useQueryClient();
  const refresh = useSpaceAdminRefresh();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'system_admin';
  const membersQ = useSpaceMembers(space.id, true);
  const usersQ = useOnairUsers(true);
  const [pick, setPick] = useState('');

  const members = membersQ.data ?? [];
  const memberIds = new Set(members.map((m) => m.user_id));
  const candidates = (usersQ.data ?? []).filter((u) => !memberIds.has(u.id));

  const done = (rows: unknown, message: string) => {
    qc.setQueryData(spaceAdminKeys.members(space.id), rows);
    refresh.all();
    notifySuccess(message);
  };

  const add = useMutation({
    meta: { action: 'メンバーの追加' },
    mutationFn: (userId: string) => addSpaceMember(space.id, userId),
    onSuccess: (rows) => { setPick(''); done(rows, 'メンバーに追加しました'); },
  });
  const remove = useMutation({
    meta: { action: 'メンバーの削除' },
    mutationFn: (userId: string) => removeSpaceMember(space.id, userId),
    onSuccess: (rows) => done(rows, 'メンバーから削除しました'),
  });

  /** 押せない理由（無ければ null）。サーバーと同じ2つ */
  const lockedReason = (userId: string): string | null => {
    if (userId === space.owner_user_id) return '担当';
    if (userId === currentUser?.id && !isAdmin) return 'あなた';
    return null;
  };

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="space-members-title">
      <div>
        <h3 id="space-members-title" className="text-cardtitle text-foreground">
          メンバー{membersQ.data ? `（${members.length}人）` : ''}
        </h3>
        <p className="text-sub-sm text-muted-foreground">
          担当とあなた自身は削除できません（見直しの通知が届かなくなる・このスペースが見えなくなるため）。
        </p>
      </div>

      {membersQ.isError ? (
        <p className="text-sub text-destructive">メンバーを読み込めませんでした。閉じてから、もう一度開いてください。</p>
      ) : (
        <ul className="overflow-hidden rounded-card border border-border">
          {members.map((m) => {
            const locked = lockedReason(m.user_id);
            return (
              <li key={m.user_id} className="flex min-h-tap items-center gap-2 border-b border-border px-3 last:border-b-0">
                <span className="min-w-0 flex-1 truncate text-list text-foreground">{m.name}</span>
                {locked ? (
                  <span className="shrink-0 text-sub-sm text-muted-foreground">{locked}</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(m.user_id)}
                  >
                    削除
                  </Button>
                )}
              </li>
            );
          })}
          {membersQ.isLoading && (
            <li className="px-3 py-2.5 text-sub text-muted-foreground">読み込んでいます…</li>
          )}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label className="text-th text-muted-foreground" htmlFor="space-member-add">メンバーを追加</Label>
        <div className="flex gap-2">
          <select
            id="space-member-add"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className={FIELD_CLASS}
            disabled={usersQ.isLoading || add.isPending}
          >
            <option value="">選んでください</option>
            {candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <Button
            type="button"
            className="shrink-0"
            disabled={!pick || add.isPending}
            onClick={() => add.mutate(pick)}
          >
            {add.isPending ? '追加中…' : '追加'}
          </Button>
        </div>
      </div>
    </section>
  );
}
