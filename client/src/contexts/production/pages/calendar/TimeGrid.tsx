/**
 * ① 予定 / 週表・日表（モックの2枚目・3枚目）
 *
 * **週と日は同じ部品。** 違うのは列の数（7 か 1）と札の字の大きさだけで、
 * 目盛り・終日の欄・重なりの割り方・「いま」の線はまったく同じです。
 * 2つ書くと、どちらかだけ直した日から**同じ予定が別の位置に出ます**。
 *
 * ── 短い予定の読ませ方（v4.5.2）────────────────────────────
 *
 * 10分の予約は札の高さが最低値（約15px）に底上げされ、従来の
 * 「時刻の行＋題名の行」の2行は**物理的に入りません**でした（1行目の
 * 時刻だけ見えて題名が消える）。45分未満は**時刻と題名を1行に畳み**、
 * 全部の札に**ホバーで全文が読めるツールチップ**（title 属性）を付けます。
 *
 * ── ドラッグ操作（v4.5.2〜v4.6.13）──────────────────────────
 *
 * 空きマスを押す/なぞる → その時間で「予定を入れる」が開く。
 * 札の上下端のつまみを引く → 開始/終了時刻を延ばす/縮める。
 * 札の本体を掴んで動かす → 長さを保ったまま時間・曜日を動かす（`useGridDrag.ts`）。
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  placeDay, hourMarks, nowTop, eventsOn, outsideWindow, timeLabel,
  DAY_START_H, DAY_END_H, type CalEvent,
} from './calendarLayout';
import { useGridDrag } from './useGridDrag';
import type { Holiday } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/** ホバーで出す全文（短い札は本体に題名しか出せないため） */
const tip = (e: CalEvent) =>
  `${timeLabel(e)}｜${e.title}${e.sub ? `（${e.sub}）` : ''}`;

/** `YYYY-MM-DDTHH:MM` → その日の分。ドラッグ延長の対象は同日内の札だけなので単純でよい */
const hmToMin = (iso: string) => {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function TimeGrid({
  days, today, now, events, holidays, onOpen, onPickDay, onCreateRange, onResize, onMove, resizable,
}: {
  /** 出す日。週表は7日、日表は1日 */
  days: string[];
  today: string;
  now: Date;
  events: CalEvent[];
  holidays: Map<string, Holiday>;
  onOpen: (e: CalEvent) => void;
  onPickDay: (day: string) => void;
  /** 空きマスの選択で新規作成する（無ければ読むだけの表になる） */
  onCreateRange?: (day: string, start: string, end: string) => void;
  /** 札の上/下端ドラッグで開始/終了時刻を変える */
  onResize?: (e: CalEvent, edge: 'start' | 'end', time: string) => void;
  /** 札本体を掴んで動かす（長さは変えず、時間・曜日をまとめてずらす） */
  onMove?: (e: CalEvent, day: string, start: string, end: string) => void;
  /** その札を延ばす/動かせるか（権限と取得元で決まる。無ければ全部不可） */
  resizable?: (e: CalEvent) => boolean;
}) {
  const wide = days.length === 1;
  const marks = hourMarks();
  const line = nowTop(now);
  const drag = useGridDrag({ onCreateRange, onResize, onMove });

  return (
    <div className={cn('rounded-card overflow-hidden border border-border bg-card', drag.dragging && 'select-none')}>
      {/* 曜日と日付 */}
      <div className="flex border-b border-border-faint bg-surface-subtle">
        <span className="w-[56px] shrink-0" />
        {days.map((day) => {
          const dow = new Date(`${day}T00:00:00`).getDay();
          const hol = holidays.get(day);
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 border-l border-border-faint py-2"
            >
              <span
                className={cn('text-th', dow === 0 || hol ? 'text-destructive' : dow === 6 ? 'text-info' : 'text-muted-foreground')}
              >
                {DOW[dow]}
              </span>
              <span
                className={cn(
                  'font-number text-sub inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-chip px-1.5 font-bold',
                  isToday && 'bg-primary text-primary-foreground',
                )}
              >
                {Number(day.slice(8))}
              </span>
              {hol && <span className="text-sub-sm min-w-0 truncate text-destructive">{hol.name}</span>}
            </button>
          );
        })}
      </div>

      {/* 終日。**時間の帯にしない** — 幅を持たないので、横一杯にすると丸1日埋まって見える */}
      <div className="flex min-h-[30px] border-b border-border-faint">
        <span className="text-sub-sm flex w-[56px] shrink-0 items-center justify-end pr-2 text-muted-foreground">終日</span>
        {days.map((day) => (
          <span key={day} className="flex min-w-0 flex-1 flex-col gap-[3px] border-l border-border-faint p-1">
            {eventsOn(events, day).filter((e) => e.allDay).map((e) => (
              <button
                key={e.key}
                type="button"
                onClick={() => onOpen(e)}
                title={tip(e)}
                className={cn(
                  'rounded-badge flex h-[19px] items-center gap-1.5 overflow-hidden px-1.5',
                  // **終日の仮押さえ/希望日にも破線を付ける。** 有給等の希望日は終日が既定形
                  // なのに、この行だけ下の時間帯の札（164行目）と違って破線が付いていなかった
                  // （Codex レビューで指摘・#564）
                  e.tentative && 'border border-dashed',
                )}
                style={{ backgroundColor: `${e.color}1a`, borderColor: e.tentative ? e.color : undefined }}
              >
                <span className="h-3 w-[3px] shrink-0 rounded-badge-xs" style={{ backgroundColor: e.color }} />
                <span className="text-badge min-w-0 truncate text-secondary-foreground">{e.title}</span>
              </button>
            ))}
          </span>
        ))}
      </div>

      {/* 目盛りと札 */}
      <div className="flex h-[616px]">
        <div className="relative w-[56px] shrink-0">
          {marks.map((h) => (
            <span
              key={h.label}
              className="font-number text-sub-sm absolute right-2 -translate-y-1.5 text-muted-foreground"
              style={{ top: `${h.top}%` }}
            >
              {h.label}
            </span>
          ))}
        </div>
        {days.map((day) => {
          const dayEvents = eventsOn(events, day);
          const placed = placeDay(dayEvents, day);
          const outside = outsideWindow(dayEvents, day);
          const overlay = drag.overlayFor(day);
          return (
            <div
              key={day}
              data-cal-col
              data-day={day}
              className={cn('relative min-w-0 flex-1 border-l border-border-faint', onCreateRange && 'cursor-crosshair')}
              onMouseDown={(e) => drag.startCreate(day, e)}
            >
              {/* 1時間ごとの薄い線。**時刻の目盛りと同じ位置**に置く（別に計算しない） */}
              {marks.slice(1, -1).map((h) => (
                <span key={h.label} className="absolute inset-x-0 border-t border-border-faint" style={{ top: `${h.top}%` }} />
              ))}
              {placed.map((p) => {
                // 2行（時刻＋題名）には約55分ぶんの高さが要る（週表・実測）。
                // それ未満は1行に畳む（時刻は始まりだけ・全文はツールチップ）
                const compact = p.minutes < 55;
                // 同日内の時刻付きの札だけが対象。複数日にまたがる札は上下端も
                // 動かせない（`p.ev.start`側の日しか分からず、動かした先が
                // どちらの日の何時になるのか一意に決まらないため）
                const sameDay = !p.ev.allDay && (p.ev.end || p.ev.start).slice(0, 10) === p.ev.start.slice(0, 10);
                const canEditEvent = !!resizable?.(p.ev) && sameDay;
                const canResizeEnd = !!onResize && canEditEvent && !p.cutBottom;
                const canResizeStart = !!onResize && canEditEvent && !p.cutTop;
                const canMove = !!onMove && canEditEvent;
                const startMin = hmToMin(p.ev.start);
                const endMin = hmToMin(p.ev.end || p.ev.start);
                // ドラッグで動かしている最中の札は、元の位置には描かない
                // （帯（overlay）だけを動く先に見せる。両方出ると2枚に見える）
                if (drag.movingKey === p.ev.key) return null;
                return (
                  <button
                    key={p.ev.key}
                    type="button"
                    onMouseDown={canMove ? (e) => drag.startMove(day, p.ev, startMin, endMin, e) : undefined}
                    onClickCapture={(e) => { if (drag.wasDragged()) { e.preventDefault(); e.stopPropagation(); } }}
                    onClick={() => onOpen(p.ev)}
                    title={tip(p.ev)}
                    className={cn(
                      'v4-card group absolute flex flex-col overflow-hidden rounded-note border-l-[3px] text-left',
                      compact ? 'justify-center px-1.5 py-0' : 'gap-px px-1.5 py-1',
                      p.ev.tentative && 'border-y border-r border-dashed',
                      canMove && 'cursor-grab active:cursor-grabbing',
                    )}
                    style={{
                      top: `${p.top}%`,
                      height: `${p.height}%`,
                      left: `${p.left}%`,
                      width: `calc(${p.width}% - 2px)`,
                      borderLeftColor: p.ev.color,
                      borderTopColor: p.ev.tentative ? p.ev.color : undefined,
                      borderRightColor: p.ev.tentative ? p.ev.color : undefined,
                      borderBottomColor: p.ev.tentative ? p.ev.color : undefined,
                      backgroundColor: `${p.ev.color}14`,
                    }}
                  >
                    {compact ? (
                      /* **題名が先。** 幅が狭い（列が割れた）ときに切り詰めで生き残るのは
                          先頭側なので、時刻を先に置くと「10:… 」だけ見えて何の予定か
                          分からない（実測）。時刻は縦の位置とツールチップでも分かる */
                      <span className="text-badge min-w-0 truncate">
                        {p.cutTop && '↑'}
                        <span className="font-bold">{p.ev.title}</span>
                        <span className="font-number font-bold" style={{ color: p.ev.color }}>
                          {' '}{p.ev.start.slice(11, 16)}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn('font-number truncate font-bold', wide ? 'text-sub' : 'text-badge')}
                          style={{ color: p.ev.color }}
                        >
                          {/* 表示の外から続いていることを出す。切れているのに何も無いと「10:00 開始」と読まれる */}
                          {p.cutTop && '↑'}{timeLabel(p.ev)}{p.cutBottom && '↓'}
                        </span>
                        <span className={cn('truncate', wide ? 'text-list' : 'text-badge font-bold')}>{p.ev.title}</span>
                        {p.ev.sub && (
                          <span className={cn('truncate text-muted-foreground', wide ? 'text-sub-sm' : 'text-badge')}>
                            {p.ev.sub}
                          </span>
                        )}
                      </>
                    )}
                    {canResizeStart && (
                      /* 上端のつまみ。押して引くと開始時刻が動く（札のクリック・移動には化けない） */
                      <span
                        role="presentation"
                        data-resize-handle
                        onMouseDown={(e) => drag.startResize(day, p.ev, startMin, endMin, 'start', e)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-x-0 top-0 h-[7px] cursor-ns-resize"
                      >
                        <span
                          className="absolute top-[2px] left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-badge-xs opacity-0 group-hover:opacity-60"
                          style={{ backgroundColor: p.ev.color }}
                        />
                      </span>
                    )}
                    {canResizeEnd && (
                      /* 下端のつまみ。押して引くと終了時刻が動く（札のクリック・移動には化けない） */
                      <span
                        role="presentation"
                        data-resize-handle
                        onMouseDown={(e) => drag.startResize(day, p.ev, startMin, endMin, 'end', e)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-x-0 bottom-0 h-[7px] cursor-ns-resize"
                      >
                        <span
                          className="absolute bottom-[2px] left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-badge-xs opacity-0 group-hover:opacity-60"
                          style={{ backgroundColor: p.ev.color }}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
              {/* ドラッグ中の選択の帯（新規の範囲・延長後の姿） */}
              {overlay && (
                <span
                  className="rounded-note border-primary bg-primary/10 pointer-events-none absolute inset-x-0.5 z-20 flex items-start border-2 border-dashed px-1.5 py-0.5"
                  style={{ top: `${overlay.top}%`, height: `${overlay.height}%` }}
                >
                  <span className="font-number text-badge font-bold text-primary">{overlay.label}</span>
                </span>
              )}
              {/* 窓の外だけの予定の印。無いと 23:00 の期限・早朝の搬入が「無い」ように見え、
                  月表・一覧との食い違いになる（押すと先頭の1件を開く・全部はツールチップ） */}
              {outside.before.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpen(outside.before[0])}
                  title={outside.before.map(tip).join('\n')}
                  className="text-badge rounded-badge absolute left-0.5 top-0.5 z-10 bg-surface-subtle px-1 text-muted-foreground"
                >
                  ↑{DAY_START_H}時前 {outside.before.length}件
                </button>
              )}
              {outside.after.length > 0 && (
                <button
                  type="button"
                  onClick={() => onOpen(outside.after[0])}
                  title={outside.after.map(tip).join('\n')}
                  className="text-badge rounded-badge absolute bottom-0.5 left-0.5 z-10 bg-surface-subtle px-1 text-muted-foreground"
                >
                  ↓{DAY_END_H}時後 {outside.after.length}件
                </button>
              )}
              {day === today && line !== null && (
                <span className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-destructive" style={{ top: `${line}%` }}>
                  <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-chip bg-destructive" />
                  {wide && <span className="text-badge absolute right-2 -top-2 font-bold text-destructive">いま</span>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-2 text-muted-foreground">
        出しているのは <span className="font-number">{DAY_START_H}:00 – {DAY_END_H}:00</span> です。
        この外から続く予定は<strong className="font-bold">端で切って ↑↓ を付けて</strong>出します（消しません）。
        {onCreateRange && <>空いている所を<strong className="font-bold">なぞると</strong>その時間で予定を入れられます。</>}
        {onResize && <>札の<strong className="font-bold">上下端を引く</strong>と開始/終了時刻を変えられます。</>}
        {onMove && <>札の<strong className="font-bold">本体を掴んで動かす</strong>と時間・曜日をまとめてずらせます。</>}
      </p>
    </div>
  );
}
