/**
 * 「探す」— スマホ（下タブ3つ目）
 *
 * PC 版は今までどおりの罫線区切りリスト（`SearchPageDesktop.tsx`）だが、
 * スマホは**現場で1点を当てる画面**なので幅いっぱいに使い、結果は
 * カード積み（`SearchCards.tsx`）にする（監査 `docs/v4-native-ui-audit-2026-08-20.md`
 * search-sales の指摘③）。
 *
 * ── キャンセルボタン（指摘①） ──────────────────────────────
 *
 * 下タブから来る画面には行き先を戻る「ナビゲーション」が無く、この画面が
 * 素の検索欄だけを持っていた（下タブ画面としての専用の演出が無い、という
 * 監査の指摘）。iOS の検索欄と同じ「打ち始めたら『キャンセル』が出る・
 * 押すと打つ前の状態に戻る」形にした。**下タブ自体は消えないので、
 * ここでの『キャンセル』は画面遷移ではなく「打ちかけの文字とキーボードを
 * 消して、やること・場所の一覧に戻す」だけ**でよい。
 */
import { useRef, useState } from 'react';
import { Building2, Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, EmptyState, ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import {
  ShortcutCards, RecentCards, ProjectResultCards, CustomerResultCards, VendorResultCards,
} from './SearchCards';
import type { SearchPageViewProps } from './types';

export function SearchPageMobile({
  query, onType, searching, failed, onRetry, results, total,
  doItems, places, onGoShortcut, recent, onOpenRecent, onRemoveRecent,
  onOpenProject, onOpenCustomer, onOpenVendor,
}: SearchPageViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const showCancel = focused || query.trim().length > 0;

  const onCancel = () => {
    onType('');
    inputRef.current?.blur();
    setFocused(false);
  };

  return (
    <div className="flex flex-col gap-3.5 p-3">
      <PageHeader title="検索" sub="案件・お客様・仕入先をまとめて検索します" />

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={inputRef}
            type="search"
            // **スマホで最初から打てるようにする。** 探しに来た人がもう一度
            // 入力欄を押さずに済む
            autoFocus
            value={query}
            onChange={(e) => onType(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="案件名・GLS番号・お客様名・仕入先名"
            aria-label="検索語"
            className="min-h-tap h-11 pl-10 pr-10"
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        {showCancel && (
          <button
            type="button"
            // ⚠️ **`onClick` だけだと押せない。** 入力欄が先に `blur` して
            // このボタン自体が消え、押した判定より先に外れてしまう。
            // `mousedown` の `preventDefault` で入力欄の `blur` を止めてから開く
            onMouseDown={(e) => e.preventDefault()}
            onClick={onCancel}
            className="min-h-tap shrink-0 px-1 text-list text-primary"
          >
            キャンセル
          </button>
        )}
      </div>

      {/* **打ち込む前と 0件 を分ける。** 打つ前に「該当なし」と出さない */}
      {!query.trim() ? (
        <div className="flex flex-col gap-4">
          <ShortcutCards
            icon={Search}
            label="すぐできること"
            headingId="search-do-m"
            items={doItems}
            tone="bg-primary-surface text-primary"
            onOpen={onGoShortcut}
          />

          <RecentCards items={recent} onOpen={onOpenRecent} onRemove={onRemoveRecent} />

          <ShortcutCards
            icon={Building2}
            label="場所"
            headingId="search-places-m"
            items={places}
            tone="bg-muted text-muted-foreground"
            onOpen={onGoShortcut}
          />

          <p className="text-note text-muted-foreground">
            案件名の一部・GLS番号・お客様名・仕入先名で検索できます。
            <strong className="font-bold">見る権限が無いものはここに出ません。</strong>
            {recent.length > 0 && '「最近見たもの」はこの端末で開いたものだけです（別の端末では出ません）。'}
          </p>
        </div>
      ) : failed ? (
        // **失敗を読み込み中に化けさせない。** もう一度押せる口を必ず置く
        <ErrorPanel title="検索できませんでした" error={failed} onRetry={onRetry} />
      ) : results === null || searching ? (
        <Delayed>
          <div className="flex flex-col gap-2">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </Delayed>
      ) : total === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title={`「${query.trim()}」に一致する項目はありません`}
          description="言葉を短くするか、別の言い方で試してください。見る権限が無い種類はここに出ません。"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sub text-muted-foreground">
            <span className="font-number font-bold">{total}</span> 件
          </p>

          <ProjectResultCards items={results.projects} onOpen={onOpenProject} />
          <CustomerResultCards items={results.customers} onOpen={onOpenCustomer} />
          <VendorResultCards items={results.vendors} onOpen={onOpenVendor} />
        </div>
      )}
    </div>
  );
}
