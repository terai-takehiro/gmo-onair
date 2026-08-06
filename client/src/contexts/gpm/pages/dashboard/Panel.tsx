/**
 * ダッシュボードの1枚のカード（① GPM）
 *
 * 案件管理のダッシュボードにも同じ形の部品（`salesDashboard/Panel.tsx`）が
 * ありますが、あちらは**その画面だけの部品**と明記されています。
 * 領域をまたぐ部品は `contexts/shared/components/` に置く決まりで、
 * そこへ出すのは案件管理側も一緒に動かす作業になるため、この版では
 * プロジェクト管理の中に同じ形で置いています。
 * （2つ目ができたので、次に3つ目が要るときに `contexts/shared` へ出します）
 *
 * `tone="alert"` は「止まっているもの」用。**赤い枠は1枚だけ**にします —
 * 2枚以上あると目が拾わなくなります。
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@gmo-onair/shared/src/client/utils';

export function Panel({
  title, note, icon, to, toLabel, tone = 'default', children,
}: {
  title: string;
  /** 見出しの右に小さく出す1行。**この枚が何を並べているか**を書く */
  note?: string;
  icon?: ReactNode;
  to?: string;
  toLabel?: string;
  tone?: 'default' | 'alert';
  children: ReactNode;
}) {
  const alert = tone === 'alert';
  return (
    <section
      className={cn(
        'rounded-card flex h-full flex-col border bg-card p-4 lg:px-5',
        alert ? 'border-destructive-border' : 'border-border',
      )}
    >
      <div className="mb-3 flex shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className={cn('text-cardtitle flex items-center gap-2', alert && 'text-destructive')}>
          {icon}
          {title}
        </h2>
        {note && <p className="text-note text-muted-foreground">{note}</p>}
        <div className="flex-1" />
        {to && (
          <Link
            to={to}
            className="text-sub min-h-tap flex items-center font-bold text-primary hover:underline lg:min-h-0"
          >
            {toLabel ?? '見る'} →
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}
