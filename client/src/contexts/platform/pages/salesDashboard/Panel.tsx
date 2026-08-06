/**
 * ダッシュボードの1枚のカード (v4 ①)
 *
 * 見出し・補足・右端の「〜で見る →」を1か所にまとめています。
 * 4枚が同じ形になるので、**枠線の太さ・角丸・見出しの大きさが枚ごとにずれません**。
 *
 * **`dashboard/SectionCard` は使いません。** あちらは v4 より前の段
 * (`rounded-lg` = 8px・見出しの下に区切り線) で、まだ作り直していない画面が
 * 使っています。ここを変えるとそちらの見た目も動きます。
 *
 * `tone="alert"` は「止まっている案件」用。**枠を赤くするのはこの1枚だけ**で、
 * 赤が2枚以上あると目が拾わなくなります (モックも1枚だけ)。
 */
import * as React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@gmo-onair/shared/src/client/utils';

export interface PanelProps {
  title: string;
  /** 見出しの右に小さく出す1行。**この枚が何を並べているか**を書く */
  note?: string;
  icon?: React.ReactNode;
  /** 右端のリンク。行き先が無い枚は省く */
  to?: string;
  toLabel?: string;
  tone?: 'default' | 'alert';
  children: React.ReactNode;
}

export function Panel({ title, note, icon, to, toLabel, tone = 'default', children }: PanelProps) {
  const alert = tone === 'alert';
  return (
    <section
      className={cn(
        'rounded-card flex h-full flex-col border bg-card p-4 lg:px-5',
        alert ? 'border-destructive-border' : 'border-border'
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
          <Link to={to} className="text-sub min-h-tap flex items-center font-bold text-primary hover:underline lg:min-h-0">
            {toLabel ?? '見る'} →
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}
