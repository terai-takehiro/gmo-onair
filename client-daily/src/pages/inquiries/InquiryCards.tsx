/**
 * ⑤ 入ってきた情報 — スマホのカード（247 で PC 専用をやめたときに足した）
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の行は 重要度(72px) ／ 内容・出どころ（伸びる）／ 受信(96px) ／
 * 次にやること(160px) の4列です。スマホでこれを折り返すと、
 * **ボタンが4つ縦に積まれた下に本文がぶら下がる**形になり、
 * 何の話なのかを読む前に「タスクにする」を押すことになります。
 *
 * 外で開くときに要るのは**「何の話か」と「今どこにいるか」**なので、
 * 2行のカードに組み直します（`client/src/contexts/gpm/pages/taskList/TaskCards.tsx`
 * と同じ作り）:
 *
 *   1行目  重要度 ＋ 要約（AI の印つき）
 *   2行目  出どころ ・ 送信者 ・ 受信日
 *   その下  行き先（あとで見るなら見直す日）／ タグ ／ 中身を読む ／ 次にやること
 *
 * ── 色と文字の判定は書き写さない ────────────────────────────
 *
 * 見直す日の言い方は `shared/src/utils/inboxDesk.ts` の `stockReviewNote()`。
 * ここで書き直すと、PC とスマホで違う日に赤くなります。
 */
import { Sparkles, Pencil, Trash2, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { stockReviewNote } from '@gmo-onair/shared/src/utils/inboxDesk';
import { Button } from '@/components/ui/button';
import {
  IMPORTANCE_LABELS, INQUIRY_SOURCE_LABELS, formatDateJa, type MiscInquiry, type Importance,
} from '@/lib/types';
import { Destination, InquiryBody } from './InquiryBody';
import { actionsFor, ACTION_LABEL, type InquiryAction } from './state';

/** 重要度の色。**PC の行と同じ表**（画面ごとに変えない） */
const IMP_TONE: Record<Importance, string> = {
  high: 'border-transparent bg-destructive-surface text-destructive',
  medium: 'border-transparent bg-warning-surface text-warning',
  low: 'border-transparent bg-muted text-muted-foreground',
};

/** 見直す日の色。**色だけに頼らない**（文字にも「◯日過ぎています」と出る） */
const REVIEW_TONE = {
  due: 'bg-warning-surface text-warning',
  soon: 'bg-primary-surface text-primary',
  later: 'bg-muted text-muted-foreground',
  undecided: 'bg-warning-surface text-warning',
} as const;

export function InquiryCards({
  rows, today, canEdit, pending, openedId, onToggleOpen, onPickTag, onAction, onEdit, onDelete,
}: {
  rows: MiscInquiry[];
  /** `YYYY-MM-DD`。**呼ぶ側から渡す**（部品の中で時計を読まない） */
  today: string;
  canEdit: boolean;
  pending: boolean;
  openedId: string | null;
  onToggleOpen: (id: string) => void;
  onPickTag: (tag: string) => void;
  onAction: (q: MiscInquiry, a: InquiryAction) => void;
  onEdit: (q: MiscInquiry) => void;
  onDelete: (q: MiscInquiry) => void;
}) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {rows.map((q) => {
        const review = q.state === 'stock' ? stockReviewNote(q.stock_review_on, today) : null;
        return (
          <li
            key={q.id}
            className={cn(
              'rounded-card flex flex-col gap-1.5 border border-border bg-card p-3.5',
              q.state === 'dropped' && 'opacity-70',
            )}
          >
            <span className="flex items-start gap-2">
              <span className={cn('rounded-badge text-badge shrink-0 px-1.5 py-0.5', IMP_TONE[q.importance])}>
                {IMPORTANCE_LABELS[q.importance]}
              </span>
              <span className="text-list min-w-0 flex-1 [overflow-wrap:anywhere]">
                {q.is_ai && (
                  <Sparkles className="mr-1 inline h-3.5 w-3.5 text-ai" aria-label="AI が取り込みました" />
                )}
                {q.summary}
              </span>
            </span>

            <span className="text-sub-sm block text-muted-foreground [overflow-wrap:anywhere]">
              {[
                INQUIRY_SOURCE_LABELS[q.source] ?? q.source,
                q.sender,
                q.received_at ? formatDateJa(q.received_at) : null,
              ].filter(Boolean).join(' ・ ')}
            </span>

            {review && (
              <span className={cn('rounded-note text-note inline-flex items-center gap-1 self-start px-2 py-1', REVIEW_TONE[review.tone])}>
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {review.text}
              </span>
            )}

            {q.action_needed && q.state === 'unsorted' && (
              <span className="text-note flex items-start gap-1 text-info">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {q.action_needed}
              </span>
            )}

            {q.tags.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {q.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPickTag(t)}
                    // 見た目は 20px の札のまま、**当たり判定だけ 44px**（PC の行と同じ考え方）
                    className="v4-tap rounded-note text-badge border border-border bg-surface-subtle px-1.5 py-0.5 text-secondary-foreground"
                  >
                    {t}
                  </button>
                ))}
              </span>
            )}

            <Destination q={q} />
            <InquiryBody q={q} open={openedId === q.id} onToggle={() => onToggleOpen(q.id)} />

            {canEdit && (
              <span className="mt-0.5 flex flex-col gap-1.5 border-t border-border-faint pt-2">
                {actionsFor(q.state).map((a) => (
                  <Button
                    key={a}
                    variant={a === 'ticket' ? 'default' : 'outline'}
                    className="w-full justify-center"
                    disabled={pending}
                    onClick={() => onAction(q, a)}
                  >
                    {ACTION_LABEL[a]}
                  </Button>
                ))}
                <span className="flex gap-1.5">
                  <Button variant="ghost" className="flex-1" onClick={() => onEdit(q)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />編集
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={() => onDelete(q)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" aria-hidden="true" />削除
                  </Button>
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
