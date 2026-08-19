/**
 * 営業レビューの1枚のカード (v4)
 *
 * `platform/pages/salesDashboard/Panel.tsx` と同じ形。**cross-context import はしない**
 * （案件管理の中でも `platform` と `sales` は別の置き場所で、共通化するなら
 * `shared/` に上げるべきものを片方から借りると依存の向きが崩れる）。
 * 必要な分だけ (title・children) に絞って複製してある。
 */
import * as React from 'react';
import { cn } from '@gmo-onair/shared/src/client/utils';

export function Panel({
  title, note, className, children,
}: { title: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-card flex h-full flex-col border border-border bg-card p-4 lg:px-5', className)}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="text-cardtitle">{title}</h2>
        {note && <p className="text-note text-muted-foreground">{note}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}
