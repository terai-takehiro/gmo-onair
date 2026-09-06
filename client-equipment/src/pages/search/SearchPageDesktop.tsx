/**
 * 「探す」— PC
 *
 * QRスキャン（`scan/ScanPageDesktop.tsx`）と同じ「書類のような構成」に寄せた
 * （中央固定幅・枠で区切ったパネルを縦に積む）。スマホ版は `SearchPageMobile.tsx`。
 */
import { ChevronRight, QrCode, Search } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Input } from '@/components/ui/input';
import { StandbyRows, EquipmentResultRows, SupplyResultRows } from './SearchResultRows';
import type { SearchPageViewProps } from './types';

export function SearchPageDesktop({
  query, onType, searching, loading, total, debounced, found, supplies, standbyRows,
  onGo, onOpenEquipment, onOpenSupply, onScan,
}: SearchPageViewProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      <PageHeader title="探す" sub="機材・ケーブル・コネクタをまとめて探します" />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onType(e.target.value)}
          placeholder="名前・機材ID・型名・保管場所"
          aria-label="検索語"
          className="h-10 pl-10"
        />
      </div>

      {/* **目の前に物があるなら打つより読むほうが速い。** 常に出しておく */}
      <button
        type="button"
        onClick={onScan}
        className="rounded-card flex w-full items-center gap-3 border border-primary-border bg-primary-surface-weak px-4 py-3 text-left"
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
          <StandbyRows rows={standbyRows} onGo={onGo} />
          <p className="text-note text-muted-foreground">
            機材は<strong className="font-bold">名前・機材ID・型名・製造番号・メーカー・保管場所</strong>、
            ケーブル・コネクタは<strong className="font-bold">名前・型名・長さ・色・保管場所</strong>から探します。
            全角半角・ハイフンは区別しません（<code className="font-number">EQ-0001</code> と
            <code className="font-number">eq0001</code> は同じ）。
            <strong className="font-bold">付属品も一緒に出ます。</strong>
          </p>
        </>
      ) : loading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : total === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title={`「${debounced}」に一致する項目はありません`}
          description="機材IDの一部（0001 など）や、型名の一部でも検索できます。全角半角・ハイフンは区別していません。"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sub text-muted-foreground">
            <span className="font-number font-bold">{total}</span> 件
          </p>

          {found.length > 0 && <EquipmentResultRows items={found} onOpen={onOpenEquipment} />}
          {supplies.length > 0 && <SupplyResultRows items={supplies} onOpen={onOpenSupply} />}
        </div>
      )}
    </div>
  );
}
