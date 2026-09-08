// 制作技術支援トップ — 「続きから」（端末の閲覧履歴。横スクロールのカード列）。
// `search`/`segment`・アーカイブとは無関係に出すが、**この一覧に出ない項目は出さない**
// （工事・構築のプロジェクト・失注が履歴にだけ残るため。絞るのは `eligibleRecents`）。
import { Building2, Sparkles } from 'lucide-react';
import { recentEntryHref } from './topHelpers';
import type { RecentTopEntry } from '@/lib/recentTop';

function RecentCard({ entry, onNavigate }: { entry: RecentTopEntry; onNavigate: (href: string) => void }) {
  const Icon = entry.kind === 'project' ? Building2 : Sparkles;
  return (
    <button
      type="button"
      onClick={() => onNavigate(recentEntryHref(entry))}
      className="min-h-tap flex w-[200px] shrink-0 snap-start items-center gap-2 rounded-card border border-border bg-card px-3.5 py-3 text-left hover:bg-muted/50 active:bg-muted"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-list block min-w-0 flex-1 truncate font-bold">{entry.name}</span>
    </button>
  );
}

export function RecentSection({
  entries, onNavigate,
}: {
  entries: RecentTopEntry[];
  onNavigate: (href: string) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sub-sm font-bold tracking-wide text-muted-foreground">最近開いた項目</h2>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1">
        {entries.map((entry) => (
          <RecentCard key={`${entry.kind}-${entry.id}`} entry={entry} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}
