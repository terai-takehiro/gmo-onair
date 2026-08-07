/**
 * ② 部屋の空き（カレンダー・v4）
 *
 * ── カレンダーでは「空いているか」が読めない ────────────────
 *
 * ① 予定は**日付ごとに何があるか**を出す画面です。
 * 「8/2 の 14 時に WORLD が空いているか」を知りたいときは、
 * その日の予定を全部読んで頭の中で部屋ごとに並べ替えることになります。
 *
 * この画面は **部屋 × 時間の1枚**にします（モックの ②）。
 * 縦が部屋、横が 8:00〜22:00。埋まっているところに帯が出るので、
 * **空いている幅がそのまま見えます**。
 *
 * ── 終日の予定も帯にする（レビューで直した）────────────────
 *
 * 最初は「終日は時間の幅を持たないから帯にしない」として部屋名の下に文字で出して
 * いましたが、**この画面は横の余白が空きを意味します**。帯を出さないと
 * **丸1日押さえてある部屋が 14 時間まるごと空きに見え**、二重に予約されます。
 *
 * → **横一杯の帯を出したうえで、見た目を分けます**（斜線・「終日」と明記）。
 *   時間帯の予約と同じ塗りにすると「何時から何時まで」を読み違えるためです。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, DoorOpen } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { localDateStr } from '@/lib/format';
import {
  DAY_START_H, DAY_END_H, laneBlocks, isAllDay,
  type AvailBooking, type AvailRoom,
} from './rooms/availability';

interface LocationRow { id: string; name: string; rooms: AvailRoom[] }

export default function RoomAvailabilityPage() {
  const [day, setDay] = useState(() => localDateStr(new Date()));
  const [site, setSite] = useState('all');

  const rooms = useQuery({
    queryKey: ['studio-locations'],
    // 部屋は**拠点ごとに入れ子**で返る（`GET /studios/locations`）。
    // `/studios/rooms` は書き込み専用で、一覧の口ではない
    queryFn: async () => (await api.get('/studios/locations')).data.data as LocationRow[],
    staleTime: 5 * 60_000,
  });

  const bookings = useQuery({
    queryKey: ['studio-bookings', 'day', day],
    // 1日ぶんだけ。**下限は日付だけにする**（レビューで直した）。
    //
    // 終日の予約は `start_time` / `end_time` に**日付だけ**が入ります
    // （`StudioBookingDialog` が `all_day` のとき `2026-08-07` の形で保存する）。
    // 一方サーバーの絞り込みは **TEXT の文字列比較**なので、
    // `'2026-08-07' >= '2026-08-07T00:00'` は **false** になり、
    // **その日の終日の予約がまるごと落ちて**いました（実際に Postgres で確認）。
    // 下限を `2026-08-07` にすると、日付だけの行も時刻つきの行も両方拾えます。
    // 上限は `T23:59` のまま（翌日始まりの行を入れないため）
    queryFn: async () => (await api.get('/studios/bookings', {
      params: { from: day, to: `${day}T23:59` },
    })).data.data as AvailBooking[],
  });

  // `?? []` を素で書くと**毎回別の配列**になり、下の `useMemo` が毎描画で走る
  const locations = useMemo(() => rooms.data ?? [], [rooms.data]);
  const shownRooms = useMemo(
    () => locations
      .filter((l) => site === 'all' || l.id === site)
      .flatMap((l) => (l.rooms ?? []).map((r) => ({ ...r, location_name: l.name }))),
    [locations, site],
  );

  const evs = useMemo(() => bookings.data ?? [], [bookings.data]);
  // **終日も帯に含める。** 除くと押さえてある部屋が空きに見える
  const allDayCount = useMemo(() => evs.filter(isAllDay).length, [evs]);

  const hours = useMemo(
    () => Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => DAY_START_H + i),
    [],
  );

  const shift = (n: number) => {
    const d = new Date(`${day}T00:00:00`);
    d.setDate(d.getDate() + n);
    setDay(localDateStr(d));
  };

  const loading = rooms.isLoading || bookings.isLoading;

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="部屋の空き"
        sub={`${day} ・ 予約 ${evs.length}件（うち終日 ${allDayCount}件）・ ${DAY_START_H}:00 〜 ${DAY_END_H}:00 を表示`}
      >
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" aria-label="前の日" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Input
            type="date"
            value={day}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            aria-label="日を選ぶ"
            className="w-40"
          />
          <Button variant="outline" size="icon" aria-label="次の日" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => setDay(localDateStr(new Date()))}>今日</Button>
        </div>
      </PageHeader>

      {locations.length > 1 && (
        <FilterChips
          label="拠点で絞り込む"
          items={[
            { key: 'all', label: 'すべて', count: locations.reduce((n, l) => n + (l.rooms?.length ?? 0), 0) },
            ...locations.map((l) => ({ key: l.id, label: l.name, count: l.rooms?.length ?? 0 })),
          ]}
          value={site}
          onChange={setSite}
        />
      )}

      {rooms.isError || bookings.isError ? (
        <ErrorPanel
          title="部屋の空きを読み込めませんでした"
          error={rooms.error ?? bookings.error}
          onRetry={() => { rooms.refetch(); bookings.refetch(); }}
        />
      ) : loading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : shownRooms.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="h-6 w-6" aria-hidden="true" />}
          title="部屋が登録されていません"
          description="設定の「部屋」で拠点と部屋を登録すると、ここに並びます。"
        />
      ) : (
        <div className="rounded-card overflow-x-auto border border-border bg-card">
          <div className="min-w-[720px]">
            {/* 時間の目盛り。**部屋名の幅と揃える**（ずれると帯の位置を読み違える） */}
            <div className="flex border-b border-border-faint bg-surface-subtle">
              <span className="w-40 shrink-0 px-3 py-2" />
              <span className="relative min-w-0 flex-1">
                {hours.map((h) => (
                  <span
                    key={h}
                    className="font-number text-note absolute top-0 py-2 text-muted-foreground"
                    style={{ left: `${((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100}%` }}
                  >
                    {h}
                  </span>
                ))}
                <span className="block py-2 opacity-0" aria-hidden="true">0</span>
              </span>
            </div>

            {shownRooms.map((r) => {
              // **見ている日を渡す。** 渡さないと日をまたぐ予約を置き違える
              // （8/1 20:00〜8/2 10:00 が 8/2 の 20:00〜22:00 に出ていた）
              const blocks = laneBlocks(evs, r.id, day);
              return (
                <div key={r.id} className="flex border-b border-border-faint last:border-b-0">
                  <span className="w-40 shrink-0 px-3 py-2.5">
                    <span className="text-sub flex items-center gap-1.5 font-bold">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color || '#94a3b8' }} aria-hidden="true" />
                      <span className="min-w-0 truncate">{r.abbreviation || r.name}</span>
                    </span>
                    <span className="text-note block truncate text-muted-foreground">{r.location_name}</span>
                  </span>

                  <span className="relative min-w-0 flex-1 py-2">
                    {hours.map((h) => (
                      <span
                        key={h}
                        className="absolute bottom-0 top-0 border-l border-border-faint"
                        style={{ left: `${((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100}%` }}
                        aria-hidden="true"
                      />
                    ))}
                    <span className="relative block h-9">
                      {blocks.map((b) => (
                        <span
                          key={b.id}
                          title={`${b.timeLabel} ${b.title}`}
                          className={cn(
                            'rounded-note absolute inset-y-0 flex items-center overflow-hidden px-1.5',
                            // 仮押さえは**破線**。確定と同じ見た目にすると、
                            // 押さえただけの枠を「決まっている」と読んでしまう
                            b.tentative ? 'border border-dashed' : 'border',
                            // **終日は塗りを分ける。** 時間帯の予約と同じ塗りだと
                            // 「8:00〜22:00 に何かある」と読み違える
                            b.allDay && 'bg-avail-allday',
                          )}
                          style={{
                            left: b.left, width: b.width,
                            background: b.allDay || b.tentative ? undefined : 'rgb(var(--primary-surface))',
                            borderColor: b.color || 'rgb(var(--border))',
                          }}
                        >
                          <span className="text-note truncate font-bold text-secondary-foreground">
                            <span className="font-number">{b.timeLabel}</span> {b.title}
                          </span>
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-note text-muted-foreground">
        <strong className="font-bold">破線は仮押さえ</strong>です（まだ決まっていません — 「仮押さえ」の画面で確定か取り消しを決めます）。
        <strong className="font-bold">斜線は終日</strong>の予約です（その日はその部屋が押さえられています）。
        <strong className="font-bold">横の余白が空き</strong>なので、
        前の日から続いている予約もこの日のぶんだけ切って出しています。
      </p>
    </div>
  );
}
