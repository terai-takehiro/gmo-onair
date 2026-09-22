/**
 * ① ホーム `/wiki`（docs/design/v4/wiki.md §6-①）
 *
 * ここに出すのは
 *   検索欄 ／ 最近見たもの ／ 自分が担当で見直し予定日を過ぎているページ ／
 *   スペースのタイル ／ 最近更新 ／ お気に入り
 * の6つ。**サーバーは `GET /wiki/home` の1本で後ろの4つを返す**ので、画面も1本で読む
 * （開くたびに4往復させない）。検索欄は窓を開くだけ・最近見たものは端末の中だけなので、
 * どちらもサーバーに訊かない。
 *
 * ⚠️ **「AI に聞く」の案内はまだ出さない。** 画面（§6-⑤）が段E なので、置くと
 *    押せるのに何も起きない。設計書が「段E までは『準備中』ではなく**出さない**」と
 *    決めているのと同じ扱いで、左メニュー（`nav.ts`）の `ready` と考え方をそろえてある。
 */
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { BookText, Star } from 'lucide-react';
import { useWikiHome } from '@/lib/wikiApi';
import WikiSection from '@/components/wiki/WikiSection';
import WikiHomeSearch from '@/components/search/WikiHomeSearch';
import WikiRecentPages from '@/components/search/WikiRecentPages';
import OverdueNotice from './OverdueNotice';
import PageBriefList from './PageBriefList';
import SpaceTiles from './SpaceTiles';

export default function HomePage() {
  const homeQ = useWikiHome();
  const home = homeQ.data;
  const retry = () => void homeQ.refetch();

  return (
    <PageShell>
      <PageHeader
        title="Wiki"
        sub="マニュアル・手順書・社内ルールを置く場所です。"
        icon={<BookText />}
      />

      <WikiHomeSearch />

      <WikiRecentPages />

      <OverdueNotice rows={home?.overdue} />

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <h2 className="text-cardtitle text-foreground">スペース</h2>
          <span className="text-sub-sm text-muted-foreground">分野ごとの区分。閲覧範囲の単位</span>
        </div>
        <SpaceTiles
          spaces={home?.spaces}
          loading={homeQ.isLoading}
          error={homeQ.error}
          onRetry={retry}
        />
      </section>

      <div className="grid gap-3.5 lg:grid-cols-[1fr_360px]">
        <WikiSection title="最近更新" note="更新が新しい順に10件" bodyClassName="overflow-x-auto">
          <PageBriefList
            pages={home?.recent}
            loading={homeQ.isLoading}
            error={homeQ.error}
            onRetry={retry}
            errorTitle="最近更新したページを読み込めませんでした"
            emptyTitle="まだ更新されたページがありません"
            emptyDescription="ページを作成して公開すると、ここに出ます。"
          />
        </WikiSection>

        <WikiSection
          title={
            <span className="flex items-center gap-2">
              <Star className="h-[15px] w-[15px] text-warning" aria-hidden />
              お気に入り
            </span>
          }
          footnote="ページの「…」からお気に入りに入れると、ここに出ます。"
        >
          <PageBriefList
            pages={home?.favorites}
            loading={homeQ.isLoading}
            error={homeQ.error}
            onRetry={retry}
            compact
            errorTitle="お気に入りを読み込めませんでした"
            emptyTitle="まだお気に入りがありません"
            emptyDescription="よく開くページをお気に入りに入れると、ここに出ます。"
          />
        </WikiSection>
      </div>
    </PageShell>
  );
}
