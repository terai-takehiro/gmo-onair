/**
 * 回答の下に並ぶ出典（docs/design/v4/wiki.md §6-⑤・モック `Ask.dc.html`）
 *
 * ⚠️ **出典は「押せる引用」です。** 押すとそのページの見出しへ移り、
 * **`via='answer'` で閲覧を記録します**（§7-3 条件3 の代理指標＝
 * 「出典が開かれた率」。記録しないと、回答が役に立ったかを本人の申告だけで
 * 測ることになります）。
 *
 * ⚠️ 引用は**材料の写し**で、要約ではありません（§7-1 ②）。文を縮めたり
 * 言い換えたりしないこと — 縮めた瞬間に「Wiki にそう書いてある」が嘘になります。
 * 本文に見つからなかった引用（`quote_verified === false`）は、その旨を添えて出します。
 */
import { Link } from 'react-router-dom';
import { headingSlug } from '@gmo-onair/shared/src/wiki/markdown';
import { recordAnswerView, type AskCitation } from '@/components/search/askApi';

export interface AskCitationListProps {
  citations: AskCitation[];
  /** どの回答から開いたか（`ai_outputs.id`）。閲覧の記録に添える */
  answerOutputId: string | null;
}

export default function AskCitationList({ citations, answerOutputId }: AskCitationListProps) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      <p className="mb-1.5 text-th text-muted-foreground">出典（押すとそのページへ移ります）</p>
      <div className="flex flex-col gap-1.5">
        {citations.map((c, i) => {
          const slug = c.heading ? headingSlug(c.heading) : '';
          return (
            <Link
              key={`${c.page_id}-${i}`}
              to={slug ? `/p/${c.page_id}#${slug}` : `/p/${c.page_id}`}
              onClick={() => recordAnswerView(c.page_id, answerOutputId)}
              className="flex min-h-tap flex-col justify-center gap-0.5 rounded-control border border-border bg-surface-subtle px-2.5 py-1.5 no-underline hover:border-primary-border-strong lg:min-h-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-badge-xs bg-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sub text-foreground">
                  {c.title || 'ページ'}
                  {c.heading ? ` ＞ ${c.heading}` : ''}
                </span>
              </span>
              <span className="min-w-0 truncate pl-3.5 text-sub-sm text-secondary-foreground">
                「{c.quote}」
                {!c.quote_verified && '（本文と文字が一致しませんでした）'}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
