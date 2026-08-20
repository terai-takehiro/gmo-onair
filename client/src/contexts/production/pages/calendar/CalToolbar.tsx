/**
 * ① 予定 / 上の操作帯（モックの1本）
 *
 * 見え方（月・週・日・一覧）／前後と今日／出すもの（レイヤー）／絞り込み。
 * **1本にまとめる**のが要点で、着手前はレイヤーだけが別の行にあり、
 * 月送りは FullCalendar の中のボタンでした（見た目も高さもばらばら）。
 */
import { ChevronLeft, ChevronRight, DoorOpen, UserSearch, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { CalLayer } from './calendarLayout';

export type CalView = 'month' | 'week' | 'day' | 'list';

export const VIEW_LABEL: Record<CalView, string> = {
  month: '月', week: '週', day: '日', list: '一覧',
};

export interface LayerDef { key: CalLayer; label: string; dot: string; show: boolean }

/** 押せる小さな枠。**高さは 30px で揃える**（スマホは 44px） */
const ctl = 'min-h-tap lg:min-h-[30px] inline-flex items-center gap-1.5 rounded-note border px-2.5 text-note font-bold whitespace-nowrap';

/**
 * ① 予定（統合）は3層を重ねるので「出すもの」「人で絞る」「部屋で絞る」を全部使う。
 * **旧スタジオ・パートナー・マイの3画面は1層しか持たない**ので、`layerDefs` を空
 * （＝「出すもの」の行ごと出さない）にし、絞り込みは持つほうだけ渡す
 * （`onPickRooms`/`onPickUsers` を渡さなければボタンごと出ない）。
 */
export function CalToolbar({
  view, onView, title, onPrev, onNext, onToday,
  layers, onToggleLayer, layerDefs,
  roomCount, userCount, onPickRooms, onPickUsers, onClearFilters,
  views,
}: {
  view: CalView;
  onView: (v: CalView) => void;
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  layers?: Record<CalLayer, boolean>;
  onToggleLayer?: (k: CalLayer) => void;
  layerDefs?: LayerDef[];
  roomCount?: number;
  userCount?: number;
  onPickRooms?: () => void;
  onPickUsers?: () => void;
  onClearFilters?: () => void;
  /**
   * 出す切替だけ絞る。**既定は4つ全部**（① 予定はこのまま）。
   * スマホ幅では月表のマスが数ミリ角になる画面があるので、そこだけ
   * `['list']` を渡して一覧だけにする（呼び出し側の判断・ここでは強制しない）
   */
  views?: CalView[];
}) {
  const shownLayers = (layerDefs ?? []).filter((l) => l.show);
  const shownViews = views ?? (Object.keys(VIEW_LABEL) as CalView[]);
  return (
    <div className="rounded-card flex flex-wrap items-center gap-x-3 gap-y-2 border border-border bg-card px-3.5 py-2.5">
      <span className="flex shrink-0 items-center gap-1">
        {shownViews.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onView(v)}
            className={cn(
              'min-h-tap text-note w-14 rounded-note border font-bold lg:min-h-[30px]',
              view === v ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-muted-foreground',
            )}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </span>

      <span className="h-5 w-px shrink-0 bg-border" />

      <span className="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="icon" onClick={onPrev} aria-label="前へ">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="font-number text-cardtitle w-[128px] text-center">{title}</span>
        <Button variant="outline" size="icon" onClick={onNext} aria-label="次へ">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="outline" onClick={onToday}>今日</Button>
      </span>

      {shownLayers.length > 0 && (
        <>
          <span className="h-5 w-px shrink-0 bg-border" />
          <span className="text-th shrink-0 text-muted-foreground">出すもの</span>
          <span className="flex flex-wrap items-center gap-1">
            {shownLayers.map((l) => {
              const on = !!layers?.[l.key];
              return (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => onToggleLayer?.(l.key)}
                  aria-pressed={on}
                  className={cn(
                    'min-h-tap text-note inline-flex items-center gap-1.5 rounded-chip border px-2.5 font-bold lg:min-h-[30px]',
                    on ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-fg-disabled',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-chip"
                    style={{ backgroundColor: on ? l.dot : 'rgb(var(--border-disabled))' }}
                  />
                  {l.label}
                </button>
              );
            })}
          </span>
        </>
      )}

      <span className="flex-1" />

      {onPickUsers && (
        <button type="button" onClick={onPickUsers} className={cn(ctl, (userCount ?? 0) > 0 ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-secondary-foreground')}>
          <UserSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {(userCount ?? 0) > 0 ? `人で絞る（${userCount}）` : '人で絞る'}
        </button>
      )}
      {onPickRooms && (
        <button type="button" onClick={onPickRooms} className={cn(ctl, (roomCount ?? 0) > 0 ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-secondary-foreground')}>
          <DoorOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {(roomCount ?? 0) > 0 ? `部屋で絞る（${roomCount}）` : '部屋で絞る'}
        </button>
      )}
      {onClearFilters && ((roomCount ?? 0) > 0 || (userCount ?? 0) > 0) && (
        <button type="button" onClick={onClearFilters} className={cn(ctl, 'border-border bg-card text-muted-foreground')}>
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />絞りを外す
        </button>
      )}
    </div>
  );
}
