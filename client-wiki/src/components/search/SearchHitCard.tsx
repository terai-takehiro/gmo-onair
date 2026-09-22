/**
 * 検索結果の1件（モック `Search.dc.html` の1枚）
 *
 * 出すものは設計 §6-④ の5つ: **タイトル・スペース・一致した見出し・抜粋・更新日**。
 * 抜粋と一致した見出しはサーバーが作って返します（`makeExcerpt` / `matchedHeading`）。
 * 画面がやるのは、当たった語を太くすることだけです。
 *
 * 一致した見出しが無いページもあります（本文だけに当たったとき）。そのときは
 * 行ごと出しません — 「見出し: —」と書くと、読み手はそこに意味を探します。
 */
import { Link } from 'react-router-dom';
import type { WikiSearchHit } from '@gmo-onair/shared/src/wiki/types';
import { updatedLabel } from '@/lib/wikiFormat';
import HighlightedText from './HighlightedText';

export default function SearchHitCard({ hit, terms }: { hit: WikiSearchHit; terms: string[] }) {
  return (
    <Link
      to={`/p/${hit.id}`}
      className="block rounded-card border border-border bg-card px-4 py-3 no-underline transition-colors hover:border-primary-border-strong"
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-badge-xs"
          style={{ background: hit.space_color ?? 'rgb(var(--border))' }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sub-sm text-secondary-foreground">
          {hit.path || hit.space_name}
        </span>
        <span className="shrink-0 text-note text-muted-foreground">
          {updatedLabel(hit.updated_at)}
          {hit.owner_name ? ` ・ ${hit.owner_name}` : ''}
        </span>
      </div>

      <p className="mt-1 text-cardtitle text-foreground">
        <HighlightedText text={hit.title} terms={terms} />
      </p>

      {hit.heading && (
        <p className="mt-1.5 flex items-center gap-1.5">
          <span className="shrink-0 rounded-badge bg-secondary px-1.5 py-0.5 text-badge text-secondary-foreground">
            見出し
          </span>
          <span className="min-w-0 truncate text-sub text-secondary-foreground">
            <HighlightedText text={hit.heading} terms={terms} />
          </span>
        </p>
      )}

      {hit.excerpt && (
        <p className="mt-1.5 text-sub leading-relaxed text-secondary-foreground">
          <HighlightedText text={hit.excerpt} terms={terms} />
        </p>
      )}
    </Link>
  );
}
