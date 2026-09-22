/**
 * 最近見たもの（ホーム・検索の打つ前）
 *
 * **その端末で開いたページだけ**です。サーバーには残しません（開くたびに1行
 * 足すことになり、ページを開く速さに効くうえ、「見た」は業務の記録ではないので
 * 消えても困りません）。**別の端末では出ない**ことは画面にそう書きます —
 * 書かないと「スマホで見たページが PC に出ない＝壊れている」と読まれます。
 *
 * 0件のときは**何も出しません**。開くたびに場所だけ取る空の区画が出ると、
 * 下の一覧の位置がずれます（ホームの要見直しの案内と同じ扱い）。
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { readWikiRecent, removeWikiRecent, type WikiRecentItem } from './wikiRecent';

export default function WikiRecentPages({ title = '最近見たもの' }: { title?: string }) {
  const { currentUser } = useAuth();
  const uid = currentUser?.id ?? '';
  // 一度だけ読み、以後は手元の state を直す（消したあとに読み直さない）
  const [items, setItems] = useState<WikiRecentItem[]>([]);
  useEffect(() => setItems(readWikiRecent(uid)), [uid]);

  if (items.length === 0) return null;

  const drop = (id: string) => {
    removeWikiRecent(id, uid);
    setItems((cur) => cur.filter((v) => v.id !== id));
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-cardtitle text-foreground">{title}</h2>
        <span className="text-sub-sm text-muted-foreground">この端末で開いたページ。別の端末では出ません</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-1">
            <Link
              to={`/p/${r.id}`}
              className="min-h-tap flex min-w-0 flex-1 items-center gap-2.5 rounded-control-lg border border-border bg-card px-3 no-underline transition-colors hover:border-primary-border-strong lg:min-h-0 lg:h-10"
            >
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-list text-foreground">{r.title}</span>
              <span className="shrink-0 truncate text-note text-muted-foreground">{r.spaceName}</span>
              <span
                className="h-2 w-2 shrink-0 rounded-badge-xs"
                style={{ background: r.spaceColor ?? 'rgb(var(--border))' }}
                aria-hidden
              />
            </Link>
            <button
              type="button"
              onClick={() => drop(r.id)}
              aria-label={`${r.title} を最近見たものから削除`}
              className="min-h-tap flex w-10 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-secondary lg:h-10 lg:min-h-0"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
