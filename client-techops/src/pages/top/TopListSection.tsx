// 制作技術支援トップ — 本体の一覧（案件・番組の行）と、アーカイブへの導線行。
import { ChevronRight, Archive } from 'lucide-react';
import { formatDateJp } from '@/lib/dateFmt';
import { topItemMeta, topItemHref } from './topHelpers';
import type { TopItem } from '@/lib/topApi';

/** 案件・番組いずれか1件の行。アーカイブ一覧では `last_date` を添える */
export function TopItemRow({
  item, onNavigate, showLastDate = false,
}: {
  item: TopItem;
  onNavigate: (href: string) => void;
  showLastDate?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(topItemHref(item))}
      className="flex min-h-[52px] items-center gap-3 border-b border-border-faint px-4 py-2.5 text-left last:border-b-0 hover:bg-muted/50 active:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="text-list block truncate font-bold">{item.name}</span>
        <span className="text-sub-sm block text-muted-foreground">
          {topItemMeta(item)}
          {showLastDate && item.last_date ? ` ・ ${formatDateJp(item.last_date)}` : ''}
        </span>
      </span>
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
