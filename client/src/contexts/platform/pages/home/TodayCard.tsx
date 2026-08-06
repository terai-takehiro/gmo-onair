/**
 * トップページの「今日の予定」 (v4)
 *
 * 現場・商談・締切をまとめて**時間順**に出します。
 *
 * ── 週の一覧ではなく「今日」だけ ────────────────────────────
 *
 * 旧トップは7日ぶんを横に並べていましたが、朝いちばんに見たいのは
 * **今日の自分の動き**です。先の予定はカレンダーで見ます。
 * データは同じ `GET /dashboard/weekly-schedule` の**先頭の日**だけを使います
 * （今日ぶんを別に数える口を作ると、カレンダーと食い違います）。
 *
 * ── 時刻が無い予定がある ────────────────────────────────────
 *
 * 案件の本番日・収録日は**日付しか持っていません**。「00:00」と出すと
 * 深夜0時の予定に見えるので、**「終日」として時刻の代わりに置きます**。
 */
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ArrowRight } from 'lucide-react';
import type { ScheduleDay, ScheduleEvent } from './types';

/** 種別ごとの見え方。**色は意味で決める**（画面ごとに変えない） */
const KIND: Record<string, { label: string; tone: string; bar: string }> = {
  event: { label: '本番', tone: 'bg-destructive-surface text-destructive', bar: 'bg-destructive' },
  recording: { label: '収録', tone: 'bg-primary-surface text-primary', bar: 'bg-primary' },
  broadcast: { label: '配信', tone: 'bg-ai-surface text-ai', bar: 'bg-ai' },
  booking: { label: 'スタジオ', tone: 'bg-info-surface text-info', bar: 'bg-info' },
  hold: { label: '仮押さえ', tone: 'bg-warning-surface text-warning', bar: 'bg-warning' },
};
const FALLBACK = { label: '予定', tone: 'bg-muted text-muted-foreground', bar: 'bg-border-disabled' };

/** `2026-08-06T13:00:00` → `13:00`。時刻を持たないものは `null` */
function timeOf(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /T(\d{2}:\d{2})/.exec(v);
  return m ? m[1] : null;
}

export function TodayCard({ days }: { days: ScheduleDay[] | undefined }) {
  const navigate = useNavigate();
  // 先頭の日 = 今日（サーバーが今日起点で7日ぶん返す）
  const today = days?.[0];
  const events = [...(today?.events ?? [])].sort((a, b) => {
    const ta = timeOf(a.start_time) ?? '99:99';
    const tb = timeOf(b.start_time) ?? '99:99';
    return ta.localeCompare(tb);
  });

  return (
    <section className="rounded-card flex h-full flex-col border border-border bg-card p-4 lg:px-5">
      <div className="flex items-center gap-2.5">
        <CalendarClock className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <h3 className="text-cardtitle">今日の予定</h3>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => navigate('/studio/calendar')}
          className="text-note flex items-center gap-0.5 font-bold text-primary hover:underline"
        >
          カレンダー<ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      <p className="text-note mt-1 text-muted-foreground">
        現場・収録・スタジオの予約を時間順に出します
      </p>

      {events.length === 0 ? (
        <p className="text-sub mt-3 text-secondary-foreground">今日の予定はありません。</p>
      ) : (
        <div className="mt-1.5 flex flex-col">
          {events.map((ev, i) => {
            const k = KIND[ev.type] ?? FALLBACK;
            const t = timeOf(ev.start_time);
            return (
              <div key={`${ev.type}-${ev.id ?? i}`} className="flex gap-2.5 border-t border-border-subtle py-2">
                <span className="w-12 shrink-0">
                  <span className="font-number text-sub block font-bold">{t ?? '終日'}</span>
                  {timeOf(ev.end_time) && (
                    <span className="font-number text-note block text-muted-foreground">
                      {timeOf(ev.end_time)}
                    </span>
                  )}
                </span>
                <span className={`w-[3px] shrink-0 self-stretch rounded-chip opacity-50 ${k.bar}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="text-sub block [overflow-wrap:anywhere]">{ev.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className={`rounded-badge-xs inline-flex h-[18px] items-center px-1.5 text-note font-bold ${k.tone}`}>
                      {k.label}
                    </span>
                    {ev.gls_number && (
                      <span className="font-number text-note truncate text-muted-foreground">{ev.gls_number}</span>
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export type { ScheduleEvent };
