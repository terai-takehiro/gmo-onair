/**
 * ONAiR カード（docs/design/v4/wiki.md §4-3）
 *
 * 本文は **ただのリンク** `[名前](/sales/projects/:id)` のまま。カードにするのは
 * 画面の仕事で、`body_md` は書き換えない（約束1）。だから書き出した `.md` を
 * GitHub や VS Code で開いてもリンクとして読める。
 *
 * ⚠️ 段A では相手の状態（管理番号・ステージ・置き場）は出さない。
 *    相手を引く口がまだ無いので、リンクに書かれた名前と種類だけを出す。
 *    状態を足すのは段D 以降（そのとき `WikiOnairCardProps` に足す）。
 */
import { Briefcase, DoorOpen, FileText, Package, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { WikiOnairRef } from '@gmo-onair/shared/src/wiki/markdown';
import { cn } from '@/lib/utils';

const KIND: Record<WikiOnairRef['kind'], { label: string; icon: LucideIcon; tint: string; mark: string }> = {
  // 系列の色（`cat-*`）を使う。状態の色（success / warning）は
  // 「稼働中」「期限切れ」の意味を持つので、種類の色分けに流用しない
  project:   { label: '案件',     icon: Briefcase, tint: 'bg-cat-1/10', mark: 'text-cat-1' },
  equipment: { label: '機材',     icon: Package,   tint: 'bg-cat-3/10', mark: 'text-cat-3' },
  room:      { label: '部屋',     icon: DoorOpen,  tint: 'bg-cat-4/10', mark: 'text-cat-4' },
  page:      { label: 'Wiki ページ', icon: FileText, tint: 'bg-cat-7/10', mark: 'text-cat-7' },
};

export interface WikiOnairCardProps {
  refItem: WikiOnairRef;
  /** 本文に書かれていた URL。`page` 以外は別アプリなので素の遷移にする */
  href: string;
  className?: string;
}

export default function WikiOnairCard({ refItem, href, className }: WikiOnairCardProps) {
  const k = KIND[refItem.kind];
  const Icon = k.icon;
  const inner = (
    <>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-control-md', k.tint)}>
        <Icon className={cn('h-[17px] w-[17px]', k.mark)} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-list text-foreground">{refItem.label || href}</span>
        <span className="block truncate text-sub-sm text-muted-foreground">{k.label}</span>
      </span>
    </>
  );

  const box = cn(
    'my-3 flex max-w-[520px] items-center gap-3 rounded-note border border-border bg-surface-subtle px-3 py-2.5',
    'no-underline hover:border-primary-border-strong',
    className,
  );

  // Wiki のページだけは同じアプリの中なので `<Link>`（画面を作り直さない）。
  // 案件・機材・部屋は別アプリの URL なので素の `<a>` で丸ごと移る。
  if (refItem.kind === 'page') {
    return (
      <Link to={`/p/${refItem.id}`} className={box} data-ui="onair-card">
        {inner}
      </Link>
    );
  }
  return (
    <a href={href} className={box} data-ui="onair-card">
      {inner}
    </a>
  );
}
