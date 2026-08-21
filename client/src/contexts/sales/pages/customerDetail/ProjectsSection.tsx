/**
 * お客様の詳細（顧客360）— 「案件」節 (v4)
 */
import { FolderKanban } from 'lucide-react';
import { CustomerProjectRows } from './CustomerProjectRows';
import { CustomerProjectCards } from './CustomerProjectCards';
import type { CustomerProject } from './types';

export function ProjectsSection({
  items, mobile, onOpen,
}: {
  items: CustomerProject[];
  mobile: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" />
        案件（{items.length}）
      </h2>
      <div className="p-4">
        {items.length === 0 ? (
          <p className="text-sub text-muted-foreground">この顧客の案件はまだありません。</p>
        ) : mobile ? (
          <CustomerProjectCards items={items} onOpen={onOpen} />
        ) : (
          <CustomerProjectRows items={items} onOpen={onOpen} />
        )}
      </div>
    </section>
  );
}
