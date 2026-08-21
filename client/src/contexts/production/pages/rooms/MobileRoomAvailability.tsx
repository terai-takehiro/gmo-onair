/**
 * ② 部屋の空き（スマホ）— 日付選択（承認済みモックは無いが、① 予定のスマホ実装
 * `rooms/MobileToday.tsx` と対になる形で新設）
 *
 * ── 監査で見つかった穴 ────────────────────────────────────────
 *
 * PC は macOS のカレンダーアプリ風に作り直し済み（`RoomAvailabilityPage.tsx` 冒頭）だが、
 * スマホは `useIsMobile` の分岐が1行も無く、部屋 × 時間の帯をそのまま横スクロール
 * させているだけだった（`docs/v4-native-ui-audit-2026-08-20.md`「見つかった重要な誤り」）。
 * ① 予定と同じ水準（数字＋点の月表 → 選んだ日の中身）に揃える
 *
 * ── ① 予定と同じ部品・同じ作法 ────────────────────────────────
 *
 * 月表は `MobileMonthGrid` をそのまま使う（作り直さない）。日を選ぶのは
 * **月表のタップだけ**（① 予定と同じ。日の前後だけのボタンは持たない — 月をまたぐ移動は
 * 月送りの矢印で、日の移動は月表を直接押す）。祝日はこの画面では出さない
 * （PC 版も出していない。土日の色分けは曜日だけで足りる）
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { addMonths, type CalEvent } from '../calendar/calendarLayout';
import { MobileMonthGrid } from '../calendar/MobileMonthGrid';
import type { Holiday } from '../calendar/useCalendarEvents';
import type { SiteOption } from './RoomAvailabilityToolbar';
import { DAY_START_H, DAY_END_H } from './availability';

/** この画面は祝日を出さない（PC 版も出していない）。空のままでよい */
const NO_HOLIDAYS = new Map<string, Holiday>();

export function MobileRoomAvailability({
  today, day, dayTitle, miniAnchor, onMiniAnchor, onPickDay, onToday, monthEvents,
  sites, site, onSite, evsCount, allDayCount,
}: {
  today: string;
  day: string;
  dayTitle: string;
  /** 月表が見ている月（`YYYY-MM`） */
  miniAnchor: string;
  onMiniAnchor: (anchor: string) => void;
  onPickDay: (day: string) => void;
  onToday: () => void;
  /** 月表の点（`availability.ts` の `monthDotEvents`。色は種別・拠点の絞り込みに連動済み） */
  monthEvents: CalEvent[];
  sites: SiteOption[];
  site: string;
  onSite: (key: string) => void;
  evsCount: number;
  allDayCount: number;
}) {
  const monthTitle = `${miniAnchor.slice(0, 4)}年${Number(miniAnchor.slice(5, 7))}月`;
  const prevLabel = `${Number(addMonths(`${miniAnchor}-01`, -1).slice(5, 7))}月`;
  const stepMonth = (dir: 1 | -1) => onMiniAnchor(addMonths(`${miniAnchor}-01`, dir).slice(0, 7));

  return (
    <div className="flex flex-col gap-3 p-3">
      <PageHeader
        title="部屋の空き"
        sub={`予約 ${evsCount}件（うち終日 ${allDayCount}件） ・ ${DAY_START_H}:00 〜 ${DAY_END_H}:00 を表示`}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            className="min-h-tap text-note flex items-center gap-0.5 rounded-note px-1 font-bold text-primary"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />{prevLabel}
          </button>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={onToday}>今日</Button>
          <Button variant="outline" size="icon" aria-label="次の月" onClick={() => stepMonth(1)}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <h2 className="text-h1 [overflow-wrap:anywhere]">{monthTitle}</h2>
      </div>

      <MobileMonthGrid
        anchor={`${miniAnchor}-01`} today={today} selected={day}
        events={monthEvents} holidays={NO_HOLIDAYS} onPickDay={onPickDay}
      />

      <div className="h-px bg-border" />

      <h2 className="text-cardtitle">{dayTitle}</h2>

      {sites.length > 1 && (
        <FilterChips
          label="拠点で絞り込む"
          items={sites.map((s) => ({ key: s.key, label: s.label, count: null }))}
          value={site}
          onChange={onSite}
        />
      )}
    </div>
  );
}
