/**
 * 利用マニュアル・トップページ編 — 共通の小部品
 *
 * `ManualTopPage.tsx` と `figures.tsx` の両方から使う、カード1枚ぶんの型を揃える部品。
 */
import type { ReactNode } from 'react';
import { Lightbulb, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * 丸い番号ピン。
 *
 * 既定は**インライン**（`Legend` の行頭に置く形）。自分で書いた static な figure
 * （通知・検索・タスクハブ・本人メニュー）の中でだけ、`className` で
 * `absolute` を足して実物の上に重ねる。**実コンポーネント（Greeting・AppTiles・
 * TodayCard・IntakeComposer）の中には重ねない** — 中の DOM 構造を知らずに
 * 座標を決め打ちすると、実装が変わった瞬間にピンだけ的外れな位置に残る。
 */
export function Pin({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'rounded-chip font-number inline-flex h-5 w-5 shrink-0 items-center justify-center bg-primary text-[11px] font-bold text-primary-foreground shadow',
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * ピンの説明（figure の下）。**figure にピンを置いていないカードでは呼ばない**
 * （`items` が空なら何も描かない）。
 */
export function Legend({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="rounded-note border border-border-faint bg-surface-subtle mt-3 flex flex-col gap-1.5 px-3 py-2.5">
      {items.map((text, i) => (
        <li key={text} className="text-note flex items-start gap-2 text-muted-foreground">
          <Pin n={i + 1} className="mt-0.5" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/** 番号つき手順（2〜3個）。カード本文のいちばんの中心 */
export function StepsList({ items }: { items: string[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-2">
      {items.map((text, i) => (
        <li key={text} className="text-sub flex items-start gap-2.5">
          <span className="rounded-chip font-number border-primary-border bg-primary-surface mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-bold text-primary">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{text}</span>
        </li>
      ))}
    </ol>
  );
}

/** ヒント（青）／注意（オレンジ）の1行帯。任意 */
export function TipCallout({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  const Icon = tone === 'warning' ? AlertTriangle : Lightbulb;
  const cls = tone === 'warning'
    ? 'border-warning-border bg-warning-surface text-warning'
    : 'border-info-border bg-info-surface text-info';
  return (
    <p className={cn('rounded-note text-sub mt-3 flex items-start gap-2 border px-3 py-2.5', cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </p>
  );
}

/**
 * figure を囲む枠。
 *
 * ⚠️ **`pointer-events-none select-none` は絶対に外さない。** ここに実際の
 * 本番コンポーネント（`Greeting` / `AppTiles` / `TodayCard` / `IntakeComposer`）を
 * そのまま置くため、これが無いとこのガイドから本物の遷移・送信・API 呼び出しが
 * 誤って発火する。
 *
 * `overflow-x-auto` は外側（`pointer-events` は既定のまま）に付け、内側だけを
 * 無効化する — スマホの狭い画面でも、figure 自体は横スクロールで最後まで見られる
 * ようにするため（ページ本体は横スクロールしない）。
 */
export function FigureFrame({
  children, className, minWidth,
}: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cn('rounded-card border-border-subtle bg-surface-subtle overflow-x-auto border p-4', className)}>
      <div className="pointer-events-none relative w-max select-none" style={minWidth ? { minWidth } : undefined}>
        {children}
      </div>
    </div>
  );
}
