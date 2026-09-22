/**
 * ホームの区画（カード）
 *
 * モック `Main.dc.html` の寸法に合わせた入れ物: 角丸はカードの役割名（14px）・
 * 見出しの高さ 46px・題は `text-cardtitle`・下に1本の罫。
 * `SectionCard`（共通）は角丸と題の大きさが v4 のモックと別なので、
 * ここでは使わずトークンだけで組む。
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export default function WikiSection({
  title,
  note,
  actions,
  footnote,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  /** 題の右に置く小さい説明 */
  note?: ReactNode;
  /** 題の行の右端 */
  actions?: ReactNode;
  /** 区画の下に置く一行の案内 */
  footnote?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('flex flex-col overflow-hidden rounded-card border border-border bg-card', className)}>
      <header className="flex h-[46px] shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="text-cardtitle truncate text-foreground">{title}</span>
        {note && <span className="hidden truncate text-sub-sm text-muted-foreground sm:block">{note}</span>}
        <span className="flex-1" />
        {actions}
      </header>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
      {footnote && (
        <p className="shrink-0 border-t border-border-faint px-4 py-3 text-sub-sm text-muted-foreground">
          {footnote}
        </p>
      )}
    </section>
  );
}
