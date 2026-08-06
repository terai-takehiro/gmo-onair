/**
 * 登録済みの予約 (v4)
 *
 * 予約ができたあとは**ここが唯一のもと**です。上の「スタジオの日程」は
 * 予約が1件も無いときだけ出ます（両方から動かせると、どちらが正か分からなくなる）。
 *
 * 消すときは確認を出します — カレンダーからも消え、押さえていた部屋が空きます。
 */
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatShortDate } from '@/lib/format';
import { FormSection } from './FormSection';
import type { ProjectBooking } from './types';

const TYPE_LABEL: Record<string, string> = {
  performance: '本番',
  rehearsal: 'リハーサル',
  hold: '仮押さえ',
};

export function BookingListSection({
  bookings, onAdd, onEdit, onDelete,
}: {
  bookings: ProjectBooking[];
  onAdd: () => void;
  onEdit: (b: ProjectBooking) => void;
  onDelete: (b: ProjectBooking) => void;
}) {
  return (
    <FormSection
      title="登録済みの予約"
      action={(
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          予約を足す
        </Button>
      )}
    >
      {bookings.length === 0 ? (
        <p className="text-sub text-muted-foreground">
          この案件に紐づく予約はまだありません。下の「スタジオの日程」に入れると作られます。
        </p>
      ) : (
        <ul className="space-y-1.5">
          {bookings.map((b) => {
            const roomNames = (b.rooms ?? []).map((r) => r.room_name).join(' / ');
            return (
              <li key={b.id}>
                <div className="flex items-center gap-2 rounded-control-lg border border-border p-2 hover:bg-accent/50">
                  <button
                    type="button"
                    onClick={() => onEdit(b)}
                    className="min-h-tap flex min-w-0 flex-1 items-center gap-2 text-left lg:min-h-[36px]"
                  >
                    <Badge variant="outline" className="shrink-0">
                      {TYPE_LABEL[b.booking_type] ?? b.booking_type}
                    </Badge>
                    <span className="text-sub min-w-0 flex-1 truncate">
                      <span className="font-number font-bold">{formatShortDate(b.start_time)}</span>
                      {roomNames && <span className="ml-2 text-muted-foreground">{roomNames}</span>}
                      {b.location_note && <span className="ml-2 text-muted-foreground">{b.location_note}</span>}
                    </span>
                  </button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-9 w-9"
                    aria-label="この予約を直す" onClick={() => onEdit(b)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                    aria-label="この予約を消す" onClick={() => onDelete(b)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </FormSection>
  );
}
