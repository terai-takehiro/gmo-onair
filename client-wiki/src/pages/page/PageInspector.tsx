/**
 * ページの右パネル（§6-②）— 情報・目次・履歴
 *
 * 設計書のタブは4つ（情報・目次・履歴・コメント）だが、**コメントは段F**
 * （§9）なのでまだ出さない。読み込めないタブを並べても、押した人には
 * 壊れているようにしか見えない。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import { extractHeadings } from '@gmo-onair/shared/src/wiki/markdown';
import { useWikiVersions } from '@/lib/wikiApi';
import { bodyForDisplay } from '@/lib/wikiBody';
import WikiToc from '@/components/wiki/WikiToc';
import { cn } from '@/lib/utils';
import PageInfoPanel from './PageInfoPanel';
import PageVersionList from './PageVersionList';

type Tab = 'info' | 'toc' | 'history';

export default function PageInspector({ page }: { page: WikiPage }) {
  const [tab, setTab] = useState<Tab>('info');
  // 履歴タブを開いたときだけ読む（ページを開くたびに版を全部取らない）
  const versionsQ = useWikiVersions(page.id, { enabled: tab === 'history' });
  // 本文と同じ文字列から作る（`bodyForDisplay` の注記）
  const body = bodyForDisplay(page.body_md, page.title);
  const headingCount = extractHeadings(body).length;

  const tabs: Array<{ key: Tab; label: string; n?: number }> = [
    { key: 'info', label: '情報' },
    { key: 'toc', label: '目次', n: headingCount },
    { key: 'history', label: '履歴', n: page.rev },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[46px] shrink-0 items-center gap-0.5 border-b border-border px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sub',
              tab === t.key ? 'bg-primary-surface-weak text-primary' : 'text-secondary-foreground hover:bg-muted',
            )}
          >
            {t.label}
            {t.n ? <span className="text-sub-sm text-muted-foreground">{t.n}</span> : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        {tab === 'info' && <PageInfoPanel page={page} />}
        {tab === 'toc' && <WikiToc body={body} />}
        {tab === 'history' && (
          <>
            <PageVersionList
              versions={versionsQ.data}
              loading={versionsQ.isLoading}
              error={versionsQ.error}
              onRetry={() => void versionsQ.refetch()}
            />
            <Link
              to={`/p/${page.id}/history`}
              className="mt-3 flex h-9 items-center justify-center rounded-control border border-border text-sub text-primary no-underline hover:bg-muted"
            >
              2つの版の違いを見る
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
