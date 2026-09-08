// 計時・視聴者（liveops）の運用画面が共通して使う「ハブへ戻る」リンク。
// `client-live/src/components/layout/AppShell.tsx` のパンくずに相当。
// ⚠️ **下の余白はここで持たない**（もとは `mb-3`）。置き先が `<PageShell>` の直下
// （縦の間隔は `gap-4 lg:gap-5`）か、`<PageHeader>` と同じ行の中なので、
// 自前の `mb-*` があると 1 行の中で上へずれ、隣の見出しと底がそろわない。
import { ChevronLeft } from 'lucide-react';

export interface BackToOwnerTarget {
  kind: 'project' | 'program';
  id: string;
  name: string;
}

export default function BackToOwner({ owner }: { owner: BackToOwnerTarget }) {
  return (
    <a
      href={owner.kind === 'project' ? `/techops/projects/${owner.id}` : `/techops/programs/${owner.id}`}
      className="flex h-11 w-fit items-center gap-1 rounded-control-lg px-2 text-list hover:bg-muted"
    >
      <ChevronLeft className="h-5 w-5" />
      <span className="truncate">{owner.name}</span>
    </a>
  );
}
