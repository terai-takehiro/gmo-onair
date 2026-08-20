/**
 * 案件詳細 / 概要タブの小部品 (v4 ⑥)
 *
 * `OverviewTab.tsx` から切り出した（400行の上限に当たったため）。
 * **役割は「事実の帯の1枠」「見出しつきの節」「名前と値の行」の3つだけ**で、
 * どれも `OverviewTab.tsx` 以外からは呼ばれない前提の小さな部品。
 */
import type { CalendarDays } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';

/**
 * 事実の帯の1枠。
 *
 * `className` は**枠の取り方を変えるためだけ**に渡す（「次にやること」は
 * 1行ぶんまるごと使う）。中身の書き方は渡す側が決めない。
 *
 * **`mobile` はスマホ専用のカード枠に切り替える**（v4ネイティブUI監査・2026-08）。
 * 監査時点では PC/スマホ共通の1つの実装で、モックの「2段組・区切り線つきの帯」を
 * 375pxでもそのまま描いていた。**2列グリッドに `border-l`（列の区切り線）を付ける
 * 実装は、2枚目の行の左端にも区切り線が出てしまう**（`first:border-l-0` はDOM上の
 * 最初の1枚にしか効かないため）— 行の境目のはずが列の境目に見える、というPC専用の
 * 想定を持ち込んだ結果の見た目の崩れだった。
 *
 * スマホでは**縦積みのカード**（区切り線ではなく1枚ずつ枠で囲む）に描き直し、
 * PC は従来の2段組・区切り線のままにしている。**中身（何を出すか）は
 * 1つも変えていない** — 呼び出し順・渡す値は共通
 */
export function Fact({
  icon: Icon, label, children, className, mobile,
}: { icon: typeof CalendarDays; label: string; children: React.ReactNode; className?: string; mobile?: boolean }) {
  if (mobile) {
    return (
      <div className={cn('rounded-card min-w-0 border border-border-subtle bg-surface-subtle px-3 py-2.5', className)}>
        <div className="mb-1 flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sub-sm text-muted-foreground">{label}</span>
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className={cn('min-w-0 border-l border-border-subtle px-4 first:border-l-0', className)}>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sub-sm text-muted-foreground">{label}</span>
      </div>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card">
      <h2 className="text-cardtitle border-b border-border-subtle px-4 py-3">{title}</h2>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** 名前と値が縦に並ぶ表。**値が無い行も残す** (無いことが分かるように) */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border-faint py-2 last:border-b-0">
      <span className="text-sub w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="text-sub min-w-0 flex-1 text-foreground">{children || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}
