/**
 * 画面の中の切り替え (機材台帳の 機材／貸出機材／ケーブル・コネクタ、設定の4タブ)
 *
 * ── `FilterChips` と使い分ける ─────────────────────────────
 *
 * `FilterChips` は**同じ集合を絞り込む**もの (すべて／貸出可／修理中)。
 * こちらは**別の集合に切り替える**もの (機材とケーブルは別のテーブル)。
 * 見た目を分けておかないと「すべて」を押せば両方見えると誤解されます。
 *
 * 下線で現在地を示します。罫線の色だけを変える形にすると、隣り合ったときに
 * どちらが選ばれているか読み取れません。
 *
 * **共通部品にしていないのは `shared/` を触らないため** — ここに新しいクラス名を
 * 書くと凍結4アプリ (Qシート・技術資料・計時LIVE・リアルタイムCG) の CSS が増えます。
 * 財務の `client/src/contexts/finance/pages/ledger/LedgerTabs.tsx` と同じ形です。
 */
import type { ReactNode } from 'react';

export interface SubTabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** 件数。`undefined` なら出さない (「まだ数えていない」を `0` と混ぜない) */
  count?: number;
}

export function SubTabs({
  items, value, onChange, label,
}: {
  items: SubTabItem[];
  value: string;
  onChange: (key: string) => void;
  /** 読み上げ用の名前 (「台帳の種類」など) */
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
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
                {t.count.toLocaleString('ja-JP')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
