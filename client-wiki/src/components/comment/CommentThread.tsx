/**
 * コメント1本（最初の1件と、その返信）（段F・docs/design/v4/wiki.md §6-②）
 *
 * **返信は1段だけ**（`wiki_comments.parent_id`）。返信に返信はできません —
 * 深く枝分かれしたやり取りは、あとから読む人が結論を拾えなくなるためです。
 *
 * ⚠️ **本文は既存の `WikiMarkdown` で描きます**（`rehype-raw` を入れない＝
 * HTML を描かない）。コメントは読む人（reader）も書けるので、ページ本文より
 * 広い範囲の人が書いた文字がここを通ります（§7-5）。
 *
 * ⚠️ **消せるのは書いた本人か manager だけ**（§8 の表）。判定はサーバーが
 * 1件ごとに `can_delete` で返すので、画面はそれに従います（同じ判定を
 * 画面でもう一度書くと、片方を直した日に食い違います）。
 *
 * ⚠️ **解決にする／戻すは、そのページを読める人なら誰でも押せます**
 * （§8 の表でコメントは reader の操作。サーバーも reader で受けています）。
 * 聞いた人が自分で片づけられないと、済んだやり取りが並んだままになります。
 * 間違って押しても「解決を取り消す」で戻せます。
 */
import { useState } from 'react';
import type { WikiComment } from '@gmo-onair/shared/src/wiki/types';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import type { WikiCommentThread } from '@/components/page/commentApi';
import { updatedLabel } from '@/lib/wikiFormat';
import { cn } from '@/lib/utils';
import CommentComposer from './CommentComposer';
import type { CommentActions } from './useCommentActions';

const ACTION_BUTTON = 'flex min-h-tap items-center rounded-control px-2 text-sub-sm '
  + 'text-secondary-foreground hover:bg-muted lg:h-8 lg:min-h-0';

export interface CommentThreadProps {
  thread: WikiCommentThread;
  currentUserId: string | null;
  /** 人のコメントも消せるか（manager）。サーバーの `can_delete` が無いときの控え */
  canManage: boolean;
  actions: CommentActions;
}

function CommentBody({
  comment,
  currentUserId,
  canManage,
  onRemove,
  removing,
  children,
}: {
  comment: WikiComment;
  currentUserId: string | null;
  canManage: boolean;
  onRemove: () => void;
  removing: boolean;
  /** 返信・解決のような、そのコメントだけの操作 */
  children?: React.ReactNode;
}) {
  // サーバーの判定を優先し、無いときだけ画面で見分ける
  const canRemove = comment.can_delete
    ?? (canManage || (!!currentUserId && comment.created_by === currentUserId));

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-list text-foreground">{comment.creator_name || '（名前なし）'}</span>
        <span className="text-sub-sm text-muted-foreground">{updatedLabel(comment.created_at)}</span>
        {comment.resolved_at && (
          <span className="rounded-badge border border-success-border bg-success-surface px-1.5 text-sub-sm text-success">
            解決済み
          </span>
        )}
      </div>

      {/*
        ⚠️ **`nested` で描きます。** ふつうに描くと見出しに本文と同じ id が付き、
        同じページに同じ id が2つ以上できます（コメントは右パネルと本文の下の
        両方に出るため、コメントどうしでもぶつかります）。id は目次と出典の
        飛び先で、コメントは飛び先にならないので付けません。
        代わりに書体だけ `.wiki-doc` を自分で当てます（注意書きのブロックは
        コメントでは描かれません — 短い指摘に色の付いた枠は要らない）。
      */}
      <div className="wiki-doc mt-1">
        <WikiMarkdown body={comment.body_md} nested />
      </div>

      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {children}
        {canRemove && (
          <button type="button" disabled={removing} onClick={onRemove} className={ACTION_BUTTON}>
            削除
          </button>
        )}
      </div>
    </div>
  );
}

export default function CommentThread({
  thread,
  currentUserId,
  canManage,
  actions,
}: CommentThreadProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const resolved = !!thread.resolved_at;

  return (
    <article
      className={cn(
        'rounded-card border p-2.5',
        resolved ? 'border-border-subtle bg-surface-subtle' : 'border-border bg-card',
      )}
    >
      <CommentBody
        comment={thread}
        currentUserId={currentUserId}
        canManage={canManage}
        onRemove={() => void actions.askRemove(thread)}
        removing={actions.removing}
      >
        <button
          type="button"
          onClick={() => setReplyOpen((v) => !v)}
          aria-expanded={replyOpen}
          className={ACTION_BUTTON}
        >
          返信
        </button>
        <button
          type="button"
          disabled={actions.resolving}
          onClick={() => actions.setResolved(thread.id, !resolved)}
          className={ACTION_BUTTON}
        >
          {resolved ? '解決を取り消す' : '解決にする'}
        </button>
      </CommentBody>

      {thread.replies.length > 0 && (
        <div className="mt-2 flex flex-col gap-2.5 border-l-2 border-border-subtle pl-2.5">
          {thread.replies.map((r) => (
            <CommentBody
              key={r.id}
              comment={r}
              currentUserId={currentUserId}
              canManage={canManage}
              onRemove={() => void actions.askRemove(r)}
              removing={actions.removing}
            />
          ))}
        </div>
      )}

      {replyOpen && (
        <div className="mt-2">
          <CommentComposer
            autoFocus
            rows={2}
            pending={actions.sending}
            placeholder="返信を書く"
            submitLabel="返信する"
            fieldLabel="返信"
            onCancel={() => setReplyOpen(false)}
            onSend={async (body) => {
              await actions.send(body, thread.id);
              setReplyOpen(false);
            }}
          />
        </div>
      )}
    </article>
  );
}
