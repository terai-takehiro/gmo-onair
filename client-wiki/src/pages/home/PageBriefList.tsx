/**
 * ページの一覧（最近更新・お気に入り）。
 * 0件・読み込み中・失敗の3つを**区画の中だけ**で受ける — 1つの問い合わせが
 * 落ちてもホーム全体が白紙にならないようにするため。
 */
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Row, RowMain, RowSlot, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import type { WikiPageBrief } from '@/lib/wikiApi';
import PageBriefRow from '@/components/wiki/PageBriefRow';

export interface PageBriefListProps {
  pages: WikiPageBrief[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  errorTitle: string;
  emptyTitle: string;
  emptyDescription: string;
  /** 狭い区画（お気に入り）では題とスペースだけにする */
  compact?: boolean;
}

export default function PageBriefList({
  pages,
  loading,
  error,
  onRetry,
  errorTitle,
  emptyTitle,
  emptyDescription,
  compact,
}: PageBriefListProps) {
  if (error) {
    return <ErrorPanel className="p-4" title={errorTitle} error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return (
      <Delayed>
        <SkeletonRows rows={5} rowHeight={46} />
      </Delayed>
    );
  }
  if (!pages || pages.length === 0) {
    return <EmptyState className="py-8" icon={<FileText />} title={emptyTitle} description={emptyDescription} />;
  }

  if (compact) {
    return (
      <div>
        {pages.map((p) => (
          <Link key={p.id} to={`/p/${p.id}`} className="block no-underline">
            <Row divider interactive>
              <RowMain>
                <RowTitle>{p.title}</RowTitle>
              </RowMain>
              <RowSlot w={96} align="right">
                <span className="truncate text-sub-sm text-muted-foreground">{p.space_name}</span>
              </RowSlot>
            </Row>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div>
      {pages.map((p) => (
        <PageBriefRow key={p.id} page={p} />
      ))}
    </div>
  );
}
