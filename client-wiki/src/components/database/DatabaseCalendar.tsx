/**
 * カレンダーのビュー — 日付型の項目で月表示（設計 §6-⑩）
 *
 * ⚠️ 予定（カレンダー）の部品は案件管理アプリの中にあって共有されていないので、
 *    ここでは**月のマスを素直に組みます**（共通ライブラリへ上げるのは、
 *    予定と Wiki の両方で使い回す形が見えてからにする）。
 *
 * スマホでは 7 列のマスに題名が入らないので、マスには件数だけを出し、
 * その月の行を下に一覧で続けます（読めない字を並べない）。
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiItem, WikiRow } from '@gmo-onair/shared/src/wiki/types';
import { cn } from '@/lib/utils';
import { monthCells, monthLabel, rowsByDate, shiftMonth, ymd } from './dbView';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export interface DatabaseCalendarProps {
  rows: WikiRow[];
  /** 月に並べるのに使う日付型の項目。無ければ案内を出す */
  dateItem: WikiItem | null;
}

export default function DatabaseCalendar({ rows, dateItem }: DatabaseCalendarProps) {
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });

  if (!dateItem) {
    return (
      <EmptyState
        icon={<CalendarDays />}
        title="日付の項目が決まっていません"
        description="カレンダーは日付型の項目で月に並べます。「ビューの設定」で項目を選んでください。"
      />
    );
  }

  const cells = monthCells(cursor.year, cursor.month);
  const byDate = rowsByDate(rows, dateItem.id);
  const todayKey = ymd(today);
  const inMonth = cells.filter((c) => c.inMonth).flatMap((c) => (byDate.get(c.date) ?? []).map((r) => ({ date: c.date, row: r })));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="前の月"
          onClick={() => setCursor((c) => shiftMonth(c.year, c.month, -1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="text-cardtitle text-foreground">{monthLabel(cursor.year, cursor.month)}</span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="次の月"
          onClick={() => setCursor((c) => shiftMonth(c.year, c.month, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
        >
          今月
        </Button>
        <span className="ml-auto truncate text-sub-sm text-muted-foreground">{dateItem.name} で並べています</span>
      </div>

      <div className="overflow-hidden rounded-card border border-border">
        <div className="grid grid-cols-7 border-b border-border-subtle bg-surface-subtle">
          {WEEKDAYS.map((w) => (
            <span key={w} className="px-1.5 py-1.5 text-center text-th text-muted-foreground">{w}</span>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const list = byDate.get(cell.date) ?? [];
            return (
              <div
                key={cell.date}
                className={cn(
                  'min-h-[72px] border-b border-r border-border-faint p-1 last:border-r-0',
                  !cell.inMonth && 'bg-surface-subtle',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-5 min-w-[20px] items-center justify-center rounded-chip px-1 text-sub-sm tabular-nums',
                    cell.inMonth ? 'text-muted-foreground' : 'text-muted-foreground/70',
                    cell.date === todayKey && 'bg-primary text-primary-foreground',
                  )}
                >
                  {Number(cell.date.slice(8))}
                </span>

                {/* スマホは件数だけ（題名を入れると読めない幅になる） */}
                {list.length > 0 && (
                  <span className="ml-1 text-sub-sm text-muted-foreground sm:hidden">{list.length}件</span>
                )}

                <span className="hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((row) => (
                    <Link
                      key={row.id}
                      to={`/p/${row.id}`}
                      className="truncate rounded-control bg-primary-surface px-1 py-0.5 text-sub-sm text-primary no-underline hover:bg-muted"
                    >
                      {row.title}
                    </Link>
                  ))}
                  {list.length > 3 && (
                    <span className="px-1 text-sub-sm text-muted-foreground">ほか {list.length - 3} 件</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* スマホで中身に辿り着けるようにする（マスには件数しか出していないため） */}
      <div className="flex flex-col sm:hidden">
        {inMonth.length === 0 ? (
          <p className="py-3 text-center text-sub text-muted-foreground">この月に入っている行はありません。</p>
        ) : (
          inMonth.map(({ date, row }) => (
            <Link
              key={`${date}-${row.id}`}
              to={`/p/${row.id}`}
              className="flex min-h-tap items-center gap-2 border-b border-border-faint px-1 no-underline last:border-b-0"
            >
              <span className="w-[56px] shrink-0 text-sub-sm tabular-nums text-muted-foreground">
                {date.slice(5).replace('-', '/')}
              </span>
              <span className="min-w-0 flex-1 truncate text-list text-foreground">{row.title}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
