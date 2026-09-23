/**
 * 回答の下の3値の評価と、任意の一言（docs/design/v4/wiki.md §6-⑤・§7-3 の条件2）
 *
 * ── なぜ3値なのか ──────────────────────────────────────────
 *
 * 対話は「直される」ものではないので、人の修正差分（条件2）が取れません。
 * 代わりに **役に立った／言い直して／的外れ** の3つで受け、サーバーが
 * `ai_corrections` にも1行積んで無修正採用率に効かせます。
 * ここが空のままだと、AI が良くなったのか聞かれなくなっただけなのかが
 * 後から分けられません。
 *
 * ⚠️ **押した値は消せません**（サーバーに「評価なし」へ戻す道がない）。
 * 押し間違えたときは別の値を押し直してください — 最後の1つだけが残ります。
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { WikiAiFeedback } from '@gmo-onair/shared/src/wiki/types';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import BufferedInput from '@/components/editor/BufferedInput';
import { postAskFeedback, type AskMessage } from '@/components/search/askApi';
import { cn } from '@/lib/utils';

export interface AskFeedbackRowProps {
  message: AskMessage;
  /** 記録できたら、画面が持っている会話にも書き戻す */
  onSaved: (message: AskMessage) => void;
}

/** 3つの選択肢。色は共通トークンの状態色（`success` / `warning` / `destructive`） */
const CHOICES: Array<{ value: WikiAiFeedback; label: string; on: string }> = [
  { value: 'good', label: '役に立った', on: 'border-success-border bg-success-surface text-success' },
  { value: 'rephrase', label: '言い直して', on: 'border-warning-border bg-warning-surface text-warning' },
  { value: 'reject', label: '的外れ', on: 'border-destructive-border bg-destructive-surface text-destructive' },
];

export default function AskFeedbackRow({ message, onSaved }: AskFeedbackRowProps) {
  const [note, setNote] = useState(message.feedback_note ?? '');
  const [noteOpen, setNoteOpen] = useState(false);

  const save = useMutation({
    meta: { action: '評価の記録' },
    mutationFn: (v: { feedback: WikiAiFeedback; note?: string }) =>
      postAskFeedback(message.id, v.feedback, v.note),
    onSuccess: (saved) => onSaved(saved),
  });

  const pick = (value: WikiAiFeedback) => {
    setNoteOpen(true);
    if (message.feedback === value && !note.trim()) return;
    save.mutate({ feedback: value, note: note.trim() || undefined });
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={message.feedback === c.value}
            disabled={save.isPending}
            onClick={() => pick(c.value)}
            className={cn(
              'flex min-h-tap items-center rounded-control border px-2.5 text-sub lg:min-h-0 lg:h-8',
              message.feedback === c.value
                ? c.on
                : 'border-border bg-card text-secondary-foreground hover:border-primary-border-strong',
            )}
          >
            {c.label}
          </button>
        ))}
        {message.feedback && (
          <span className="text-sub-sm text-muted-foreground">
            {save.isPending ? '記録中…' : '評価を記録しました。次の回答に生かします'}
          </span>
        )}
      </div>

      {/* 一言は任意。押した値だけでも条件2 は足りるので、開くまで欄を出さない */}
      {noteOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          <BufferedInput
            value={note}
            onCommit={setNote}
            placeholder="よければ一言（どこが違ったか・何が知りたかったか）"
            aria-label="評価への一言（任意）"
            className="min-h-tap w-full max-w-[560px] rounded-control border border-border bg-card px-2.5 text-sub text-foreground placeholder:text-muted-foreground lg:h-9 lg:min-h-0"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={save.isPending || !message.feedback}
            onClick={() => message.feedback && save.mutate({ feedback: message.feedback, note })}
          >
            一言を添える
          </Button>
          {!message.feedback && (
            <span className="text-sub-sm text-muted-foreground">
              先に3つのどれかを押してください
            </span>
          )}
        </div>
      )}

      {message.feedback_note && !noteOpen && (
        <p className="text-sub-sm text-muted-foreground">一言: {message.feedback_note}</p>
      )}
    </div>
  );
}
