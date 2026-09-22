/**
 * スペースのツリー `/wiki/s/:key`
 *
 * ホームのタイルと左メニューのスペースから来る画面（§6-①「押すとそのスペースの
 * 目次」）。中央は**直下のページの一覧**で、ページを1本選ぶと ② に移る。
 *
 * ツリーはページ②と同じく**共通の左メニューの中**に出す（画面の中に2本目のナビの
 * 列を作らない。2026-09-22 のご指摘「サイドタブが増えすぎて窮屈」）。
 */
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { Delayed, EmptyState, ErrorPanel, NotFoundPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Row, RowMain, RowSlot, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { FileText, Table2 } from 'lucide-react';
import { useWikiSpace, useWikiTree } from '@/lib/wikiApi';
import { useSideMenuTopSlot } from '@gmo-onair/shared/src/client/shell/sideMenuSlot';
import WikiSpaceTreePanel from '@/components/layout/WikiSpaceTreePanel';

export default function SpacePage() {
  const { key } = useParams<{ key: string }>();
  // **フックは早期 return より前に置く**（返る枝が増えるとフックの数が変わって落ちる）
  const sideMenuTopSlot = useSideMenuTopSlot();
  // スペースもツリーも **key で引く**（サーバーの道が key で切ってある）
  const spaceQ = useWikiSpace(key);
  const space = spaceQ.data;
  const treeQ = useWikiTree(key);

  if (spaceQ.isLoading) {
    return (
      <div className="p-4 lg:p-6">
        <Delayed><SkeletonRows rows={6} rowHeight={40} /></Delayed>
      </div>
    );
  }
  if (spaceQ.isError || !space) {
    // 読めないスペースも 404 で返る（§8「読めない人には存在ごと見えない」）ので、
    // 「無い」と断定しない案内にする
    return (
      <div className="flex h-full items-center justify-center p-4">
        <NotFoundPanel path={`/wiki/s/${key ?? ''}`} />
      </div>
    );
  }

  const roots = (treeQ.data ?? []).filter((n) => !n.parent_id);

  return (
    <div className="flex h-full min-h-0">
      {/*
        ツリーは共通の左メニューの上に差し込む（`sideMenuSlot.ts`）。画面の中に
        2本目のナビの列を作らない（2026-09-22 のご指摘「サイドタブが増えすぎて窮屈」）
      */}
      {sideMenuTopSlot
        && createPortal(
          <WikiSpaceTreePanel
            spaceKey={space.key}
            spaceName={space.name}
            nodes={treeQ.data}
            loading={treeQ.isLoading}
          />,
          sideMenuTopSlot,
        )}

      <main className="min-w-0 flex-1 overflow-y-auto bg-card px-4 py-6 lg:px-10">
        <div className="mx-auto w-full max-w-[860px]">
          <h1 className="text-h1 text-foreground">{space.name}</h1>
          {space.description && <p className="mt-1.5 text-sub text-muted-foreground">{space.description}</p>}

          <h2 className="mb-2 mt-6 text-cardtitle text-foreground">このスペースのページ</h2>
          {treeQ.isError ? (
            <ErrorPanel title="ページの一覧を読み込めませんでした" error={treeQ.error} onRetry={() => void treeQ.refetch()} />
          ) : treeQ.isLoading ? (
            <Delayed><SkeletonRows rows={6} rowHeight={44} /></Delayed>
          ) : roots.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title="まだページがありません"
              description="このスペースにページを作成すると、ここに出ます。"
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border">
              {roots.map((n) => (
                <Link key={n.id} to={`/p/${n.id}`} className="block no-underline">
                  <Row divider interactive>
                    <RowMain>
                      <RowTitle>{n.title}</RowTitle>
                    </RowMain>
                    <RowSlot w={96} align="right" placeholder="">
                      {n.kind === 'database' ? (
                        <span className="flex items-center gap-1 text-sub-sm text-muted-foreground">
                          <Table2 className="h-3.5 w-3.5" aria-hidden />
                          データベース
                        </span>
                      ) : n.status === 'draft' ? (
                        <span className="text-sub-sm text-warning">下書き</span>
                      ) : null}
                    </RowSlot>
                  </Row>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
