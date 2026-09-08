// 制作技術支援トップ — 本体の一覧（案件・番組の行）と、アーカイブへの導線行。
//
// **行には必ず本番日（イベント・放送の日）を出す**（2026-09-08 のご指示）。
// 並びは `sortMainList()` の放送順なので、日付が出ていないと「なぜこの順なのか」が
// 画面から読めない。日付を持たないものは「日程未定」とはっきり書く（黙って
// 末尾に置くと、終わったものが残っているのか未定なのか区別が付かない）。
import { ChevronRight, Archive } from 'lucide-react';
import { formatDateJp, countdownLabel } from '@/lib/dateFmt';
import { topItemMeta, topItemHref, topItemSchedule } from './topHelpers';
import type { TopItem } from '@/lib/topApi';

/** 行の右に置く本番日。判断（いつなのか）は `topItemSchedule` が持ち、ここは見せ方だけ */
function ScheduleCell({ item }: { item: TopItem }) {
  const schedule = topItemSchedule(item);
  if (schedule.kind === 'none') {
    return <span className="text-sub-sm w-[96px] shrink-0 text-right text-muted-foreground">日程未定</span>;
  }
  const note = schedule.kind === 'ongoing' ? '開催中'
    : schedule.kind === 'done' ? '終了'
      : countdownLabel(schedule.date);
  return (
    <span className="flex w-[96px] shrink-0 flex-col items-end">
      {/* 開催中（複数日イベントの途中）は最終日を出す。下の「開催中」と合わせて読む */}
      <span className="text-sub-sm font-bold tabular-nums">{formatDateJp(schedule.date)}</span>
      {note && <span className="text-note text-muted-foreground">{note}</span>}
    </span>
  );
}

/** 案件・番組いずれか1件の行 */
export function TopItemRow({
  item, onNavigate,
}: {
  item: TopItem;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(topItemHref(item))}
      className="flex min-h-[52px] items-center gap-3 border-b border-border-faint px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/50 active:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="text-list block truncate font-bold">{item.name}</span>
        <span className="text-sub-sm block truncate text-muted-foreground">{topItemMeta(item)}</span>
      </span>
      <ScheduleCell item={item} />
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** 本体一覧の末尾に付ける「アーカイブ」への導線（件数は search 無視の unconditional 件数） */
export function ArchiveFooterRow({ count, onOpenArchive }: { count: number; onOpenArchive: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenArchive}
      className="flex min-h-[52px] items-center gap-3 border-b border-border-faint px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/50 active:bg-muted"
    >
      <Archive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-list min-w-0 flex-1 truncate font-bold text-muted-foreground">
        アーカイブ（終了した番組・イベント）
      </span>
      <span className="text-sub-sm shrink-0 text-muted-foreground">{count}件</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** さがしても本体に無いとき、アーカイブ側に見つかったことを知らせる行 */
export function ArchiveSearchHintRow({ count, onOpenArchive }: { count: number; onOpenArchive: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenArchive}
      className="flex min-h-[52px] items-center gap-3 rounded-card border border-border px-4 py-2.5 text-left hover:bg-muted/50 active:bg-muted"
    >
      <Archive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-list min-w-0 flex-1 truncate font-bold">
        アーカイブに {count}件みつかりました
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
