/**
 * 台帳の絞り込み（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費 で共通・幅で形が変わる） (v4)
 *
 * PC は今までどおり「検索欄 ＋ 計上月 ＋ チップの帯」を横に並べます。
 * スマホは `MobileFilterBar` に畳み、**検索欄だけは外に出したまま**にします
 * （探すのは絞り込みではなく**目的そのもの**なので、畳むと2タップになる）。
 *
 * ── 「効いている数」をここで数える ──────────────────────────
 *
 * 3画面それぞれで数えると**必ずどれかが数え漏らします**。漏らすと
 * 「絞り込んでいることを忘れたまま『件数が少ない』と読む」ことになり、
 * お金の画面ではそのまま判断を誤ります。**数え方はこの部品に1つだけ**置き、
 * 画面は「何が既定か」（`defaultValue`）だけを渡します。
 *
 * ── ここに入れないもの ──────────────────────────────────────
 *
 * 仕入の「変動原価／固定原価」（`LedgerTabs`）は入れません。あれは絞り込みでは
 * なく**別の集合への切り替え**です（足す先が違う）。畳むと「すべて」を押せば
 * 両方見えると誤解されます。
 */
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { MobileFilterBar, MobileFilterField } from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { LedgerSearch, MonthPicker } from './LedgerParts';
import type { LedgerUrlPeriodState } from './ledgerUrlPeriod';

export interface LedgerFilterGroup {
  key: string;
  /** PC の `FilterChips` の読み上げ名。例「売上の状態で絞り込む」 */
  label: string;
  /** スマホのシートの中の見出し。例「状態」 */
  sheetLabel: string;
  items: Array<{ key: string; label: string; count?: number | null }>;
  value: string;
  onChange: (k: string) => void;
  /** 既定値。**`value !== defaultValue` のときだけ「効いている」と数える** */
  defaultValue: string;
}

export interface LedgerFilterBarProps {
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  month: string;
  onMonth: (v: string) => void;
  groups: LedgerFilterGroup[];
  /** 財務ダッシュボードからの期間の引き継ぎ（`useLedgerUrlPeriod` の戻り値） */
  period: LedgerUrlPeriodState;
  /** 「ぜんぶ外す」。**検索は消しません**（目的そのものなので） */
  onClearAll: () => void;
}

export function LedgerFilterBar(p: LedgerFilterBarProps) {
  const isMobile = useIsMobile();
  const activeCount =
    p.groups.filter((g) => g.value !== g.defaultValue).length
    + (p.month ? 1 : 0)
    + (p.period.range ? 1 : 0);

  return isMobile ? (
    <MobileFilterBar
      search={p.search}
      activeCount={activeCount}
      onClearAll={p.onClearAll}
      title="絞り込み"
    >
      <MobileFilterField label="計上月">
        <div className="flex items-center gap-2">
          {/* 日付は端末のピッカーに任せる（自作の日付ホイールを作らない） */}
          <Input
            type="month"
            value={p.month}
            onChange={(e) => p.onMonth(e.target.value)}
            aria-label="計上月"
            className="min-w-0 flex-1"
          />
          {p.month ? (
            <Button variant="ghost" onClick={() => p.onMonth('')}>解除</Button>
          ) : (
            <span className="text-sub shrink-0 text-muted-foreground">全月</span>
          )}
        </div>
      </MobileFilterField>

      {p.groups.map((g) => (
        <MobileFilterField key={g.key} label={g.sheetLabel}>
          {/*
            **折り返して全部見せる。** 横スクロールにすると 375px では3個しか
            見えず、残りがあることに気づけないうえ、払うつもりが押してしまう
            （`projectList/MobileFilterBar.tsx` で踏んだ前例）
          */}
          <div role="group" aria-label={g.label} className="flex flex-wrap gap-2">
            {g.items.map((it) => {
              const on = it.key === g.value;
              return (
                <button
                  key={it.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => g.onChange(it.key)}
                  className={cn(
                    'rounded-control min-h-tap text-sub flex items-baseline gap-1.5 border px-3',
                    on
                      ? 'border-primary-border-strong bg-primary-surface font-bold text-primary'
                      : 'border-border bg-card text-secondary-foreground',
                  )}
                >
                  {it.label}
                  {it.count != null && <span className="font-number text-note">{it.count}</span>}
                </button>
              );
            })}
          </div>
        </MobileFilterField>
      ))}

      {p.period.range && (
        <MobileFilterField label="期間">
          <div className="flex flex-wrap items-center gap-2">
            {/* 期間は文字列で組み立てない（開始・区切り・終了を分ける部品を使う） */}
            <span className="text-sub">
              <DateRange start={p.period.range.from} end={p.period.range.to} />
            </span>
            <Button variant="ghost" onClick={p.period.clearPeriod}>期間を解除</Button>
          </div>
        </MobileFilterField>
      )}
    </MobileFilterBar>
  ) : (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <LedgerSearch
          value={p.search.value}
          onChange={p.search.onChange}
          placeholder={p.search.placeholder}
        />
        <MonthPicker value={p.month} onChange={p.onMonth} />
      </div>

      {p.groups.map((g) => (
        <FilterChips
          key={g.key}
          label={g.label}
          items={g.items.map((it) => ({ key: it.key, label: it.label, count: it.count ?? null }))}
          value={g.value}
          onChange={g.onChange}
        />
      ))}
    </>
  );
}
