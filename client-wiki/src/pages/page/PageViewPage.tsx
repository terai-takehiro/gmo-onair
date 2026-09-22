/**
 * ② ページ `/wiki/p/:id`（docs/design/v4/wiki.md §6-②）
 *
 * ── 列の持ち方（2026-09-22 に作り直した）──────────────────────
 *
 * 最初は「共通の左メニュー ＋ Wiki のツリー ＋ 本文 ＋ 情報」の**4列**だった。
 * 1440px で本文に残るのは 608px しかなく、利用者から「サイドタブが増えすぎて
 * すごく窮屈」とご指摘をいただいた。2つ直した:
 *
 *  1. **ツリーを共通の左メニューの中へ移した**（`WikiSpaceTreePanel`）。ナビの列が
 *     1本になり、共通メニューの「スペース」一覧とツリーの見出しで**同じものを2回
 *     出していた**のも解消した
 *  2. **右の情報パネルを開閉式にし、既定を閉じにした**。閉じている間は目次と情報を
 *     本文の下に続ける（読むのに要る情報ではないので、既定では本文に幅を譲る）
 *
 * 結果、1440px の本文は 608px → **860px**（最大幅）になる。
 *
 * スマホは**1画面1目的＝読む**（§6-⑧）。ツリーは上辺バーの `☰`（共通メニューの
 * 引き出し）から開く — **画面の中にもう1つ `☰` を置かない**。
 *
 * ⚠️ `useIsMobile()` で早い段階で `return` しない（幅が変わるとフックの数が変わって
 *    落ちる）。列の出し分けは CSS（`hidden xl:flex`）でやる。
 *
 * ⚠️ ここは `PageShell` を使っていない。列を画面の端まで使う画面で、
 *    `PageShell` の余白を入れるとモック（`Page.dc.html`）の寸法と合わなくなるため。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { Delayed, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useSideMenuTopSlot } from '@gmo-onair/shared/src/client/shell/sideMenuSlot';
import { useRecordView, useWikiPage, useWikiTree } from '@/lib/wikiApi';
import { bodyForDisplay } from '@/lib/wikiBody';
import WikiMarkdown from '@/components/wiki/WikiMarkdown';
import WikiToc from '@/components/wiki/WikiToc';
import WikiSpaceTreePanel from '@/components/layout/WikiSpaceTreePanel';
import PageHeaderBar from './PageHeaderBar';
import PageInfoPanel from './PageInfoPanel';
import PageInspector from './PageInspector';

/** 情報パネルを開いているか。端末の中だけに覚える（他の端末には持って行かない） */
const INFO_OPEN_KEY = 'gmo_onair_wiki_info_open';

function readInfoOpen(): boolean {
  try {
    return localStorage.getItem(INFO_OPEN_KEY) === '1';
  } catch {
    // 個人用ウィンドウ・保存を止めている端末では読めない。既定（閉じ）で描く
    return false;
  }
}

export default function PageViewPage() {
  const { id } = useParams<{ id: string }>();
  const sideMenuTopSlot = useSideMenuTopSlot();
  const [infoOpen, setInfoOpen] = useState(readInfoOpen);

  useEffect(() => {
    try {
      localStorage.setItem(INFO_OPEN_KEY, infoOpen ? '1' : '0');
    } catch {
      // 保存できなくても画面は動く
    }
  }, [infoOpen]);

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

  // 題は上に大きく出すので、本文の先頭が同じ題ならそこだけ描かない。
  // **目次も同じ文字列から作る**（別々に作ると見出しの id と目次のリンク先がずれる）
  const body = bodyForDisplay(page.body_md, page.title);

  return (
    <div className="flex h-full min-h-0">
      {/*
        ツリーは共通の左メニューの上に差し込む（`sideMenuSlot.ts`。予定の
        ミニカレンダーと同じやり方）。差し込み口がまだ無い（シェルの外・初回描画）
        ときは何も描かない
      */}
      {sideMenuTopSlot
        && page.space_key
        && createPortal(
          <WikiSpaceTreePanel
            spaceKey={page.space_key}
            spaceName={page.space_name ?? ''}
            nodes={treeQ.data}
            loading={treeQ.isLoading}
            currentId={page.id}
          />,
          sideMenuTopSlot,
        )}

      {/* 中央＝本文 */}
      <main className="flex min-w-0 flex-1 flex-col bg-card">
        <PageHeaderBar page={page} infoOpen={infoOpen} onToggleInfo={() => setInfoOpen((v) => !v)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-10">
          <div className="mx-auto w-full max-w-[860px]">
            <h1 className="text-h1 text-foreground">{page.title}</h1>
            <p className="mb-4 mt-1.5 text-sub text-muted-foreground">
              {page.owner_name ? `担当: ${page.owner_name}` : '担当なし'}
              {page.review_by && ` ・ 見直し予定 ${page.review_by.replace(/-/g, '/')}`}
            </p>

            <WikiMarkdown body={body} />

            {/*
              目次と情報は、右パネルを閉じている間（既定）と、そもそも右パネルを
              出せない幅では本文の下に続ける。**どちらか一方だけが必ず出る**ので、
              情報に辿り着けない状態は作らない
            */}
            <div
              className={
                infoOpen
                  ? 'mt-8 flex flex-col gap-6 border-t border-border pt-6 xl:hidden'
                  : 'mt-8 flex flex-col gap-6 border-t border-border pt-6'
              }
            >
              <section>
                <h2 className="mb-2 text-cardtitle text-foreground">目次</h2>
                <WikiToc body={body} />
              </section>
              <section>
                <h2 className="mb-2 text-cardtitle text-foreground">情報</h2>
                <PageInfoPanel page={page} />
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* 右＝情報・目次・履歴（PC で、開いているときだけ） */}
      {infoOpen && (
        <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card xl:flex">
          <PageInspector page={page} />
        </aside>
      )}
    </div>
  );
}
