/**
 * スペースの追加・編集（区画 `wiki` の manager・設計 §8）
 *
 * `space` が null なら追加、あれば編集です。
 *
 * ⚠️ **URL に使う名前（`key`）は追加するときだけ入れられます。** あとから変えると
 * `/wiki/s/:key` の URL と、どこかに貼られたリンクが切れるためです（サーバーも断る）。
 *
 * ⚠️ **送るときは、名前・説明・URL に使う名前をフォームの DOM から読みます。**
 * これらの欄は日本語入力を壊さない `BufferedInput` で、値を外へ渡すのは
 * 「打つのが止まって 500ms 後／フォーカスを外したとき」です。打ってすぐ Enter を押すと
 * state はまだ前の値なので、state を読むと**最後の数文字が落ちた名前で保存されます**。
 * 欄に見えている値（DOM）を `FormData` で読めば落ちません。
 *
 * ⚠️ 担当を決めたとき・「メンバーだけ」に切り替えたときは、サーバーが**担当と自分を
 * メンバーに加えます**（担当が締め出されると見直しの通知が届かなくなる・#735）。
 */
import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Label } from '@gmo-onair/shared/src/client/ui/label';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { WikiSpaceVisibility } from '@gmo-onair/shared/src/wiki/types';
import BufferedInput from '@/components/editor/BufferedInput';
import { useOnairUsers } from '@/components/page/pageOpsApi';
import SpaceMembers from './SpaceMembers';
import {
  createSpace,
  deleteSpace,
  updateSpace,
  useSpaceAdminRefresh,
  VISIBILITY_LABEL,
  VISIBILITY_NOTE,
  type AdminSpace,
} from './spaceAdminApi';

const FIELD_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground lg:h-10 lg:min-h-0';

const VISIBILITIES: WikiSpaceVisibility[] = ['all', 'members'];

/** 値は DOM から読むので、欄の `onCommit` は何もしない（冒頭の注記） */
const ignore = () => {};

export interface SpaceEditSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null なら追加 */
  space: AdminSpace | null;
}

export default function SpaceEditSheet({ open, onOpenChange, space }: SpaceEditSheetProps) {
  const refresh = useSpaceAdminRefresh();
  const usersQ = useOnairUsers(open);
  const [visibility, setVisibility] = useState<WikiSpaceVisibility>('all');
  const [owner, setOwner] = useState('');

  // 開くたびに、開いたスペースの値で入れ直す（前に開いたスペースの選択を引きずらない）
  useEffect(() => {
    if (!open) return;
    setVisibility(space?.visibility ?? 'all');
    setOwner(space?.owner_user_id ?? '');
  }, [open, space]);

  const save = useMutation({
    meta: { action: space ? 'スペースの保存' : 'スペースの追加' },
    mutationFn: async (fd: FormData) => {
      const name = String(fd.get('name') ?? '');
      const description = String(fd.get('description') ?? '');
      const common = { name, description: description || null, visibility, owner_user_id: owner || null };
      return space
        ? updateSpace(space.id, common)
        : createSpace({ ...common, key: String(fd.get('key') ?? '') });
    },
    onSuccess: (row) => {
      refresh.all();
      notifySuccess(space ? 'スペースを保存しました' : 'スペースを追加しました', {
        description: row.visibility === 'members'
          ? `「${row.name}」は${VISIBILITY_LABEL.members}が読めます。担当とあなたはメンバーに入っています。`
          : `「${row.name}」は${VISIBILITY_LABEL.all}が読めます。`,
      });
      onOpenChange(false);
    },
  });

  const remove = useMutation({
    meta: { action: 'スペースの削除' },
    mutationFn: (id: string) => deleteSpace(id),
    onSuccess: () => {
      refresh.all();
      notifySuccess('スペースを削除しました');
      onOpenChange(false);
    },
  });

  const askAndRemove = async () => {
    if (!space) return;
    const ok = await confirmAction({
      title: `「${space.name}」を削除しますか？`,
      description: '削除すると元に戻せません。URL に使っていた名前も、別のスペースでは使えなくなります。',
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (ok) remove.mutate(space.id);
  };

  const pages = space?.all_page_count ?? 0;
  const busy = save.isPending || remove.isPending;
  const users = usersQ.data ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={space ? 'スペースを編集' : 'スペースを追加'}
      sub={space ? `/wiki/s/${space.key}` : 'ページを分野ごとにまとめる単位です。閲覧範囲はスペースごとに決めます'}
      size="md"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) save.mutate(new FormData(e.currentTarget));
      }}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {space && (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={busy || pages > 0}
                onClick={() => void askAndRemove()}
              >
                削除
              </Button>
              {pages > 0 && (
                <span className="text-sub-sm text-muted-foreground">ページが{pages}件あるため削除できません</span>
              )}
            </div>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              キャンセル
            </Button>
            <Button type="submit" disabled={busy}>
              {save.isPending ? '保存中…' : space ? '保存' : '追加'}
            </Button>
          </div>
        </div>
      }
    >
      {/* 開き直すたびに欄を作り直す（前に開いたスペースの入力を残さない） */}
      <div key={`${space?.id ?? 'new'}-${open ? 1 : 0}`} className="flex flex-col gap-4">
        {!space && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-th text-muted-foreground" htmlFor="space-key">URL に使う名前</Label>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-list text-muted-foreground">/wiki/s/</span>
              <BufferedInput
                id="space-key"
                name="key"
                value=""
                onCommit={ignore}
                required
                autoComplete="off"
                className={FIELD_CLASS}
              />
            </div>
            <p className="text-sub-sm text-muted-foreground">
              半角の小文字・数字・ハイフンで2〜32字。あとから変えられません（貼られたリンクが切れるため）。
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-th text-muted-foreground" htmlFor="space-name">名前</Label>
          <BufferedInput
            id="space-name"
            name="name"
            value={space?.name ?? ''}
            onCommit={ignore}
            required
            maxLength={60}
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-th text-muted-foreground" htmlFor="space-description">説明（任意）</Label>
          <BufferedInput
            id="space-description"
            name="description"
            value={space?.description ?? ''}
            onCommit={ignore}
            maxLength={200}
            className={FIELD_CLASS}
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-th text-muted-foreground">閲覧範囲</legend>
          {VISIBILITIES.map((v) => (
            <label
              key={v}
              className="flex min-h-tap cursor-pointer items-start gap-2.5 rounded-control-lg border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary-surface-weak"
            >
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
                className="mt-1 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-list text-foreground">{VISIBILITY_LABEL[v]}</span>
                <span className="block text-sub-sm text-muted-foreground">{VISIBILITY_NOTE[v]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <Label className="text-th text-muted-foreground" htmlFor="space-owner">担当</Label>
          <select
            id="space-owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            disabled={usersQ.isLoading}
            className={FIELD_CLASS}
          >
            <option value="">担当なし</option>
            {/* 一覧に居ない担当（退職など）でも、いまの値が消えて見えないようにする */}
            {owner && !users.some((u) => u.id === owner) && (
              <option value={owner}>{space?.owner_name ?? owner}</option>
            )}
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <p className="text-sub-sm text-muted-foreground">
            毎月1日に「今月の見直し」の通知が届く人です。担当がいないと、見直しの通知は誰にも届きません。
          </p>
        </div>

        {space && space.visibility !== visibility && (
          <p className="rounded-note border border-info-border bg-info-surface px-3 py-2.5 text-sub text-foreground">
            {visibility === 'members'
              ? '保存すると「メンバーだけ」になり、担当とあなたがメンバーに入ります。ほかの人は保存したあとで追加してください。'
              : '保存すると全員が読めるようになります。メンバーの一覧は残るので、戻したときにそのまま使えます。'}
          </p>
        )}

        {/* メンバーは保存済みの閲覧範囲が「メンバーだけ」のときだけ出す（切り替え中は上の案内だけ） */}
        {space && space.visibility === 'members' && visibility === 'members' && (
          <SpaceMembers space={space} />
        )}
      </div>
    </Sheet>
  );
}
