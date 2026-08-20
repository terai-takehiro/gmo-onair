/**
 * ① 予定（PC）/ 左メニューの上に差し込む「いつ・何を見るか」（承認済みモック）
 *
 * ミニカレンダー（月を素早く移動して日を選ぶ）＋「マイカレンダー」の
 * 出す/隠すチェック。**共通の左メニュー（`AppSideMenu`）の中に描く**
 * （`shared/src/client/shell/sideMenuSlot.ts` の差し込み口）。
 *
 * ── ミニカレンダーは本体と緩くしか連動しない（モックの指定） ──────
 *
 * ミニカレンダーの前後ボタンは**ミニカレンダーだけ**を動かす（本体の月表・週表は
 * 動かない）。ミニカレンダーの日を押したときだけ、本体の月・選択日の両方が
 * その日に揃う。「今日」ボタンはミニカレンダーごと今日に戻す。
 * → 本体を送りながら別の月の日を先に確かめる、という使い方ができる。
 */
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { addMonths, monthWeeks, type CalLayer } from './calendarLayout';
import { MY_SOURCE_LEGEND } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

const LAYER_ITEMS: Array<{ key: CalLayer; label: string; dot: string }> = [
  { key: 'studio', label: 'スタジオ', dot: '#dc2626' },
  { key: 'partner', label: 'パートナー', dot: '#8b5cf6' },
  { key: 'my', label: '自分', dot: '#2563eb' },
];

export function CalSidebarExtras({
  miniAnchor, onMiniAnchor, today, selected, onPick, layers, onToggleLayer, visible, emptyNote,
}: {
  /** ミニカレンダーが見ている月（`YYYY-MM`） */
  miniAnchor: string;
  onMiniAnchor: (anchor: string) => void;
  today: string;
  selected: string;
  onPick: (day: string) => void;
  /**
   * 「マイカレンダー」の出す/隠す。**省略すると節ごと出さない**
   * （② 部屋の空きのように、層という概念を持たない画面向け）
   */
  layers?: Record<CalLayer, boolean>;
  onToggleLayer?: (k: CalLayer) => void;
  /** その層を読む権限がある人にだけチェックを出す（押しても効かない項目を並べない） */
  visible?: Record<CalLayer, boolean>;
  /** レイヤーの節が無いときに、代わりにミニカレンダーの下へ出す説明文 */
  emptyNote?: string;
}) {
  const weeks = monthWeeks(`${miniAnchor}-01`);
  const items = visible ? LAYER_ITEMS.filter((it) => visible[it.key]) : [];

  return (
    <div className="flex flex-col pb-3 pt-1">
      <div className="mb-1.5 flex items-center px-1">
        <button
          type="button"
          onClick={() => onMiniAnchor(addMonths(`${miniAnchor}-01`, -1).slice(0, 7))}
          aria-label="ミニカレンダーの前の月"
          className="flex h-[22px] w-[22px] items-center justify-center text-muted-foreground"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        </button>
        <span className="text-sub-sm flex-1 text-center font-extrabold">
          {Number(miniAnchor.slice(0, 4))}年{Number(miniAnchor.slice(5, 7))}月
        </span>
        <button
          type="button"
          onClick={() => onMiniAnchor(addMonths(`${miniAnchor}-01`, 1).slice(0, 7))}
          aria-label="ミニカレンダーの次の月"
          className="flex h-[22px] w-[22px] items-center justify-center text-muted-foreground"
        >
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 px-1">
        {DOW.map((d, i) => (
          <span
            key={d}
            className={cn(
              'pb-0.5 text-center text-[9.5px] font-bold',
              i === 0 ? 'text-destructive' : i === 6 ? 'text-info' : 'text-muted-foreground',
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 px-1">
        {weeks.flat().map((day) => {
          const inMonth = day.slice(0, 7) === miniAnchor;
          const isToday = day === today;
          const isSelected = day === selected;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              aria-label={`${day} を選ぶ`}
              className={cn('flex items-center justify-center py-0.5', !inMonth && 'opacity-30')}
            >
              <span
                className={cn(
                  'font-number flex h-[23px] w-[23px] items-center justify-center rounded-chip text-[10.5px] font-bold',
                  isToday && 'bg-primary text-primary-foreground',
                  !isToday && isSelected && 'bg-primary-surface text-primary',
                )}
              >
                {Number(day.slice(8))}
              </span>
            </button>
          );
        })}
      </div>

      {items.length > 0 ? (
        <>
          <div className="mx-2 my-3.5 h-px bg-border" />
          <p className="text-th mb-1 px-2.5 text-muted-foreground">マイカレンダー</p>
          <div className="flex flex-col">
            {items.map((it) => {
              const on = layers?.[it.key];
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => onToggleLayer?.(it.key)}
                  aria-pressed={on}
                  className="min-h-tap flex items-center gap-2.5 rounded-control-lg px-2.5 py-1.5 text-left hover:bg-muted lg:min-h-[38px]"
                >
                  <span
                    className="rounded-badge-xs flex h-[15px] w-[15px] shrink-0 items-center justify-center border-[1.5px]"
                    style={{ borderColor: it.dot, backgroundColor: on ? it.dot : 'transparent' }}
                  >
                    {on && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className="text-list text-secondary-foreground">{it.label}</span>
                </button>
              );
            })}
          </div>

          {/*
            **旧マイカレンダー（`/studio/my-calendar`・退役済み）の色分けをここへ吸収した。**
            「自分」を出しているときだけ、取込元ごとの色を小さく添える
            （消すと、① 予定だけでは自分の予定が青一色に見えて取込元が分からなくなる）
          */}
          {layers?.my && visible?.my && (
            <div className="mt-2 flex flex-col gap-1 px-2.5">
              {MY_SOURCE_LEGEND.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-chip" style={{ backgroundColor: s.dot }} />
                  <span className="text-note text-muted-foreground">{s.label}</span>
                </span>
              ))}
            </div>
          )}

          <p className="text-note mt-2 px-2.5 text-muted-foreground">
            チェックした層だけをカレンダーに出します。マス目の色は種別ごとです。
          </p>
        </>
      ) : emptyNote && (
        <p className="text-note mt-2 px-2.5 text-muted-foreground">{emptyNote}</p>
      )}

      {/* 「見る」ナビの前で1本区切る（承認済みモックにある2本目の罫線） */}
      <div className="mx-2 mb-1 mt-3.5 h-px bg-border" />
    </div>
  );
}
