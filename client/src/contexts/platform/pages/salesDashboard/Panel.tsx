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
  /**
   * リンクを**見出しの右ではなく枚の下端**に置く（モックの「期限が過ぎたやること」）。
   *
   * 右の狭い列（1fr）に入る枚では、見出し＋補足＋リンクが1行に収まらず
   * **リンクだけが2行目に折り返して**見出しの下にぶら下がります。
   * 下端に横いっぱいの区切り線を引いて中央に置けば、幅に関係なく1行で収まり、
   * 「ここから先は全部見る」という意味も読み取れます。
   */
  linkAt?: 'header' | 'foot';
  tone?: 'default' | 'alert';
  children: React.ReactNode;
}

export function Panel({
  title,
  note,
  icon,
  to,
  toLabel,
  linkAt = 'header',
  tone = 'default',
  children,
}: PanelProps) {
  const alert = tone === 'alert';
  const link = to && (
    <Link to={to} className="text-sub min-h-tap flex items-center font-bold text-primary hover:underline lg:min-h-0">
      {toLabel ?? '見る'} →
    </Link>
  );
  return (
    <section
      className={cn(
        // **`overflow-hidden` が要る。** alert 帯は角丸の外まで四角く伸びるので、
        // 切らないと角の丸みからはみ出た四角い隅が見える
        'rounded-card flex h-full flex-col overflow-hidden border bg-card p-4 lg:px-5',
        alert ? 'border-destructive-border' : 'border-border'
      )}
    >
      <div
        className={cn(
          'mb-3 -mx-4 -mt-4 flex shrink-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 py-3 lg:-mx-5 lg:px-5',
          // **「止まっている案件」だけの帯**（モックの実測: 背景 `destructive-surface` +
          // 下の罫線 `destructive-border`）。枠の赤だけだと目に入りにくい
          alert && 'border-b border-destructive-border bg-destructive-surface'
        )}
      >
        <h2 className={cn('text-cardtitle flex items-center gap-2', alert && 'text-destructive')}>
          {icon}
          {title}
        </h2>
        {note && <p className="text-note text-muted-foreground">{note}</p>}
        <div className="flex-1" />
        {linkAt === 'header' && link}
      </div>
      <div className="flex-1">{children}</div>
      {/* 下端のリンクは**枚の幅いっぱいに区切って中央**（モック）。
          `p-4 lg:px-5` の内側なので、負の余白で左右と下の余白を打ち消す */}
      {linkAt === 'foot' && link && (
        <div className="-mx-4 -mb-4 mt-3 flex shrink-0 justify-center border-t border-border pt-2 lg:-mx-5">
          {link}
        </div>
      )}
    </section>
  );
}
