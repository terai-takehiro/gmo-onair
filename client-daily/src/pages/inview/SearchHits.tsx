/**
 * 内覧会 開催日の一覧 — **回をまたいだ検索の結果**（`InviewPage` から切り出し）
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `InviewPage.tsx` が 400 行（このリポジトリの1ファイルの上限）を超えたため、
 * **役割で分けた**もの。ここは「一覧を絞り込む」のではなく
 * **受付で目の前の人を探す**ための別の見せ方（当たった人ごとに、その日の
 * 受付ページへの入口を付ける）なので、一覧のとりまとめから独立させた。
 * **JSX は1文字も変えずに移してある**。
 */
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { NoSearchResults } from '@gmo-onair/shared/src/client/states';
import type { InviewRegistration } from '@/lib/types';
import { AttendeeCard } from './AttendeeCard';
import { dayKey, formatDayTitle } from './logic';

/** 回をまたいだ検索の結果。**当たった人ごとに、その日の受付ページへの入口**を付ける */
export function SearchHits({
  query, hits, canEdit, onEdit, onClear,
}: {
  query: string;
  hits: Array<{ r: InviewRegistration; matchedIn: string[] }>;
  canEdit: boolean;
  onEdit: (r: InviewRegistration) => void;
  onClear: () => void;
}) {
  if (hits.length === 0) {
    return <NoSearchResults keyword={query} onClearFilters={onClear} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sub text-muted-foreground">
        「{query}」に当てはまる来場予約 <span className="font-number font-bold text-foreground">{hits.length}</span> 件
      </p>
      {hits.map(({ r, matchedIn }) => (
        <div key={r.id} className="flex flex-col gap-1">
          <Link
            to={`/inview/${dayKey(r)}`}
            className="text-sub-sm inline-flex items-center gap-1 font-bold text-primary hover:underline"
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {r.session_date ? formatDayTitle(r.session_date) : '日付未定の回'}
            {r.session_time ? ` ${r.session_time}` : ''}
            の受付ページを開く
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <AttendeeCard r={r} canEdit={canEdit} onEdit={() => onEdit(r)} matchedIn={matchedIn} />
        </div>
      ))}
    </div>
  );
}
