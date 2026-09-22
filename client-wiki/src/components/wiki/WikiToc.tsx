/**
 * 目次（右パネルのタブ）
 *
 * **人が打たない。** 本文の見出し（`#` `##` `###`）から作る
 * （docs/design/v4/wiki.md §4-2）。見出しの id は `WikiMarkdown` が
 * 同じ `extractHeadings` のリンク先を当てているので、押せば必ず飛べる。
 */
import { extractHeadings } from '@gmo-onair/shared/src/wiki/markdown';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { List } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function WikiToc({ body }: { body: string }) {
  const headings = extractHeadings(body);

  if (headings.length === 0) {
    return (
      <EmptyState
        icon={<List />}
        title="見出しがありません"
        description="本文に「#」で見出しを付けると、ここに目次が出ます。"
      />
    );
  }

  // 本文は中央の欄だけがスクロールする（画面ごと動かない）ので、素の `#リンク` では
  // なく `scrollIntoView` で送る。`#` を押したときの URL の書き換えも起きない
  const go = (slug: string) => {
    document.getElementById(slug)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div>
      <div className="flex flex-col gap-0.5">
        {headings.map((h) => (
          <button
            key={h.slug}
            type="button"
            onClick={() => go(h.slug)}
            className={cn(
              'flex min-h-tap items-center rounded-control px-2 text-left hover:bg-muted lg:min-h-0 lg:h-8',
              h.level === 1 && 'text-list text-foreground',
              h.level === 2 && 'text-list text-secondary-foreground',
              h.level === 3 && 'pl-5 text-sub text-muted-foreground',
            )}
          >
            <span className="truncate">{h.text}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-sub-sm text-muted-foreground">
        目次は本文の見出しから自動で作ります。
      </p>
    </div>
  );
}
