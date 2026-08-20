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
 *
 * ── PC を macOS のカレンダーアプリ風に作り直した（承認済みモック） ──
 *
 * ① 予定と同じく、ミニカレンダーを共通の左メニューへ常設した
 * （`calendar/CalSidebarExtras.tsx` を `shared/.../shell/sideMenuSlot.ts` の
 * 差し込み口へ portal する）。**この画面はレイヤーという概念を持たない**ので
 * 「マイカレンダー」のチェックは出さず、代わりに「レイヤーの絞り込みは
 * 持ちません」という説明文を出す（`emptyNote`）。ツールバーは
 * 今日／前後（日単位）／日付の見出し／拠点の絞り込み だけの1段
 * （`rooms/RoomAvailabilityToolbar.tsx`）。
 *
 * ── 帯の色は種別（承認済みモックで変えた） ──────────────────
 *
 * 旧実装は帯を部屋の色で塗っていた。① 予定・③ 仮押さえは種別（本番＝赤・
 * リハーサル＝amber…）で塗っており、同じ予約がこの画面だけ違う色に見える
 * 食い違いがあった。計算は `rooms/availability.ts` の `laneBlocks` に集約してある。
 *
 * ── スマホ専用レイアウトを追加した（監査で見つかった穴） ────────
 *
 * 着手前は `useIsMobile` の分岐が1行も無く、PC の表をそのまま横スクロールさせて
 * いるだけだった（`docs/v4-native-ui-audit-2026-08-20.md`「見つかった重要な誤り」）。
 * ① 予定のスマホ実装（月表 → 選んだ日のアジェンダ）と対になる専用レイアウトを
 * `rooms/MobileRoomAvailability.tsx`（日付選択）＋ `rooms/RoomAvailabilityCards.tsx`
 * （選んだ日の部屋カード）に新設した。**帯の計算（`laneBlocks`）は PC と共用**で、
 * 増えたのは月表の点を作る `monthDotEvents` だけ（① 予定の月表部品をそのまま使う）。
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { DoorOpen } from 'lucide-react';
import api from '@/lib/api';
import { useSideMenuTopSlot } from '@gmo-onair/shared/src/client/shell/sideMenuSlot';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { ymd, addDays, addMonths, startOfWeek } from './calendar/calendarLayout';
import { CalSidebarExtras } from './calendar/CalSidebarExtras';
import { RoomAvailabilityToolbar, type SiteOption } from './rooms/RoomAvailabilityToolbar';
import { MobileRoomAvailability } from './rooms/MobileRoomAvailability';
import { RoomAvailabilityCards } from './rooms/RoomAvailabilityCards';
import {
  DAY_START_H, DAY_END_H, laneBlocks, isAllDay, monthDotEvents,
  type AvailBooking, type AvailRoom,
} from './rooms/availability';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

interface LocationRow { id: string; name: string; rooms: AvailRoom[] }

export default function RoomAvailabilityPage() {
  const today = ymd(new Date());
  const [day, setDay] = useState(today);
  const [site, setSite] = useState('all');
  const [miniAnchor, setMiniAnchor] = useState(today.slice(0, 7));
  const sideMenuTopSlot = useSideMenuTopSlot();
  // **薄い親で1回だけ判定する。** 部品ごと入れ替えるだけで、
  // どちらの中でも `if (mobile) return …` のような早期returnはしない
  // （フックの数が幅で変わると React が落ちる。`client-v4/mobile.ts` の決めごと）
  const isMobile = useIsMobile();

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

  // ── スマホの月表の点だけに使う、月ぶんの予約 ──────────────────
  //
  // 選んだ日の帯（`evs`）とは別。**スマホでだけ取る**（`enabled: isMobile`）—
  // PC は月表を持たないので要らない。パディングは ① 予定（`MobileToday.tsx`）と
  // 同じ形（月の前後の週まで含める。前後の週の日も月表のマスに出るため）
  const monthRange = useMemo(() => {
    const first = `${miniAnchor}-01`;
    return { from: addDays(startOfWeek(first), -1), to: `${addDays(addMonths(first, 1), 7)}T23:59` };
  }, [miniAnchor]);

  const monthBookings = useQuery({
    queryKey: ['studio-bookings', 'month', monthRange.from, monthRange.to],
    enabled: isMobile,
    queryFn: async () => (await api.get('/studios/bookings', {
      params: { from: monthRange.from, to: monthRange.to },
    })).data.data as AvailBooking[],
  });

  // `?? []` を素で書くと**毎回別の配列**になり、下の `useMemo` が毎描画で走る
  const locations = useMemo(() => rooms.data ?? [], [rooms.data]);
  const evs = useMemo(() => bookings.data ?? [], [bookings.data]);
  const allDayCount = useMemo(() => evs.filter(isAllDay).length, [evs]);

  const sites: SiteOption[] = useMemo(() => [
    { key: 'all', label: 'すべて' },
    ...locations.map((l) => ({ key: l.id, label: l.name })),
  ], [locations]);

  // **拠点ごとに束ねる**（承認済みモックの表示）。部屋名の下に拠点名を書くだけの
  // 旧表示より、拠点をまたいで部屋を探すときに読みやすい
  const groups = useMemo(
    () => locations
      .filter((l) => site === 'all' || l.id === site)
      .map((l) => ({ id: l.id, name: l.name, rooms: l.rooms ?? [] }))
      .filter((g) => g.rooms.length > 0),
    [locations, site],
  );
  const roomCount = useMemo(() => groups.reduce((n, g) => n + g.rooms.length, 0), [groups]);

  // 拠点の絞り込みに連動した部屋の id 集合（月表の点を絞るのに使う）
  const roomIds = useMemo(
    () => new Set(groups.flatMap((g) => g.rooms.map((r) => r.id))),
    [groups],
  );
  const monthEvents = useMemo(
    () => (monthBookings.data ? monthDotEvents(monthBookings.data, roomIds) : []),
    [monthBookings.data, roomIds],
  );

  const hours = useMemo(
    () => Array.from({ length: DAY_END_H - DAY_START_H + 1 }, (_, i) => DAY_START_H + i),
    [],
  );

  const pickDay = (d: string) => { setDay(d); setMiniAnchor(d.slice(0, 7)); };
  const step = (n: number) => setDay(addDays(day, n));
  const goToday = () => { setDay(today); setMiniAnchor(today.slice(0, 7)); };

  const dayTitle = useMemo(() => {
    const dow = DOW[new Date(`${day}T00:00:00`).getDay()];
    return `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日（${dow}）${day === today ? '・今日' : ''}`;
  }, [day, today]);

  const loading = rooms.isLoading || bookings.isLoading;

  return (
    <div className="flex flex-col">
      {sideMenuTopSlot && createPortal(
        <CalSidebarExtras
          miniAnchor={miniAnchor} onMiniAnchor={setMiniAnchor}
          today={today} selected={day} onPick={pickDay}
          emptyNote="この画面は部屋の空きだけを見るので、レイヤー（スタジオ/パートナー/自分）の絞り込みは持ちません。"
        />,
        sideMenuTopSlot,
      )}

      {isMobile ? (
        <MobileRoomAvailability
          today={today} day={day} dayTitle={dayTitle}
          miniAnchor={miniAnchor} onMiniAnchor={setMiniAnchor}
          onPickDay={pickDay} onToday={goToday}
          monthEvents={monthEvents}
          sites={sites} site={site} onSite={setSite}
          evsCount={evs.length} allDayCount={allDayCount}
        />
      ) : (
        <div className="sticky top-0 z-10 bg-card">
          <RoomAvailabilityToolbar
            title={dayTitle}
            onPrev={() => step(-1)} onNext={() => step(1)} onToday={goToday}
            sites={sites} site={site} onSite={setSite}
          />
        </div>
      )}

      <div className="flex flex-col gap-3.5 p-3 lg:p-6">
        {/* スマホは `MobileRoomAvailability` の `PageHeader` が同じ件数を見出しに出す */}
        {!isMobile && (
          <p className="text-note text-muted-foreground">
            予約 {evs.length}件（うち終日 {allDayCount}件） ・ {DAY_START_H}:00 〜 {DAY_END_H}:00 を表示
          </p>
        )}

        {rooms.isError || bookings.isError ? (
          <ErrorPanel
            title="部屋の空きを読み込めませんでした"
            error={rooms.error ?? bookings.error}
            onRetry={() => { rooms.refetch(); bookings.refetch(); }}
          />
        ) : loading ? (
          <Delayed><SkeletonRows rows={5} /></Delayed>
        ) : roomCount === 0 ? (
          <EmptyState
            icon={<DoorOpen className="h-6 w-6" aria-hidden="true" />}
            title="部屋が登録されていません"
            description="設定の「部屋」で拠点と部屋を登録すると、ここに並びます。"
          />
        ) : isMobile ? (
          <RoomAvailabilityCards groups={groups} evs={evs} day={day} />
        ) : (
          <div className="rounded-card overflow-x-auto border border-border bg-card">
            <div className="min-w-[820px]">
              {/* 時間の目盛り。**部屋名の幅と揃える**（ずれると帯の位置を読み違える） */}
              <div className="sticky top-0 z-[1] flex border-b border-border-faint bg-surface-subtle">
                <span className="w-[196px] shrink-0 px-3 py-2" />
                <span className="relative min-w-0 flex-1">
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="font-number text-note absolute top-0 py-2 text-muted-foreground"
                      style={{ left: `${((h - DAY_START_H) / (DAY_END_H - DAY_START_H)) * 100}%` }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </span>
                  ))}
                  <span className="block py-2 opacity-0" aria-hidden="true">0</span>
                </span>
              </div>

              {groups.map((g) => (
                <div key={g.id}>
                  <div className="bg-surface-subtle px-3 py-1.5">
                    <span className="text-th text-muted-foreground">{g.name}</span>
                  </div>
                  {g.rooms.map((r) => {
                    // **見ている日を渡す。** 渡さないと日をまたぐ予約を置き違える
                    // （8/1 20:00〜8/2 10:00 が 8/2 の 20:00〜22:00 に出ていた）
                    const blocks = laneBlocks(evs, r.id, day);
                    return (
                      <div key={r.id} className="flex border-b border-border-faint last:border-b-0">
                        <span className="w-[196px] shrink-0 px-3 py-2.5">
                          <span className="text-sub flex items-center gap-1.5 font-bold">
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color || '#94a3b8' }} aria-hidden="true" />
                            <span className="min-w-0 truncate">{r.abbreviation || r.name}</span>
                          </span>
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
                                  b.tentative && 'border border-dashed',
                                  !b.tentative && 'border',
                                )}
                                style={{
                                  left: b.left,
                                  width: b.width,
                                  borderColor: b.color,
                                  // **終日は斜線。** 時間帯の予約と同じ塗りだと
                                  // 「8:00〜22:00 に何かある」と読み違える
                                  background: b.allDay
                                    ? `repeating-linear-gradient(45deg, ${b.color}22, ${b.color}22 4px, ${b.color}0d 4px, ${b.color}0d 8px)`
                                    : `${b.color}${b.tentative ? '14' : '1f'}`,
                                }}
                              >
                                <span className="text-note truncate font-bold" style={{ color: b.textColor }}>
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
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-note flex items-center gap-1.5 text-muted-foreground">
            <span className="h-3 w-[22px] shrink-0 rounded-badge-xs border-[1.5px] border-dashed border-muted-foreground" aria-hidden="true" />
            破線は仮押さえです（まだ決まっていません）
          </span>
          <span className="text-note flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-3 w-[22px] shrink-0 rounded-badge-xs border border-border-disabled"
              style={{ background: 'repeating-linear-gradient(45deg,#e2e5ea,#e2e5ea 4px,#f2f4f7 4px,#f2f4f7 8px)' }}
              aria-hidden="true"
            />
            斜線は終日です
          </span>
          <span className="text-note text-muted-foreground">
            横の余白が空きです（前の日から続いている予約もこの日のぶんだけ切って出しています）
          </span>
        </div>
      </div>
    </div>
  );
}
