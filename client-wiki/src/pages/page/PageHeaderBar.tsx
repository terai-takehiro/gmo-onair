/**
 * ページの上の1行（パンくず・状態・更新・操作）
 *
 * 段A に出せる操作は「履歴」と「情報」の開閉だけだった。段B で「…」
 * （複製・テンプレートにする・`.md` で書き出す・一覧から隠す・削除）を足した。
 * お気に入りと「AI に聞く」は、まだ呼ぶ先が無いので置かない
 * （`components/page/PageActionsMenu.tsx` の冒頭に理由を書いてある）。
 *
 * ⚠️ **ここに `☰` を置かない。** ツリーは共通の左メニューの中にあり、スマホでは
 *    上辺バーの `☰`（引き出し）から開く。画面の中にもう1つ `☰` があると、
 *    同じものを開くボタンが横に2つ並ぶ（2026-09-22 に作り直した）。
 */
import { History, PanelRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import WikiStatusBadge from '@/components/wiki/WikiStatusBadge';
import PageActionsMenu from '@/components/page/PageActionsMenu';
import { revLabel, updatedLabel } from '@/lib/wikiFormat';

export default function PageHeaderBar({
  page,
  infoOpen,
  onToggleInfo,
}: {
  page: WikiPage;
  /** 右の情報パネルを開いているか（既定は閉じ。本文に幅を譲る） */
  infoOpen: boolean;
  onToggleInfo: () => void;
}) {
  const trail = [page.space_name, ...(page.breadcrumb ?? []).map((b) => b.title)].filter(Boolean);

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-3 lg:px-6">
      <span className="min-w-0 flex-auto truncate text-sub text-muted-foreground">
        {trail.map((t) => `${t} ／ `)}
        <span className="text-list text-foreground">{page.title}</span>
      </span>

      <WikiStatusBadge status={page.status} reviewBy={page.review_by} className="shrink-0" />

      <span className="hidden shrink-0 whitespace-nowrap text-sub-sm text-muted-foreground xl:inline">
        {updatedLabel(page.updated_at)} ・ {page.updater_name ?? '—'} ・ {revLabel(page.rev)}
      </span>

      <span className="flex-1" />

      {/*
        このページについて AI に聞く（設計 §6-② の右上・§6-⑤）。
        `?page=` を付けると、聞く画面が**そのページと子ページを先に読みます**。
        ⚠️ **下書きには出しません** — まだ人が確かめていない文を出典に答えると、
        「Wiki に書いてある」と読める回答が確かめる前の文から作られます（§7-5）。
        スマホでも出します（現場で読んでいて分からない、が一番多い場面のため）。
      */}
      {page.status === 'published' && (
        <Button asChild variant="outline" size="sm">
          <Link to={`/ask?page=${encodeURIComponent(page.id)}`}>
            <Sparkles className="mr-1.5 h-4 w-4 text-ai" aria-hidden />
            AI に聞く
          </Link>
        </Button>
      )}

      {/* 履歴は PC の画面（`pcOnlyScreens.ts`）。スマホでは出さない */}
      <Button asChild variant="outline" size="sm" className="hidden lg:inline-flex">
        <Link to={`/p/${page.id}/history`}>
          <History className="mr-1.5 h-4 w-4" aria-hidden />
          履歴
        </Link>
      </Button>

      {/*
        右の情報パネルの開閉。閉じている間は目次と情報が本文の下に出るので、
        どちらの状態でも情報に辿り着ける。パネルを出せる幅（xl 以上）でだけ見せる
      */}
      <Button
        variant={infoOpen ? 'secondary' : 'outline'}
        size="sm"
        aria-pressed={infoOpen}
        onClick={onToggleInfo}
        className="hidden xl:inline-flex"
      >
        <PanelRight className="mr-1.5 h-4 w-4" aria-hidden />
        情報
      </Button>

      {/* 複製・テンプレート・書き出し・一覧から隠す・削除。**スマホでも出す**
          （この5つは読む画面からしか辿れない） */}
      <PageActionsMenu page={page} />
    </div>
  );
}
