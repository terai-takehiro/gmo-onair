/**
 * ⑤ 入ってきた情報 — PC の行（247 で一覧ファイルから出した）
 *
 * ── 出したのは大きさの都合だけ ──────────────────────────────
 *
 * `InquiriesPage.tsx` が 400 行の上限を超えたので、**PC の行**と
 * **スマホのカード**（`InquiryCards.tsx`）を並べて置きました。
 * 中身はどちらもこの画面専用です。
 *
 * ⚠️ **props はカードと揃えてあります。** 写しを作ると、
 * 片方だけボタンが増えて PC とスマホで違うことができるようになります。
 */
import {
  Sparkles, Pencil, Trash2, AlertTriangle, Clock, Mail, MessageSquare, Phone, Users,
  ListChecks, FolderPlus, CalendarPlus, Archive, CalendarClock, CircleSlash, RotateCcw,
} from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { stockReviewNote } from '@gmo-onair/shared/src/utils/inboxDesk';
import { Button } from '@/components/ui/button';
import {
  IMPORTANCE_LABELS, INQUIRY_SOURCE_LABELS, formatDateJa,
  type MiscInquiry, type Importance,
} from '@/lib/types';
import { Destination, InquiryBody } from './InquiryBody';
import { actionsFor, primaryActionFor, ACTION_LABEL, type InquiryAction } from './state';

/** 重要度の色。**カードと同じ表**（画面ごとに変えない） */
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

const SRC_ICON = { mail: Mail, slack: MessageSquare, phone: Phone, talk: Users, manual: Pencil };

/** 次にできることのアイコン。**スマホのカードは文字だけ**（幅が足りない） */
const ACTION_ICON: Record<InquiryAction, typeof ListChecks> = {
  ticket: ListChecks, toProject: FolderPlus, book: CalendarPlus, stock: Archive, restock: CalendarClock,
  drop: CircleSlash, unsort: RotateCcw,
};

export function InquiryRows({
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
  <div className="flex flex-col">
    <RowHeader className="hidden sm:flex">
      <RowSlot w={72}>重要度</RowSlot>
      <RowMain>内容 ／ 受付経路</RowMain>
      <RowSlot w={96}>受信</RowSlot>
      <RowSlot w={160}>{canEdit ? '次のアクション' : ''}</RowSlot>
    </RowHeader>

    {rows.map((q) => {
      const SrcIcon = SRC_ICON[q.source as keyof typeof SRC_ICON] ?? Pencil;
      const review = q.state === 'stock' ? stockReviewNote(q.stock_review_on, today) : null;
      return (
        <Row key={q.id} align="start" className={q.state === 'dropped' ? 'opacity-70' : undefined}>
          <RowSlot w={72}>
            <TableBadge label={IMPORTANCE_LABELS[q.importance]} w={null} className={`w-full ${IMP_TONE[q.importance]}`} />
          </RowSlot>

          <RowMain>
            <RowTitle>
              {q.is_ai && (
                <Sparkles className="mr-1 inline h-3.5 w-3.5 text-ai" aria-label="AI作成" />
              )}
              {q.summary}
            </RowTitle>
            <RowSub>
              <SrcIcon className="mr-1 inline h-3 w-3" aria-hidden="true" />
              {[
                INQUIRY_SOURCE_LABELS[q.source] ?? q.source,
                q.sender,
                q.subject ? `件名: ${q.subject}` : null,
              ].filter(Boolean).join(' ・ ')}
            </RowSub>

            {/* **「あとで見る」には見直す日が出る**（247）。無いと「捨てた」と見分けが付かない */}
            {review && (
              <span className={cn('rounded-note text-note mt-1 inline-flex items-center gap-1 px-2 py-1', REVIEW_TONE[review.tone])}>
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {review.text}
              </span>
            )}

            {q.tags.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {q.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPickTag(t)}
                    className={cn(
                      'rounded-note text-badge border px-1.5 py-0.5',
                      // **`予定候補` だけ目立たせる。** 日程が明確でカレンダー登録の
                      // 候補と読めるものを、他のタグに埋もれさせない（decision-table.md）
                      t === '予定候補'
                        ? 'border-primary-border bg-primary-surface text-primary'
                        : 'border-border bg-surface-subtle text-secondary-foreground',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </span>
            )}

            {q.action_needed && q.state === 'unsorted' && (
              <p className="text-note mt-1 flex items-start gap-1 text-info">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {q.action_needed}
              </p>
            )}

            <Destination q={q} />
            <InquiryBody q={q} open={openedId === q.id} onToggle={() => onToggleOpen(q.id)} />
          </RowMain>

          <RowSlot w={96} hideOnMobile>
            <span className="font-number text-sub-sm text-secondary-foreground">
              {q.received_at ? formatDateJa(q.received_at) : '—'}
            </span>
          </RowSlot>

          <RowSlot w={160}>
            {canEdit && (
              <span className="flex w-full flex-col gap-1">
                {actionsFor(q.state).map((a) => {
                  const Icon = ACTION_ICON[a];
                  return (
                    <Button
                      key={a}
                      variant={a === primaryActionFor(q.tags) ? 'default' : 'outline'}
                      className="w-full justify-start"
                      disabled={pending}
                      onClick={() => onAction(q, a)}
                    >
                      <Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      {ACTION_LABEL[a]}
                    </Button>
                  );
                })}
                <span className="flex gap-1">
                  <Button variant="ghost" aria-label="編集" onClick={() => onEdit(q)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" aria-label="削除" onClick={() => onDelete(q)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                  </Button>
                </span>
              </span>
            )}
          </RowSlot>
        </Row>
      );
    })}
  </div>
  );
}
