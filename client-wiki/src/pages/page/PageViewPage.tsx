/**
 * ② ページ `/wiki/p/:id`（docs/design/v4/wiki.md §6-②）
 *
 * PC は3列（左＝ツリー／中央＝本文／右＝情報・目次・履歴）。
 * スマホは**1画面1目的＝読む**（§6-⑧）ので、ツリーは左上のボタンから下シート、
 * 情報と目次は本文の下に続ける。
 *
 * ⚠️ `useIsMobile()` で早い段階で `return` しない（幅が変わるとフックの数が変わって
 *    落ちる）。列の出し分けは CSS（`hidden lg:flex`）でやる。
 *
 * ⚠️ ここは `PageShell` を使っていない。3列を画面の端まで使う画面で、
 *    `PageShell` の余白を入れるとモック（`Page.dc.html`）の寸法と合わなくなるため。
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Delayed, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { useRecordView, useWikiPage, useWikiTree } from '@/lib/wikiApi';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import WikiTree from '@/components/wiki/WikiTree';
import WikiToc from '@/components/wiki/WikiToc';
import PageHeaderBar from './PageHeaderBar';
import PageInfoPanel from './PageInfoPanel';
import PageInspector from './PageInspector';

export default function PageViewPage() {
  const { id } = useParams<{ id: string }>();
  const [treeOpen, setTreeOpen] = useState(false);

  const pageQ = useWikiPage(id);
  const page = pageQ.data;
  // ツリーは**スペースの key** で取る（サーバーの道が key で切ってある）
  const treeQ = useWikiTree(page?.space_key);
  // 「よく読まれるページ」と、AI の出典が開かれた率（§7-3 条件3）の材料になる
  useRecordView(id);

  if (pageQ.isError) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <ErrorPanel
          title="ページを読み込めませんでした"
          error={pageQ.error}
          onRetry={() => void pageQ.refetch()}
        />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="p-4 lg:p-6">
        <Delayed>
          <SkeletonRows rows={8} rowHeight={28} />
        </Delayed>
      </div>
    );
  }

  const tree = (
    <WikiTree nodes={treeQ.data} loading={treeQ.isLoading} currentId={page.id} />
  );

  return (
    <div className="flex h-full min-h-0">
      {/* 左＝ツリー（PC） */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-border px-3">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-badge-xs bg-primary"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-list text-foreground">{page.space_name}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{tree}</div>
      </aside>

      {/* 中央＝本文 */}
      <main className="flex min-w-0 flex-1 flex-col bg-card">
        <PageHeaderBar page={page} onOpenTree={() => setTreeOpen(true)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-10">
          <div className="mx-auto w-full max-w-[860px]">
            <h1 className="text-h1 text-foreground">{page.title}</h1>
            <p className="mb-4 mt-1.5 text-sub text-muted-foreground">
              {page.owner_name ? `担当: ${page.owner_name}` : '担当なし'}
              {page.review_by && ` ・ 見直し期限 ${page.review_by.replace(/-/g, '/')}`}
            </p>

            <WikiMarkdown body={page.body_md} />

            {/* スマホでは右パネルを本文の下に続ける（列を作れないので縦に積む） */}
            <div className="mt-8 flex flex-col gap-6 border-t border-border pt-6 xl:hidden">
              <section>
                <h2 className="mb-2 text-cardtitle text-foreground">目次</h2>
                <WikiToc body={page.body_md} />
              </section>
              <section>
                <h2 className="mb-2 text-cardtitle text-foreground">情報</h2>
                <PageInfoPanel page={page} />
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* 右＝情報・目次・履歴（PC） */}
      <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card xl:flex">
        <PageInspector page={page} />
      </aside>

      <Sheet
        open={treeOpen}
        onOpenChange={setTreeOpen}
        title={page.space_name ?? 'ページの一覧'}
        sub="このスペースのページ"
      >
        {tree}
      </Sheet>
    </div>
  );
}
