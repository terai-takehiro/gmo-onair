/**
 * ⑥ 履歴 `/wiki/p/:id/history`（§6-⑥・**PC の画面**）
 *
 * 左＝版の一覧（版・日時・誰が・何を変えたか）／右＝2つの版の違い。
 * 既定では**いちばん新しい2つ**を比べる。版を押すと、選んでいる2つのうち
 * 古いほうを入れ替える（毎回2つ選び直さなくてよいように）。
 *
 * 「この版に戻す」は**書き込み**なので段B。ここには置かない。
 */
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { useWikiPage, useWikiVersion, useWikiVersions } from '@/lib/wikiApi';
import PageVersionList from '../page/PageVersionList';
import VersionDiff from './VersionDiff';

export default function HistoryPage() {
  const { id } = useParams<{ id: string }>();
  const pageQ = useWikiPage(id);
  const versionsQ = useWikiVersions(id);
  const [pickedOld, setPickedOld] = useState<number | null>(null);

  // サーバーは新しい順で返す前提だが、順番に頼らず自分で並べ替える
  const sorted = useMemo(
    () => [...(versionsQ.data ?? [])].sort((a, b) => b.rev - a.rev),
    [versionsQ.data],
  );
  const newerRev = sorted[0]?.rev ?? null;
  const olderRev = pickedOld ?? sorted[1]?.rev ?? null;

  const olderQ = useWikiVersion(id, olderRev);
  const newerQ = useWikiVersion(id, newerRev);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4 lg:px-6">
        <Button asChild variant="ghost" size="icon-sm" aria-label="ページに戻る">
          <Link to={`/p/${id}`}><ArrowLeft className="h-4 w-4" aria-hidden /></Link>
        </Button>
        <span className="min-w-0 flex-1 truncate text-list text-foreground">
          {pageQ.data?.title ?? 'ページ'} の履歴
        </span>
        <span className="hidden text-sub text-muted-foreground lg:inline">
          「この版に戻す」は新しい版として保存します。履歴は消えません。
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-[320px] shrink-0 overflow-y-auto border-r border-border px-2 py-2">
          <PageVersionList
            versions={sorted}
            loading={versionsQ.isLoading}
            error={versionsQ.error}
            onRetry={() => void versionsQ.refetch()}
            selected={[olderRev, newerRev].filter((n): n is number => n !== null)}
            onPick={(rev) => setPickedOld(rev === newerRev ? null : rev)}
          />
        </aside>
        <main className="min-w-0 flex-1">
          <VersionDiff
            older={olderQ.data}
            newer={newerQ.data}
            loading={olderQ.isLoading || newerQ.isLoading || versionsQ.isLoading}
            error={olderQ.error ?? newerQ.error}
            onRetry={() => {
              void olderQ.refetch();
              void newerQ.refetch();
            }}
          />
        </main>
      </div>
    </div>
  );
}
