// 計時・視聴者（liveops）の運用画面が共通して使う「ハブへ戻る」リンク。
// `client-live/src/components/layout/AppShell.tsx` のパンくずに相当（このステージでは
// 共通シェルの外に置いた素の画面なので、各画面が自分でヘッダーを持つ）。
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
      className="mb-3 flex h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:bg-muted"
    >
      <ChevronLeft className="h-5 w-5" />
      <span className="truncate">{owner.name}</span>
    </a>
  );
}
