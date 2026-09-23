/**
 * お客様の詳細（顧客360）— 「やり取りの履歴」節 (v4)
 *
 * 枠だけ持つ。PC の行 (`TimelineRows`) とスマホのカード (`TimelineCards`) の
 * 出し分けは、案件詳細の `Fact`（`overviewParts.tsx`）と同じく**薄い親が渡す
 * `mobile` を見るだけ**にしてある — 画面の中で `useIsMobile()` を呼び直さない。
 */
import { History } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { TimelineRows } from './TimelineRows';
import { TimelineCards } from './TimelineCards';
import type { useNextActionActions } from '../activityLog/useNextActionActions';
import type { CustomerActivity } from './types';

export function TimelineSection({
  items, actions, mobile, onOpenProject,
}: {
  items: CustomerActivity[];
  /** 完了・延期の口。**未指定ならボタンを出さない**（`sales` の editor が無い人） */
  actions?: ReturnType<typeof useNextActionActions>;
  mobile: boolean;
  onOpenProject: (projectId: string) => void;
}) {
  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <History className="h-4 w-4 text-primary" aria-hidden="true" />
        やり取りの履歴
        {items.length > 0 && (
          <span className="text-note font-normal text-muted-foreground">直近 {items.length} 件</span>
        )}
      </h2>
      <div className="p-4">
        {items.length === 0 ? (
          <EmptyState
            title="やり取りの記録はまだありません"
            description="「やり取りを記録」から追加できます（メールは AI が自動で取り込みます）。"
          />
        ) : mobile ? (
          <TimelineCards items={items} actions={actions} onOpenProject={onOpenProject} />
        ) : (
          <TimelineRows items={items} actions={actions} onOpenProject={onOpenProject} />
        )}
      </div>
    </section>
  );
}
