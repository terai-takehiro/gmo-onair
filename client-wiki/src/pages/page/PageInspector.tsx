/**
 * ページの右パネル（§6-②）— 情報・目次・履歴・コメント
 *
 * 設計書のタブ4つがそろいました（段F でコメントを足した）。**履歴はここでは
 * 版の一覧だけ**で、2つの版の違いは画面 ⑥（`/p/:id/history`・PC）へ送ります —
 * 差分は横に2列並べて読むもので、320px の中では読めないためです。
 *
 * ⚠️ **右パネルは開閉式で、既定は閉じ**（`PageViewPage`）。閉じている間は
 * 目次・情報・コメントを本文の下に続けるので、どの状態でも辿り着けます。
 * 画面の中に2本目のナビの列を作らない、というご指摘への対応の一部です。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import { extractHeadings } from '@gmo-onair/shared/src/wiki/markdown';
import { useWikiVersions } from '@/lib/wikiApi';
import { bodyForDisplay } from '@/lib/wikiBody';
import WikiToc from '@/components/wiki/WikiToc';
import CommentPanel from '@/components/comment/CommentPanel';
import { openThreadCount, useWikiComments } from '@/components/page/commentApi';
import { cn } from '@/lib/utils';
import PageInfoPanel from './PageInfoPanel';
import PageVersionList from './PageVersionList';

type Tab = 'info' | 'toc' | 'history' | 'comments';

export default function PageInspector({ page }: { page: WikiPage }) {
  const [tab, setTab] = useState<Tab>('info');
  // 履歴タブを開いたときだけ読む（ページを開くたびに版を全部取らない）
  const versionsQ = useWikiVersions(page.id, { enabled: tab === 'history' });
  /*
   * コメントは**タブを開く前から**数える（タブに件数を出すため）。
   * 本文の下のコメント（`PageViewPage`）と**同じ鍵**なので、取りに行くのは1回です。
   * 数字は「解決していないやり取り」の数 — 一覧が既定で隠す解決済みを数に入れると、
   * 開いた人には「2件と書いてあるのに1件しかない」と見えます。
   */
  const commentsQ = useWikiComments(page.id);
  // 本文と同じ文字列から作る（`bodyForDisplay` の注記）
  const body = bodyForDisplay(page.body_md, page.title);
  const headingCount = extractHeadings(body).length;

  const tabs: Array<{ key: Tab; label: string; n?: number }> = [
    { key: 'info', label: '情報' },
    { key: 'toc', label: '目次', n: headingCount },
    { key: 'history', label: '履歴', n: page.rev },
    { key: 'comments', label: 'コメント', n: openThreadCount(commentsQ.data) },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[46px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-sub',
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
        {tab === 'comments' && <CommentPanel pageId={page.id} />}
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
