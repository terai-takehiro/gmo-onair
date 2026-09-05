/**
 * フィードバックチケット — PC の一覧行 (v4)
 *
 * 列 (7段の幅から選んだ): 状態 96 / 種別 72 / 対象 160（アプリ・画面をまとめて出す） /
 * 題名(伸びる) / 起票者 96 / 起票日 96。
 * **スマホは `./TicketCards.tsx` の2行カードに差し替える**（`FeedbackTicketsPage.tsx` の `isMobile`）。
 */
import { Row, RowHeader, RowMain, RowSub, RowSlot, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE, TARGET_APP_SHORT_LABEL, pageLabel, type FeedbackTicket,
} from '@/lib/feedbackTicketsApi';

function fmtMd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 「アプリ・画面」の表示文字列。狭い列でも見分けられるよう短い呼び名を使う */
function targetLabel(t: FeedbackTicket): string {
  return `${TARGET_APP_SHORT_LABEL[t.target_app] ?? t.target_app} ・ ${pageLabel(t.target_app, t.target_page)}`;
}

export function TicketRowsHeader() {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={96}>状態</RowSlot>
      <RowSlot w={72}>種別</RowSlot>
      <RowSlot w={160}>対象</RowSlot>
      <RowMain>題名</RowMain>
      <RowSlot w={96}>起票者</RowSlot>
      <RowSlot w={96} align="right">起票日</RowSlot>
    </RowHeader>
  );
}

export function TicketRow({ ticket, onSelect }: { ticket: FeedbackTicket; onSelect: () => void }) {
  // `Row` は `role="button"` を持つだけの `<div>` なので、キーボード操作
  // （Enter・Space）はブラウザが勝手には合成してくれない。押せる行の決めごと通り、
  // ここで拾って `onSelect` を呼ぶ（Space は既定でページを下スクロールするので防ぐ）
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };
  return (
    <Row divider interactive stackOnMobile onClick={onSelect} onKeyDown={onKeyDown} role="button" tabIndex={0}>
      <RowSlot w={96}>
        <TableBadge label={STATUS_LABELS[ticket.status]} w={null} className={STATUS_TONE[ticket.status]} />
      </RowSlot>
      <RowSlot w={72} hideOnMobile>
        <TableBadge label={CATEGORY_LABELS[ticket.category]} w={null} className="bg-muted text-muted-foreground" />
      </RowSlot>
      <RowSlot w={160} hideOnMobile className="overflow-hidden" title={targetLabel(ticket)}>
        <span className="text-sub-sm truncate text-muted-foreground">{targetLabel(ticket)}</span>
      </RowSlot>

      <RowMain>
        <RowTitle>{ticket.title}</RowTitle>
        {/* スマホでは右の列が畳まれるので、対象・起票者をここに出す */}
        <RowSub className="sm:hidden">
          {[targetLabel(ticket), ticket.reporter_name].filter(Boolean).join(' ・ ')}
        </RowSub>
      </RowMain>

      <RowSlot w={96} hideOnMobile>
        <span className="text-sub-sm truncate text-muted-foreground">{ticket.reporter_name}</span>
      </RowSlot>
      <RowSlot w={96} align="right" hideOnMobile>
        <span className="font-number text-sub-sm text-muted-foreground">{fmtMd(ticket.created_at)}</span>
      </RowSlot>
    </Row>
  );
}
