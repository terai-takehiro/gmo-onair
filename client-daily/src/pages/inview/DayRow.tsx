/**
 * 内覧会 開催日の一覧 — **PC の1行**（`InviewPage` から切り出し）
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `InviewPage.tsx` が 400 行（このリポジトリの1ファイルの上限）を超えたため、
 * **役割で分けた**もの。この画面は
 *   ①一覧のとりまとめ（絞り込み・検索・日ごとの集計）＝ `InviewPage.tsx`
 *   ②PC の行の見た目（このファイル）
 *   ③スマホのカード（`DayCards.tsx`）
 *   ④検索の当たり（`SearchHits.tsx`）
 * の4つでできているので、②を独立させた。
 * **JSX は1文字も変えずに移してある**（見た目・並びは以前のまま）。
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { UNDATED, formatDayTitle } from './logic';
import type { DayGroup } from '../InviewPage';

/**
 * 開催日1行 (PC専用)。**押すとその日の受付ページ**へ行く (この行では受付できない)
 *
 * スマホは `./DayCards.tsx` の `DayCards`（カード型）に差し替え済み
 * (v4 ネイティブUI監査 2026-08-20)。この行は 1024px 以上でだけ描かれるので、
 * `hideOnMobile` / `RowSub` の畳みは不要 (画面の出し分けは `InviewPage` の `isMobile` 分岐)。
 */
export function DayRow({ g, today }: { g: DayGroup; today: string }) {
  const isToday = g.key === today;
  const isPast = !!g.date && g.date < today;
  return (
    <Row divider interactive align="start" className="p-0">
      <Link
        to={`/inview/${g.key}`}
        className="flex min-h-[46px] w-full items-start gap-3 px-4 py-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RowMain>
          <RowTitle>{g.key === UNDATED ? '日付未定の回' : formatDayTitle(g.key)}</RowTitle>
          <RowSub>
            {g.sessions
              .map((s) => [s.time, s.audience, `${s.head}名`].filter(Boolean).join(' '))
              .join(' ／ ')}
          </RowSub>
        </RowMain>

        <RowSlot w={72} placeholder="">
          {isToday ? <TableBadge label="今日" w={null} className="bg-primary text-primary-foreground" />
            : isPast ? <TableBadge label="終了" w={null} className="bg-muted text-muted-foreground" />
              : null}
        </RowSlot>

        <RowSlot w={72} align="right">
          <span className="font-number text-sub">{g.regs}組</span>
        </RowSlot>

        <RowSlot w={72} align="right">
          <span className="font-number text-sub">{g.head}名</span>
        </RowSlot>

        <RowSlot w={96} align="right">
          <span className={`font-number text-sub ${g.checkedIn > 0 ? 'text-success' : 'text-muted-foreground'}`}>
            {g.checkedIn} / {g.head}名
          </span>
        </RowSlot>

        <RowSlot w={56} align="right" placeholder="">
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </RowSlot>
      </Link>
    </Row>
  );
}
