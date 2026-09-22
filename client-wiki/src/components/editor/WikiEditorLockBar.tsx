/**
 * 編集ロックの案内（設計 §6-③）
 *
 * 2つの場面だけ出します:
 *  1. **他の人が持っている** … 本文は読むだけ。「編集を代わってほしい」と申し出られる
 *     （manager はその場で引き継げる）
 *  2. **自分が持っていて、誰かが申し出ている** … 終えれば相手に渡る
 *
 * どちらでもないときは何も出しません（いつも出ていると読み飛ばされます）。
 */
import { Hand, Lock } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiPageLock } from '@/hooks/useWikiPageLock';

interface Props {
  lock: WikiPageLock;
  canManage: boolean;
  /** 編集を終えてページに戻る（戻ると同時にロックを放す） */
  onLeave: () => void;
}

export default function WikiEditorLockBar({ lock, canManage, onLeave }: Props) {
  if (lock.heldByName) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-warning-border bg-warning-surface px-3 py-2 lg:px-6">
        <Lock className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span className="min-w-0 flex-1 text-sub text-foreground">
          <strong className="font-bold">{lock.heldByName} さんが編集中です。</strong>
          いまは読むだけになっています。
        </span>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={lock.requestHandoff}
          disabled={lock.requesting || lock.handoffRequested}
        >
          <Hand className="mr-1.5 h-4 w-4" aria-hidden />
          {lock.handoffRequested ? '申し出ました' : '編集を代わってほしい'}
        </Button>
        {canManage && (
          <Button variant="secondary" size="sm" type="button" onClick={lock.takeover} disabled={lock.takingOver}>
            編集を引き継ぐ
          </Button>
        )}
      </div>
    );
  }

  if (lock.requestedByName) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-info-border bg-info-surface px-3 py-2 lg:px-6">
        <Hand className="h-4 w-4 shrink-0 text-info" aria-hidden />
        <span className="min-w-0 flex-1 text-sub text-foreground">
          <strong className="font-bold">{lock.requestedByName} さん</strong>が編集を代わってほしいと言っています。
        </span>
        <Button variant="outline" size="sm" type="button" onClick={onLeave}>
          編集を終えて渡す
        </Button>
      </div>
    );
  }

  return null;
}
