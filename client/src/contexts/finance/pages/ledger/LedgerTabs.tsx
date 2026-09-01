/**
 * 台帳の中の切り替え（④ 仕入の 変動原価／固定原価 など） (v4)
 *
 * ── `FilterChips` と使い分ける ─────────────────────────────
 *
 * `FilterChips` は**同じ集合を絞り込む**もの（すべて／確定／仮）。
 * こちらは**別の集合に切り替える**もの（変動原価と固定原価は足す先が違う）。
 * 見た目を分けておかないと、「すべて」を押せば両方見えると誤解されます。
 *
 * 下線で現在地を示します（罫線の色だけを変える形だと、隣り合ったときに
 * どちらが選ばれているか読み取れません）。
 */
import type { ReactNode } from 'react';

export interface LedgerTabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** 件数。`undefined` なら出さない */
  count?: number;
}

export function LedgerTabs({
  items, value, onChange,
}: {
  items: LedgerTabItem[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    // タブの ARIA (tab/tablist) は名乗らない — 矢印キー移動・tabpanel を実装して
    // いないため、読み上げの約束と挙動が食い違う。aria-pressed のボタンの組にする
    <div role="group" className="flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(t.key)}
            className={`min-h-tap flex shrink-0 items-center gap-1.5 border-b-2 px-3 text-sub lg:min-h-[40px] ${
              on
                ? 'border-primary font-bold text-primary'
                : 'border-transparent text-secondary-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-badge font-number px-1.5 text-note ${
                on ? 'bg-primary-surface text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
