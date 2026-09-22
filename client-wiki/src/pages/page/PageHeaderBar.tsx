/**
 * ページの上の1行（パンくず・状態・更新・操作）
 *
 * 段A に出せる操作は「履歴」と「情報」の開閉だけ。編集・AI に聞く・「…」
 * （お気に入り・複製・Markdown で書き出す）は段B 以降なので**置かない**。
 *
 * ⚠️ **ここに `☰` を置かない。** ツリーは共通の左メニューの中にあり、スマホでは
 *    上辺バーの `☰`（引き出し）から開く。画面の中にもう1つ `☰` があると、
 *    同じものを開くボタンが横に2つ並ぶ（2026-09-22 に作り直した）。
 */
import { History, PanelRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import WikiStatusBadge from '@/components/wiki/WikiStatusBadge';
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
    </div>
  );
}
