/**
 * フィードバックチケット — スマホ版カード (v4)
 *
 * PC の `TicketRow`（`./TicketRows.tsx`）が `hideOnMobile` で落とす列
 * （種別・対象アプリ・送った人・送った日）を2行目にまとめて出す
 * （`client-daily/pages/news/NewsCards.tsx` と同じ考え方 — 列を消すのではなくカードで組み直す）。
 */
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE, TARGET_APP_SHORT_LABEL, pageLabel, type FeedbackTicket,
} from '@/lib/feedbackTicketsApi';

function fmtMd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function TicketCards({ tickets, onSelect }: { tickets: FeedbackTicket[]; onSelect: (t: FeedbackTicket) => void }) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {tickets.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onSelect(t)}
            className="min-h-tap w-full rounded-card flex flex-col gap-2 border border-border bg-card p-3.5 text-left"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <TableBadge label={STATUS_LABELS[t.status]} w={null} className={STATUS_TONE[t.status]} />
              <TableBadge label={CATEGORY_LABELS[t.category]} w={null} className="bg-muted text-muted-foreground" />
            </div>

            <p className="text-list truncate">{t.title}</p>

            <p className="text-sub truncate text-muted-foreground">
              {TARGET_APP_SHORT_LABEL[t.target_app] ?? t.target_app} ・ {pageLabel(t.target_app, t.target_page)} ・ {t.reporter_name} ・ {fmtMd(t.created_at)}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
