/**
 * ⑥ 休日・営業時間 — **祝日の表（畳んである）**（`HoursPage` から切り出し）
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * 2026〜2030 の祝日（`kind === 'holiday'`）。**89 件あるので既定は畳む** —
 * 全部並べると、その下にある「この会社が決めた休業日」が埋もれる。
 * 初期値は「営業する」（放送・制作は祝日こそ稼働することがある）。
 * 開いているかどうかの状態は `HoursPage` が持ち、ここは受け取って描くだけ。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `HoursPage.tsx` が 400 行（このリポジトリの1ファイルの上限）を超えたため、
 * **画面の中の表ごと**に分けた。**JSX は1文字も変えずに移してある。**
 */
import { AlertTriangle, Info, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { AVAILABILITY, label, type ClosedDay } from './hoursTypes';

export function HolidayList({
  holidays, decided, showHolidays, setShowHolidays, canEdit, setDialog,
}: {
  holidays: ClosedDay[];
  /** 「営業する」以外にしてある件数（畳んだままでも決めた数が分かるように出す） */
  decided: number;
  showHolidays: boolean;
  setShowHolidays: (f: (v: boolean) => boolean) => void;
  canEdit: boolean;
  setDialog: (s: { open: boolean; day: ClosedDay | null }) => void;
}) {
  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <button
        type="button"
        onClick={() => setShowHolidays((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-left"
      >
        <span className="text-cardtitle shrink-0">祝日</span>
        <span className="text-note min-w-0 flex-1 text-muted-foreground">
          2026〜2030 の {holidays.length} 件。
          {decided > 0
            ? `うち ${decided} 件を「休む」にしています`
            : '初期値はすべて「営業する」で、注意は出ません'}
        </span>
        <span className="text-note shrink-0 text-primary">{showHolidays ? '閉じる' : '開く'}</span>
      </button>

      {showHolidays && (
        <>
          <p className="text-note flex items-start gap-2 border-t border-info-border bg-info-surface px-4 py-3 text-secondary-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span>
              放送・制作は祝日こそ稼働することがあるので、<strong className="font-bold">初期値は「営業する」</strong>にしてあります。
              休む祝日だけ「受け付けない」に変えてください。
              <strong className="font-bold">春分の日・秋分の日は予測です</strong>（政府が前年2月に公示するまで確定しません）。
            </span>
          </p>
          <div className="max-h-96 overflow-y-auto">
            {holidays.map((c) => (
              <Row key={c.id} density="table" divider stackOnMobile>
                <RowMain>
                  <DateRange start={c.from_date} end={c.to_date} className="text-list block" />
                </RowMain>
                <RowSlot w={200}>
                  <span className="text-sub flex items-center gap-1.5 truncate">
                    {c.name}
                    {c.estimated && (
                      <span className="text-note inline-flex items-center gap-0.5 text-warning" title="政府の公示まで確定しません">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />予測
                      </span>
                    )}
                  </span>
                </RowSlot>
                <RowSlot w={128}>
                  <span className={cn('rounded-note text-note px-2 py-0.5 font-bold', label(AVAILABILITY, c.availability).tone)}>
                    {label(AVAILABILITY, c.availability).label}
                  </span>
                </RowSlot>
                {canEdit && (
                  <RowSlot w={96} align="right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="編集"
                      onClick={() => setDialog({ open: true, day: c })}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </RowSlot>
                )}
              </Row>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
