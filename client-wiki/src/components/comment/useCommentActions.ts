/**
 * コメントの書き込み3つ（投稿・解決／戻す・削除）をまとめたフック（段F・§6-②）
 *
 * 失敗の知らせは共通の受け皿に任せます（`useMutation({ meta: { action } })`）。
 * 書けたら一覧を取り直すだけで、画面側に写しを持ちません — 同じページを
 * 右パネルと本文の下の両方から出しているので、写しを持つと片方だけ古くなります。
 *
 * ⚠️ **削除は取り消せない**ので `confirmAction({ tone: 'danger' })` で1回止めます
 * （ルート `CLAUDE.md`）。消せるのは**書いた本人か manager だけ**で、
 * 最後に決めるのはサーバーです（画面はボタンを出す・出さないだけ）。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import {
  deleteWikiComment,
  postWikiComment,
  resolveWikiComment,
  wikiCommentKeys,
} from '@/components/page/commentApi';

/** 確認の文に出す抜き書き。長いコメントは頭だけ */
function shortOf(bodyMd: string): string {
  const one = bodyMd.replace(/\s+/g, ' ').trim();
  return one.length > 40 ? `${one.slice(0, 40)}…` : one;
}

export function useCommentActions(pageId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: wikiCommentKeys.list(pageId) });
  };

  const post = useMutation({
    meta: { action: 'コメントを投稿' },
    mutationFn: (v: { body: string; parentId?: string | null }) =>
      postWikiComment(pageId, v.body, v.parentId),
    onSuccess: refresh,
  });

  const resolve = useMutation({
    meta: { action: 'コメントの状態を変更' },
    mutationFn: (v: { id: string; resolved: boolean }) => resolveWikiComment(v.id, v.resolved),
    onSuccess: refresh,
  });

  const remove = useMutation({
    meta: { action: 'コメントを削除' },
    mutationFn: (id: string) => deleteWikiComment(id),
    onSuccess: refresh,
  });

  return {
    /** 書く。**失敗したら打った文を残す**ので、待てる形で返します */
    send: (body: string, parentId?: string | null) => post.mutateAsync({ body, parentId }),
    sending: post.isPending,

    setResolved: (id: string, resolved: boolean) => resolve.mutate({ id, resolved }),
    resolving: resolve.isPending,

    askRemove: async (comment: { id: string; body_md: string }) => {
      const ok = await confirmAction({
        title: 'このコメントを消しますか',
        description: `「${shortOf(comment.body_md)}」を消します。元に戻せません。`,
        confirmLabel: '消す',
        tone: 'danger',
      });
      if (ok) remove.mutate(comment.id);
    },
    removing: remove.isPending,
  };
}

export type CommentActions = ReturnType<typeof useCommentActions>;
