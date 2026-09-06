/**
 * ⑤ 入ってきた情報 — 行き先の表示と、AI が読み取った中身
 *
 * 一覧のファイルから出してあるのは大きさの都合だけで、どちらもこの画面専用です。
 */
import { Sparkles, ExternalLink, FileText, ListChecks, FolderPlus, Clock } from 'lucide-react';
import { RichContent } from '@gmo-onair/shared/src/client-v4/richContent';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { formatDateJa, type MiscInquiry } from '@/lib/types';
import { STATE_TONE } from './state';

/**
 * 行き先が決まっているものは、**何になったか**を出す。
 *
 * 「タスク」とだけ出しても、どのタスクなのか・まだ残っているのかが分かりません。
 * タスクが消されていた場合もそう書きます（黙って何も出さないと、
 * 誰かが拾ったつもりのまま消えます）。
 */
export function Destination({ q }: { q: MiscInquiry }) {
  if (q.state === 'ticket') {
    return (
      <p className={cn('rounded-note text-note mt-1 flex items-start gap-1.5 px-2 py-1', STATE_TONE.ticket)}>
        <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {q.task_title ? (
          <span className="min-w-0">
            <a href="/sales/tasks/list" className="font-bold underline">{q.task_title}</a>
            {q.task_done && '（対応済）'}
            {!q.task_done && q.task_due_at && (
              <span className="ml-1 inline-flex items-center gap-0.5">
                <Clock className="h-3 w-3" aria-hidden="true" />
                期限 {formatDateJa(q.task_due_at)}
              </span>
            )}
          </span>
        ) : (
          <span>タスクにしましたが、<strong className="font-bold">そのタスクは消されています</strong>。必要なら未仕分けに戻して作り直してください。</span>
        )}
      </p>
    );
  }
  if (q.state === 'project') {
    return (
      <p className={cn('rounded-note text-note mt-1 flex items-start gap-1.5 px-2 py-1', STATE_TONE.project)}>
        <FolderPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {q.project_id ? (
          <a href={`/sales/projects/${q.project_id}`} className="font-bold underline">{q.project_name}</a>
        ) : (
          <span>案件にしましたが、<strong className="font-bold">その案件は消されています</strong>。</span>
        )}
      </p>
    );
  }
  return null;
}

/** AI が読み取った中身とメール原文。**開いたときだけ**出す（行の高さをそろえるため） */
export function InquiryBody({ q, open, onToggle }: { q: MiscInquiry; open: boolean; onToggle: () => void }) {
  const hasRich = !!q.details && q.details.length > 0;
  const hasText = !!q.notes;
  const hasBody = !!q.body_text;
  if (!hasRich && !hasText && !hasBody && !q.url) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-note min-h-tap inline-flex items-center gap-1 text-primary lg:min-h-[32px]"
      >
        {open ? '詳細を閉じる' : '詳細を表示'}
        {hasRich && <Sparkles className="h-3 w-3 text-ai" aria-label="AI作成" />}
      </button>

      {open && (
        <div className="rounded-control-lg mt-1.5 flex flex-col gap-3 border border-border bg-card p-3">
          <RichContent blocks={q.details} fallback={q.notes} />

          {q.url && (
            <a
              href={q.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sub inline-flex items-center gap-1 text-primary underline"
            >
              参考リンク<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}

          {hasBody && (
            <details>
              <summary className="text-note min-h-tap flex cursor-pointer items-center gap-1 text-muted-foreground lg:min-h-[32px]">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                原文を見る
              </summary>
              {/* **原文は要約と別に持っている。** AI がどこを読み違えたかを
                  その場で確かめられるようにするため（切り詰めていない） */}
              <pre className="text-note rounded-note mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap break-words bg-muted p-2 text-secondary-foreground">
                {q.body_text}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
