/**
 * 会話の1件（質問／回答）— docs/design/v4/wiki.md §6-⑤・モック `Ask.dc.html`
 *
 * ⚠️ **回答は Markdown を描くだけ。HTML は描きません**（`WikiMarkdown` は
 * `rehype-raw` を入れていない・§7-5「AI に HTML を書かせない」）。人が書いた本文と
 * 同じところを通します。
 *
 * ⚠️ **出典が無い回答は「書かれていません」です**（§10 の判断8）。サーバーが
 * そう落として返すので、画面は**それが分かる見た目**にし、足りないページに
 * 登録されたことと「ページを作成」への導線を添えます（§7-2）。
 * ここで AI の文を言い換えたり、無い出典を補ったりしないこと。
 */
import { BookPlus, FilePlus2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import AskCitationList from '@/components/ask/AskCitationList';
import AskFeedbackRow from '@/components/ask/AskFeedbackRow';
import type { AskMessage as AskMessageRow } from '@/components/search/askApi';

export interface AskMessageProps {
  message: AskMessageRow;
  /** その回で AI が読んだページの数。分からない回（開き直した会話）は null */
  readCount: number | null;
  /** ページを作れる人か（§8 の editor）。作れない人には入口を出さない */
  canEdit: boolean;
  onCreatePage: (message: AskMessageRow) => void;
  onFeedbackSaved: (message: AskMessageRow) => void;
}

export default function AskMessage({
  message,
  readCount,
  canEdit,
  onCreatePage,
  onFeedbackSaved,
}: AskMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[min(560px,92%)] whitespace-pre-wrap break-words rounded-card border border-primary-border bg-primary-surface-weak px-3.5 py-2.5 text-list leading-relaxed text-foreground">
          {message.content_md}
        </p>
      </div>
    );
  }

  const noAnswer = message.confidence === 'none';

  return (
    <div className="flex gap-2.5">
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-ai"
        aria-hidden
      >
        <Sparkles className="h-4 w-4 text-ai-foreground" />
      </span>

      <div className="min-w-0 flex-1">
        <div
          className={
            noAnswer
              ? 'break-words rounded-card border border-warning-border bg-warning-surface px-3.5 py-3'
              : 'break-words rounded-card border border-border bg-card px-3.5 py-3'
          }
        >
          <WikiMarkdown body={message.content_md} />

          <AskCitationList
            citations={message.citations}
            answerOutputId={message.ai_output_id}
          />

          {/* 出典が出せなかった回。**登録されたことを画面でも言う**（§7-2） */}
          {noAnswer && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-note border border-warning-border bg-card px-3 py-2">
              <BookPlus className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span className="text-sub text-foreground">足りないページに登録しました</span>
              <span className="min-w-0 flex-1 text-sub-sm text-secondary-foreground">
                同じ質問は回数を数え、月1回の見直しでスペースの担当に届きます
              </span>
              {canEdit && (
                <Button type="button" size="sm" onClick={() => onCreatePage(message)}>
                  <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden />
                  ページを作成
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sub-sm text-muted-foreground">
            {readCount === null ? '' : `読んだ ${readCount} ページ ・ `}
            出典 {message.citations.length}
          </span>
          {message.spawned_page_id ? (
            <Link to={`/p/${message.spawned_page_id}`} className="text-sub-sm text-primary">
              この回答からページを作成しました
            </Link>
          ) : (
            canEdit && !noAnswer && (
              <button
                type="button"
                onClick={() => onCreatePage(message)}
                className="flex min-h-tap items-center rounded-control border border-border bg-card px-2.5 text-sub text-secondary-foreground hover:border-primary-border-strong lg:min-h-0 lg:h-8"
              >
                ページを作成
              </button>
            )
          )}
        </div>

        <AskFeedbackRow message={message} onSaved={onFeedbackSaved} />
      </div>
    </div>
  );
}
