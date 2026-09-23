/**
 * ページのコメント一覧（段F・docs/design/v4/wiki.md §6-②・§6-⑧）
 *
 * 右パネルの「コメント」タブと、**パネルを閉じているとき（既定）に本文の下へ
 * 続ける分**の両方で同じものを使います。鍵が同じなので取りに行くのは1回です。
 *
 * ── 決めたこと ──────────────────────────────────────────────
 *
 * 1. **入力欄は先頭に置く**。やり取りが伸びても、書くところを探して
 *    下まで運ばなくてよい（右パネルは幅 320px で縦に長くなりやすい）
 * 2. **解決済みは既定で隠す**。片づいたやり取りが並ぶと、いま読むべきものが
 *    埋もれる。隠した件数はボタンに出し、押せば戻る（黙って消さない）
 * 3. **読む人（reader）にも入力欄を出す**（§8）。「分からなければコメントで聞く」
 *    が現場の使い方なので、ここで editor を求めない
 */
import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { openThreadCount, useWikiComments } from '@/components/page/commentApi';
import CommentComposer from './CommentComposer';
import CommentThread from './CommentThread';
import { useCommentActions } from './useCommentActions';

export default function CommentPanel({ pageId }: { pageId: string }) {
  const { currentUser } = useAuth();
  const { canManage } = usePermissions();
  const [showResolved, setShowResolved] = useState(false);

  const commentsQ = useWikiComments(pageId);
  const actions = useCommentActions(pageId);

  const threads = commentsQ.data ?? [];
  const resolvedCount = threads.length - openThreadCount(threads);
  const shown = showResolved ? threads : threads.filter((t) => !t.resolved_at);

  return (
    <div className="flex flex-col gap-2.5">
      <CommentComposer pending={actions.sending} onSend={(body) => actions.send(body)} />

      {commentsQ.isError ? (
        <ErrorPanel
          title="コメントを読み込めませんでした"
          error={commentsQ.error}
          onRetry={() => void commentsQ.refetch()}
        />
      ) : commentsQ.isLoading ? (
        <Delayed>
          <SkeletonRows rows={3} rowHeight={64} />
        </Delayed>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="まだコメントがありません"
          description="このページで分からなかったこと・気づいたことを書くと、担当に伝わります。"
        />
      ) : (
        <>
          {shown.map((t) => (
            <CommentThread
              key={t.id}
              thread={t}
              currentUserId={currentUser?.id ?? null}
              canManage={canManage}
              actions={actions}
            />
          ))}

          {resolvedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              aria-pressed={showResolved}
              className="flex min-h-tap items-center justify-center rounded-control border border-border text-sub text-secondary-foreground hover:bg-muted lg:h-9 lg:min-h-0"
            >
              {showResolved ? '解決済みを隠す' : `解決済みも表示（${resolvedCount}件）`}
            </button>
          )}

          {shown.length === 0 && (
            <p className="text-sub text-muted-foreground">
              解決していないコメントはありません。
            </p>
          )}
        </>
      )}
    </div>
  );
}
