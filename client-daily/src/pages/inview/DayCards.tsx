/**
 * 内覧会 開催日の一覧 — スマホ版カード（v4 ネイティブUI監査 2026-08-20 で追加）
 *
 * ── 行を縮めたものではありません ────────────────────────────
 *
 * PC の `DayRow`（`../InviewPage.tsx`）は `Row`/`RowSlot(hideOnMobile)` で
 * 組数・来場予定・受付の3列を落とすだけの表縮小で、スマホ専用のカード型
 * レイアウトになっていなかった（`docs/v4-native-ui-audit-2026-08-20.md` 指摘）。
 * `production/pages/holds/HoldCards.tsx` / `sales/pages/projectList/ProjectCards.tsx`
 * と同じ考え方で、**列を消すのではなくカードとして組み直す**:
 *
 *   1行目  開催日（＋「今日」「終了」バッジ）
 *   2行目  その日にある回（時間・対象・人数）
 *   3行目  組数 ・ 来場予定 ・ 受付状況（PC の `DayRow` が hideOnMobile で
 *          落としていた3列。**外で受付する人にこそ要る数字**なのでスマホでも出す）
 *
 * ── 押せる面 ────────────────────────────────────────────────
 *
 * `DayRow` と同じく行ぜんぶを1つの `<Link>` にする（押せる面を広くする）。
 */
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { UNDATED, formatDayTitle } from './logic';
import type { DayGroup } from '../InviewPage';

export function DayCards({ days, today }: { days: DayGroup[]; today: string }) {
  return (
    <ul className="v4-card-in flex flex-col gap-2">
      {days.map((g) => {
        const isToday = g.key === today;
        const isPast = !!g.date && g.date < today;
        return (
          <li key={g.key}>
            <Link
              to={`/inview/${g.key}`}
              className="rounded-card flex w-full items-start gap-2.5 border border-border bg-card p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-list font-bold">
                    {g.key === UNDATED ? '日付未定の回' : formatDayTitle(g.key)}
                  </span>
                  {isToday ? (
                    <TableBadge label="今日" w={null} className="shrink-0 bg-primary text-primary-foreground" />
                  ) : isPast ? (
                    <TableBadge label="終了" w={null} className="shrink-0 bg-muted text-muted-foreground" />
                  ) : null}
                </span>

                <span className="text-note mt-0.5 block text-muted-foreground">
                  {g.sessions
                    .map((s) => [s.time, s.audience, `${s.head}名`].filter(Boolean).join(' '))
                    .join(' ／ ')}
                </span>

                {/* PC の DayRow が hideOnMobile で落としていた3列。カードでは出す */}
                <span className="mt-1.5 flex items-baseline gap-3 border-t border-border-faint pt-1.5 font-number text-sub">
                  <span className="text-muted-foreground">{g.regs}組</span>
                  <span className="text-muted-foreground">{g.head}名</span>
                  <span className={g.checkedIn > 0 ? 'text-success' : 'text-muted-foreground'}>
                    受付 {g.checkedIn} / {g.head}名
                  </span>
                </span>
              </span>

              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
