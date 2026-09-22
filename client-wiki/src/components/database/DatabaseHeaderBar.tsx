/**
 * データベースのページの上の1行（設計 §6-⑩）
 *
 * ページ②の `PageHeaderBar` と同じ形ですが、右パネルに出るのが「情報」ではなく
 * **「項目」**（列の定義）なので、ボタンの名前だけ差し替えた別の部品にしてあります。
 *
 * ⚠️ **ここに `☰` を置かない。** ツリーは共通の左メニューの中にあり、スマホでは
 *    上辺バーの `☰` から開きます（画面の中にもう1つ置くと同じものが2つ並ぶ）。
 */
import { History, PanelRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import WikiStatusBadge from '@/components/wiki/WikiStatusBadge';
import PageActionsMenu from '@/components/page/PageActionsMenu';
import { revLabel, updatedLabel } from '@/lib/wikiFormat';

export default function DatabaseHeaderBar({
  page,
  itemsOpen,
  onToggleItems,
}: {
  page: WikiPage;
  /** 右の「項目」パネルを開いているか */
  itemsOpen: boolean;
  onToggleItems: () => void;
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

      <Button asChild variant="outline" size="sm" className="hidden lg:inline-flex">
        <Link to={`/p/${page.id}/history`}>
          <History className="mr-1.5 h-4 w-4" aria-hidden />
          履歴
        </Link>
      </Button>

      <Button
        variant={itemsOpen ? 'secondary' : 'outline'}
        size="sm"
        aria-pressed={itemsOpen}
        onClick={onToggleItems}
        className="hidden xl:inline-flex"
      >
        <PanelRight className="mr-1.5 h-4 w-4" aria-hidden />
        項目
      </Button>

      <PageActionsMenu page={page} />
    </div>
  );
}
