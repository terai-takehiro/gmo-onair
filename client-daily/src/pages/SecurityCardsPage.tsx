/**
 * スタジオ セキュリティカード (`/security-cards`) (v4)
 *
 * GMOサムライスタジオ用賀の 24 枚の貸し借りを追いかける画面。
 * **左に一覧・右に中身の1画面 (master-detail)** にした。以前はカードを押すと
 * ダイアログが開き、開いている間は一覧が見えないので「他に貸せるカードが
 * あるか」を確かめるのに閉じる必要があった。
 *
 * ── v4 で変えたところ ────────────────────────────────────────
 *
 * ・**絞り込みに「返却遅延」を足した。** 貸出中のうち返却の日を過ぎたものは
 *   催促する相手が違うのに、以前は「貸出中」に混ざって数えられていた
 * ・**上の数字のタイル4枚を消して、チップの件数に寄せた。** 同じ数を
 *   タイルとチップの2か所に出すと、片方だけ古くなったときに気づけない
 * ・**タブ (カード / 貸出履歴 / アクセス表) をやめた。** 開けられる部屋も
 *   貸し借りも「選んだ1枚について知りたいこと」なので、右に集めた
 * ・レベルは **DB (migration 133 の6つ) を正**にした。モックはレベルを3つに
 *   畳んでいるが、実データと一致しないので採らない (`securityCards/types.ts`)
 */
import { useMemo, useState } from 'react';
import { DoorOpen, Search, X } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import { useSecurityCards } from '@/lib/securityCardApi';
import { CardDetailPanel } from './securityCards/CardDetailPanel';
import { CardGrid } from './securityCards/CardGrid';
import { LendDialog, ReturnDialog } from './securityCards/LendDialog';
import { FILTER_LABELS, matchesFilter, matchesSearch, type CardFilter } from './securityCards/types';

const STUDIO_LABEL = 'GMOサムライスタジオ用賀';

export default function SecurityCardsPage() {
  const { canEdit } = usePermissions();
  const cards = useSecurityCards();
  const [filter, setFilter] = useState<CardFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'lend' | 'return' | null>(null);

  const all = useMemo(() => cards.data ?? [], [cards.data]);

  // **件数はこの一覧から数える。** 集計の口 (`/stats`) からも同じ数が取れるが、
  // 2か所から数えると絞り込みの定義がずれたときに食い違う
  const counts = useMemo(() => ({
    all: all.length,
    available: all.filter((c) => matchesFilter(c, 'available')).length,
    lent: all.filter((c) => matchesFilter(c, 'lent')).length,
    overdue: all.filter((c) => matchesFilter(c, 'overdue')).length,
  }), [all]);

  const visible = useMemo(
    () => all.filter((c) => matchesFilter(c, filter) && matchesSearch(c, search)),
    [all, filter, search],
  );

  // 絞り込みで消えたカードを右に出したままにしない (左に無いものを操作させない)
  const selected = visible.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="セキュリティカード"
        sub={`${STUDIO_LABEL} の 24 枚。誰にどのカードを貸しているかを追いかけます`}
        icon={<DoorOpen className="h-5 w-5 text-primary" aria-hidden="true" />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          label="カードの状態で絞り込む"
          items={(Object.keys(FILTER_LABELS) as CardFilter[]).map((k) => ({
            key: k, label: FILTER_LABELS[k], count: counts[k],
          }))}
          value={filter}
          onChange={(k) => setFilter(k as CardFilter)}
        />
        <div className="relative min-w-0 flex-1 sm:max-w-[240px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="番号 / 会社 / 担当者で探す"
            aria-label="カードを探す"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="検索を消す"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-badge text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <p className="text-note text-muted-foreground">
        「返却遅延」は<strong className="font-bold">「貸出中」の中の一部</strong>です（足しても「すべて」にはなりません）。
      </p>

      {cards.isError ? (
        <ErrorPanel title="カードを読み込めませんでした" error={cards.error} onRetry={() => cards.refetch()} />
      ) : cards.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : all.length === 0 ? (
        <EmptyState
          title="カードが登録されていません"
          description="24 枚はデータベースの初期データとして入るものです。出てこないときは管理者に連絡してください。"
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
          <div className="min-w-0 flex-1">
            {visible.length === 0 ? (
              <NoSearchResults
                keyword={search || undefined}
                activeFilters={filter === 'all' ? [] : [`状態: ${FILTER_LABELS[filter]}`]}
                onClearFilters={() => { setFilter('all'); setSearch(''); }}
              />
            ) : (
              <CardGrid
                cards={visible}
                selectedId={selected?.id ?? null}
                // **別のカードを選んだら開きかけの操作は閉じる。**
                // 残しておくと、貸出の途中で他のカードを押したときに
                // そのカードの貸出ダイアログがいきなり開く
                onSelect={(id) => { setSelectedId(id); setDialog(null); }}
              />
            )}
          </div>
          <div className="min-w-0 lg:w-[400px] lg:shrink-0">
            <CardDetailPanel
              card={selected}
              canEdit={canEdit}
              onLend={() => setDialog('lend')}
              onReturn={() => setDialog('return')}
            />
          </div>
        </div>
      )}

      {selected && dialog === 'lend' && <LendDialog card={selected} onClose={() => setDialog(null)} />}
      {selected && dialog === 'return' && <ReturnDialog card={selected} onClose={() => setDialog(null)} />}
    </div>
  );
}
