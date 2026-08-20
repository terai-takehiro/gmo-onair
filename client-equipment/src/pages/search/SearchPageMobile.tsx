/**
 * 「探す」— スマホ（下タブ3つ目）
 *
 * PC 版は中央固定幅の書類のような構成だが、スマホは**現場で1点を当てる画面**
 * なので幅いっぱいに使い、結果は罫線区切りのリストではなく
 * カード積み（`SearchCards.tsx`）にする（監査 `docs/v4-native-ui-audit-2026-08-20.md`
 * equipment-search の指摘）。
 */
import { ChevronRight, QrCode, Search } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, EmptyState, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { Input } from '@/components/ui/input';
import { StandbyCards, EquipmentResultCards, SupplyResultCards } from './SearchCards';
import type { SearchPageViewProps } from './types';

export function SearchPageMobile({
  query, onType, searching, loading, total, debounced, found, supplies, standbyRows,
  onGo, onOpenEquipment, onOpenSupply, onScan,
}: SearchPageViewProps) {
  return (
    <div className="flex flex-col gap-3.5 p-3">
      <PageHeader title="探す" sub="機材・ケーブル・コネクタをまとめて探します" />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onType(e.target.value)}
          placeholder="名前・機材ID・型名・置き場所"
          aria-label="探す言葉"
          className="min-h-tap h-11 pl-10"
        />
      </div>

      {/* **目の前に物があるなら打つより読むほうが速い。** 常に出しておく */}
      <button
        type="button"
        onClick={onScan}
        className="rounded-card min-h-tap flex w-full items-center gap-3 border border-primary-border bg-primary-surface-weak px-4 py-3 text-left active:bg-primary-surface"
      >
        <QrCode className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="text-list block text-primary">QR コードを読む</span>
          <span className="text-note block text-muted-foreground">機材のシールを写すとその1点が開きます</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      </button>

      {!searching ? (
        <>
          <StandbyCards rows={standbyRows} onGo={onGo} />
          <p className="text-note text-muted-foreground">
            機材は<strong className="font-bold">名前・機材ID・型名・製造番号・メーカー・置き場所</strong>、
            ケーブル・コネクタは<strong className="font-bold">名前・型名・長さ・色・置き場所</strong>から探します。
            全角半角・ハイフンは区別しません（<code className="font-number">EQ-0001</code> と
            <code className="font-number">eq0001</code> は同じ）。
            <strong className="font-bold">付属品も一緒に出ます。</strong>
          </p>
        </>
      ) : loading ? (
        <Delayed>
          <div className="flex flex-col gap-2">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </Delayed>
      ) : total === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title={`「${debounced}」に当たるものはありません`}
          description="機材IDの一部（0001 など）や、型名の一部でも探せます。全角半角・ハイフンは区別していません。"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sub text-muted-foreground">
            <span className="font-number font-bold">{total}</span> 件
          </p>

          {found.length > 0 && <EquipmentResultCards items={found} onOpen={onOpenEquipment} />}
          {supplies.length > 0 && <SupplyResultCards items={supplies} onOpen={onOpenSupply} />}
        </div>
      )}
    </div>
  );
}
