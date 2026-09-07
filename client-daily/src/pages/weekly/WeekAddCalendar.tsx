/**
 * ウィークリー活動報告 — 対象週を月次カレンダーから選ぶ (2026-09 の再設計)
 *
 * ── なぜ日付入力欄をやめたか ────────────────────────────────
 *
 * 最初は `<input type="date">` を置いただけだったが、
 * ①どの週が既にあるのか分からないまま日付を打つ ②打った日が週のどこに当たるのかが
 * 見えない（サーバーが月曜へ丸める）ため、押すまで何が起きるか分からなかった。
 *
 * 月次カレンダーを出し、**行（＝週）ごと選ぶ**形にした。作成済みの週はその場で
 * 判別できるので重複作成にならず、丸めた結果（月曜〜日曜）も選ぶ前に見える。
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWeekRangeJa, toDateStr } from '@/lib/types';

/** その日が属する週の月曜 (サーバーの `normalizeWeekStart` と同じ規則) */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay(); // 0=日
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 月の全日を含む週 (月曜はじまり) を並べる */
function weeksOfMonth(year: number, month: number): Date[][] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const rows: Date[][] = [];
  for (let cur = mondayOf(first); cur <= last; cur = addDays(cur, 7)) {
    rows.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
  }
  return rows;
}

export function WeekAddCalendar({ existing, onCreate, creating }: {
  /** 既にある週の period_key (YYYY-MM-DD・月曜) */
  existing: Set<string>;
  onCreate: (weekStart: string) => void;
  creating: boolean;
}) {
  const today = new Date();
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const [picked, setPicked] = useState<string | null>(null);
  const thisWeek = toDateStr(mondayOf(today));

  const shift = (n: number) => setView((v) => {
    const d = new Date(v.y, v.m - 1 + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border p-2.5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="前の月">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="font-number text-list flex-1 text-center">{view.y}年 {view.m}月</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="次の月">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_64px] items-center">
        {['月', '火', '水', '木', '金', '土', '日'].map((w) => (
          <span key={w} className="text-th py-1 text-center text-muted-foreground">{w}</span>
        ))}
        <span />
      </div>

      <div className="flex flex-col gap-0.5">
        {weeksOfMonth(view.y, view.m).map((days) => {
          const start = toDateStr(days[0]);
          const made = existing.has(start);
          const active = picked === start;
          return (
            <button
              key={start}
              type="button"
              disabled={made}
              onClick={() => setPicked(start)}
              aria-label={`${formatWeekRangeJa(start)}${made ? '（作成済み）' : ''}`}
              className={`grid grid-cols-[repeat(7,minmax(0,1fr))_64px] items-center rounded-control py-1 ${
                active ? 'bg-primary-surface text-primary ring-1 ring-primary-border-strong'
                  : made ? 'bg-surface-subtle' : 'hover:bg-muted'
              }`}
            >
              {days.map((d) => (
                <span
                  key={d.getTime()}
                  className={`font-number text-sub py-1 text-center ${
                    d.getMonth() + 1 === view.m ? '' : 'text-fg-disabled'
                  }`}
                >
                  {d.getDate()}
                </span>
              ))}
              <span className="text-sub-sm pr-1 text-right text-muted-foreground">
                {made ? '作成済み' : start === thisWeek ? '今週' : ''}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-sub min-w-0 flex-1 text-muted-foreground">
          {picked ? `${formatWeekRangeJa(picked)} の週を作成します` : '作成する週を選んでください'}
        </span>
        <Button
          size="sm"
          className="shrink-0"
          disabled={!picked || creating}
          onClick={() => picked && onCreate(picked)}
        >
          {creating
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Plus className="mr-1 h-4 w-4" aria-hidden="true" />}
          作成
        </Button>
      </div>
    </div>
  );
}
