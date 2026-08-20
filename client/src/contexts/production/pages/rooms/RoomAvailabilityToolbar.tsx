/**
 * ② 部屋の空き（PC）/ macOS のカレンダーアプリ風のツールバー（承認済みモック）
 *
 * ① 予定の `calendar/DesktopToolbar.tsx` と見た目は揃えるが、**中身は別物**:
 * 月・週・一覧の切替の代わりに**日の前後だけ**（この画面は常に1日ぶんの表）、
 * 「予定を入れる」の代わりに**拠点の絞り込み**（すべて／拠点名…）。
 * 2画面の目的が違うので同じ部品にしない — 無理に共通化すると
 * 「① 予定にしか要らない props」がこちらにも増える。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';

export interface SiteOption { key: string; label: string }

export function RoomAvailabilityToolbar({
  title, onPrev, onNext, onToday, sites, site, onSite,
}: {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** 拠点の絞り込み。**「すべて」を先頭に含めて渡す**（呼ぶ側が決める） */
  sites: SiteOption[];
  site: string;
  onSite: (key: string) => void;
}) {
  return (
    <div className="flex h-14 shrink-0 flex-wrap items-center gap-3.5 border-b border-border px-5 py-2">
      <button
        type="button"
        onClick={onToday}
        className="h-[30px] rounded-control-md border border-border px-3.5 text-note font-bold text-secondary-foreground"
      >
        今日
      </button>

      <span className="flex overflow-hidden rounded-control-md border border-border">
        <button
          type="button"
          onClick={onPrev}
          aria-label="前の日"
          className="flex h-[30px] w-[30px] items-center justify-center border-r border-border text-secondary-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onNext}
          aria-label="次の日"
          className="flex h-[30px] w-[30px] items-center justify-center text-secondary-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>

      <h1 className="text-h2 m-0">{title}</h1>

      <span className="flex-1" />

      {sites.length > 1 && (
        <span className="flex flex-wrap items-center gap-0.5 rounded-control-md border border-border bg-surface-subtle p-0.5">
          {sites.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onSite(s.key)}
              aria-pressed={site === s.key}
              className={cn(
                'h-[26px] whitespace-nowrap rounded-control px-3.5 text-note font-bold',
                site === s.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
