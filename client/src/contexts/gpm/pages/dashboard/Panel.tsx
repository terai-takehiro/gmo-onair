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
 *
 * ── `h-full` は `lg:` 限定にする（実機で見つかった崩れ）───────────
 *
 * PC（`lg:grid-cols-3`）では「止まっている」「動いている」の2枚を
 * `lg:col-span-2` の1つの入れ物にまとめ、隣の「未確認事項」と高さを揃えるために
 * `h-full` を使っています。ところがスマホでは1列になり、この2枚は**同じ入れ物の
 * 中に縦に積まれた兄弟**になります。この入れ物（grid item）自体の高さは2枚の
 * 合計で決まりますが、**各 Panel の `h-full`（`height:100%`）は「決まったあとの
 * 入れ物の高さ」を基準に解決される**ため、中身が1行しかない枚まで
 * 「2枚合わせた高さ」に引き伸ばされます（実機で確認：中身が空の「止まっている
 * プロジェクト」が1200px超の空白カードになっていた）。
 * PC で高さを揃えたいのは「隣に並ぶとき」だけなので `lg:h-full` にする —
 * PC の見た目は変えずスマホだけ直る。
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
        'rounded-card flex flex-col border bg-card p-4 lg:h-full lg:px-5',
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
