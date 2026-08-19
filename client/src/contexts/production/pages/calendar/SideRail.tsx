/**
 * ① 予定 / 右の3枚（モックの右レール）
 *
 * 今日の予定 ／ 期限が近い仮押さえ ／ 色の意味。
 *
 * **仮押さえは ③ 仮押さえと同じ問い合わせ・同じ数え方**（`holds/` の
 * `daysLeft` / `leftTone`）を使います。写すと、片方だけ直したときに
 * 「カレンダーでは 6 日なのに仮押さえ一覧では 5 日」が起きます。
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarCheck, ClockAlert } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  BOOKING_TYPE_COLORS, BOOKING_TYPE_LABELS,
} from '../../components/schedule/scheduleShared';
import { HOLD_KEY, daysLeft, leftTone, leftLabel, type HoldRow } from '../holds/holdLogic';
import { eventsOn, sortForList, timeLabel, type CalEvent } from './calendarLayout';

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-card overflow-hidden border border-border bg-card">{children}</section>;
}

export function SideRail({
  today, events, canStudio, onOpen,
}: {
  today: string;
  events: CalEvent[];
  canStudio: boolean;
  onOpen: (e: CalEvent) => void;
}) {
  const rows = sortForList(eventsOn(events, today));
  const dow = ['日', '月', '火', '水', '木', '金', '土'][new Date(`${today}T00:00:00`).getDay()];

  const holds = useQuery({
    queryKey: HOLD_KEY,
    queryFn: async () => (await api.get('/studios/bookings', {
      params: { status: 'tentative' },
    })).data.data as HoldRow[],
    enabled: canStudio,
    staleTime: 60_000,
  });

  const soon = useMemo(
    () => (holds.data ?? [])
      .map((b) => ({ ...b, left: daysLeft(b.start_time, today) }))
      .sort((a, b) => a.left - b.left)
      .slice(0, 4),
    [holds.data, today],
  );

  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 lg:w-[320px]">
      <Card>
        <div className="flex items-center gap-2 px-4 py-3">
          <CalendarCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="text-cardtitle min-w-0 flex-1 truncate">
            今日 {Number(today.slice(5, 7))}/{Number(today.slice(8))}（{dow}）
          </h2>
          <span className="font-number text-sub-sm shrink-0 text-muted-foreground">{rows.length} 件</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-note border-t border-border-faint px-4 py-3 text-muted-foreground">
            今日の予定はありません。
          </p>
        ) : rows.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => onOpen(e)}
            className="min-h-tap flex w-full items-center gap-2.5 border-t border-border-faint px-4 py-2.5 text-left"
          >
            <span className="h-[30px] w-1 shrink-0 rounded-badge-xs" style={{ backgroundColor: e.color }} />
            <span className="font-number text-sub-sm w-[72px] shrink-0 text-secondary-foreground">{timeLabel(e)}</span>
            <span className="min-w-0 flex-1">
              <span className="text-list block truncate">{e.title}</span>
              <span className="text-sub-sm block truncate text-muted-foreground">{e.sub || '—'}</span>
            </span>
            <span
              className="text-badge rounded-badge-xs w-14 shrink-0 truncate px-1 py-0.5 text-center font-bold"
              style={{ backgroundColor: `${e.color}1f`, color: e.color }}
            >
              {e.typeLabel}
            </span>
          </button>
        ))}
      </Card>

      {canStudio && (
        <Card>
          <div className="flex items-center gap-2 px-4 py-3">
            <ClockAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            {/*
              ⚠️ **見出しを「期限が近い仮押さえ」から変えた**（UXレポート 2026-08-18 指摘）。
              並びは残り日数順で、**本番日を過ぎた仮押さえ（超過）が先頭に来る**のが
              意図した仕様（③ 仮押さえ一覧と同じ・`holdLogic.ts`）。「期限が近い」だけだと
              数ヶ月前の超過案件が先頭にあるのが矛盾して見えるため、超過も含むことが
              分かる見出しにする
            */}
            <h2 className="text-cardtitle min-w-0 flex-1 truncate">仮押さえ（超過・期限順）</h2>
            <Link to="/studio/holds" className="text-note shrink-0 font-bold text-primary">すべて</Link>
          </div>
          {soon.length === 0 ? (
            <p className="text-note border-t border-border-faint px-4 py-3 text-muted-foreground">
              仮押さえはありません。
            </p>
          ) : soon.map((h) => (
            <div key={h.id} className="flex items-center gap-2.5 border-t border-border-faint px-4 py-2.5">
              <span className={cn('font-number text-badge w-12 shrink-0 rounded-badge-xs px-1 py-1 text-center font-bold', leftTone(h.left))}>
                {leftLabel(h.left)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-list block truncate">{h.title}</span>
                <span className="text-sub-sm block truncate text-muted-foreground">
                  {h.start_time.slice(0, 10)}
                  {h.rooms?.length ? ` ・ ${h.rooms.map((r) => r.room_name).join(' ')}` : ''}
                </span>
              </span>
            </div>
          ))}
        </Card>
      )}

      <section className="rounded-card border border-border bg-card px-4 py-3">
        <h2 className="text-cardtitle mb-2.5">色の意味</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {Object.keys(BOOKING_TYPE_LABELS).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-2.5 w-2.5 shrink-0 rounded-badge-xs" style={{ backgroundColor: BOOKING_TYPE_COLORS[k] }} />
              <span className="text-sub-sm text-secondary-foreground">{BOOKING_TYPE_LABELS[k]}</span>
            </span>
          ))}
        </div>
        <p className="text-note mt-2.5 text-muted-foreground">
          仮押さえは<strong className="font-bold">破線</strong>で出ます。題名に種別を混ぜないので、色と札で見分けます。
        </p>
      </section>
    </div>
  );
}
