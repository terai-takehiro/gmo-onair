/**
 * フィードバックチケット — 中身を見る/対応状況を変えるダイアログ (v4)
 *
 * **誰でも開いて中身を読める**（一覧の行を押すだけ）。
 * **対応状況を変えられるのは editor だけ**（入ってきた情報の状態遷移などと同じ
 * 切り分け）。editor でない人には対応状況・対応コメントを読み取り専用で見せる
 * — 「押せるのに何も起きない」フォームを出さない。
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE, TARGET_APP_LABEL, pageLabel, useUpdateTicketStatus,
  type FeedbackTicket, type TicketStatus,
} from '@/lib/feedbackTicketsApi';

const TEXTAREA = 'text-sub mt-1 w-full resize-y rounded-control border border-border bg-background px-3 py-2';
const SELECT = 'text-sub min-h-tap mt-1 w-full rounded-control border border-border bg-background px-3 lg:min-h-[40px]';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TicketDetailDialog({ ticket, canEdit, onClose }: {
  ticket: FeedbackTicket;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [note, setNote] = useState(ticket.response_note ?? '');
  const update = useUpdateTicketStatus();

  const save = () => {
    update.mutate({ id: ticket.id, input: { status, response_note: note.trim() || null } }, {
      onSuccess: () => { notifySuccess('対応状況を変えました'); onClose(); },
      onError: (e) => notifyApiError('対応状況を変えられませんでした', e),
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={ticket.title}
      sub={`${TARGET_APP_LABEL[ticket.target_app] ?? ticket.target_app} ／ ${pageLabel(ticket.target_app, ticket.target_page)} ・ ${CATEGORY_LABELS[ticket.category]}`}
      footer={
        <FormDialogFooter>
          <Button variant="outline" className="min-h-tap" onClick={onClose}>閉じる</Button>
          {canEdit && (
            <Button className="min-h-tap gap-1.5" onClick={save} disabled={update.isPending}>
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              保存する
            </Button>
          )}
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sub text-muted-foreground">
          送った人: {ticket.reporter_name} ・ {fmtDateTime(ticket.created_at)}
        </p>

        <p className="text-list whitespace-pre-wrap">{ticket.description}</p>

        <div className="rounded-card border border-border-faint bg-surface-subtle p-3">
          {canEdit ? (
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="ticket-status">対応状況</Label>
                <select
                  id="ticket-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                  className={SELECT}
                >
                  {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((k) => (
                    <option key={k} value={k}>{STATUS_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="ticket-response">対応コメント</Label>
                <textarea
                  id="ticket-response"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className={TEXTAREA}
                  placeholder="任意：何を直したか / なぜ見送ったか など"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sub text-muted-foreground">対応状況</span>
                <TableBadge label={STATUS_LABELS[ticket.status]} w={null} className={STATUS_TONE[ticket.status]} />
              </div>
              <p className="text-sub whitespace-pre-wrap text-muted-foreground">
                {ticket.response_note || '対応コメントはまだありません。'}
              </p>
            </div>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
