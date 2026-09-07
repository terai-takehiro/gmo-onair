/**
 * カレンダーに登録する（⑤ 入ってきた情報・migration 292）
 *
 * ── 「予定」はスタジオ予約そのもの ────────────────────────────
 *
 * 押すと **`studio_bookings` に1本作られます**（`TicketDialog.tsx` の
 * 「タスクにする」と同じ骨格）。案件予約のような16項目のダイアログ
 * （`StudioBookingDialog.tsx`）は再現しません — 受信箱から決めるのは
 * 「いつ・何の用で」だけで、**部屋やカレンダー上の細かい調整は現場
 * （予定表アプリ）でする**運用を想定しています。場所はメモ（自由記述）です。
 *
 * 初期値: タイトルは件名 → 要約、日付はメールの受信日 → 今日。
 */
import { useState } from 'react';
import { Loader2, CalendarPlus } from 'lucide-react';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useMakeBooking } from '@/lib/inboxApi';
import type { MiscInquiry } from '@/lib/types';

export function BookingDialog({
  inquiry, today, onClose,
}: {
  inquiry: MiscInquiry;
  /** `YYYY-MM-DD`。**呼ぶ側から渡す**（部品の中で時計を読まない） */
  today: string;
  onClose: () => void;
}) {
  const make = useMakeBooking();
  const [title, setTitle] = useState(inquiry.subject?.trim() || inquiry.summary);
  const [date, setDate] = useState((inquiry.received_at || '').slice(0, 10) || today);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState(inquiry.action_needed?.trim() || '');

  const valid = !!title.trim() && !!date && (allDay || (!!startTime && !!endTime));

  const submit = () => {
    make.mutate(
      {
        id: inquiry.id,
        fields: {
          title: title.trim(),
          all_day: allDay,
          start_time: `${date}T${allDay ? '00:00' : startTime}:00`,
          end_time: `${date}T${allDay ? '23:59' : endTime}:00`,
          location_note: location.trim() || null,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: (r) => {
          notifySuccess(r.already
            ? 'すでにカレンダーに登録されていました（増やしていません）'
            : 'カレンダーに登録しました。予定表に出ます');
          onClose();
        },
        onError: (e) => notifyApiError('カレンダーに登録できませんでした', e),
      },
    );
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title="カレンダーに登録する"
      onSubmit={(e) => { e.preventDefault(); if (make.isPending || !valid) return; submit(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>キャンセル</Button>
          <Button type="submit" disabled={make.isPending || !valid}>
            {make.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <CalendarPlus className="mr-2 h-4 w-4" aria-hidden="true" />}
            カレンダーに登録する
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          <strong className="font-bold">スタジオ予約が1本できます。</strong>
          部屋や細かい調整はあとで予定表アプリから直せます。
        </p>
        <div className="rounded-control-lg border border-border bg-surface-subtle p-3">
          <p className="text-note text-muted-foreground">元の情報</p>
          <p className="text-sub mt-0.5">{inquiry.summary}</p>
        </div>

        <div>
          <Label>タイトル *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Wi-Fi設置現地調査" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>日付 *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>開始時刻</Label>
            <Input type="time" value={startTime} disabled={allDay} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label>終了時刻</Label>
            <Input type="time" value={endTime} disabled={allDay} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div>
          <Button
            type="button"
            variant={allDay ? 'default' : 'outline'}
            onClick={() => setAllDay((v) => !v)}
          >
            終日
          </Button>
        </div>

        <div>
          <Label>場所（任意）</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="用賀 WORLD STUDIO" />
        </div>
        <div>
          <Label>メモ（任意）</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
    </FormDialog>
  );
}
