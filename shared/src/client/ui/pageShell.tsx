/**
 * 画面の外枠 — 本文の幅・左右の余白・縦の間隔を**1か所で決める**
 *
 * ── なぜ部品にするか ──────────────────────────────────────
 *
 * 制作技術支援（`client-techops`）を数えたところ、ページ直下の枠が
 * **8通り**に割れていました（実測・2026-09）:
 *
 *   幅なし + `px-4 py-6 sm:px-6 sm:py-8`   … トップ / ハブ / スケジュール一覧 / テロップCG
 *   `max-w-screen-2xl` + `px-4 sm:px-6 py-5 sm:py-8` … 進行台本一覧
 *   `max-w-6xl` + `px-3 py-4 sm:px-6 sm:py-6`        … 収録 / 配信 / レンタル
 *   `max-w-6xl` + `px-4 py-6 sm:px-6 sm:py-8`        … スケジュール表
 *   `max-w-5xl` + `px-6 py-8`                        … スケジュール定型設定
 *   `max-w-4xl` / `max-w-3xl` + `px-3 py-4 …`        … 計時4画面
 *   `max-w-3xl` + `p-3 sm:p-4`                       … AIナレッジ
 *
 * 同じサイドバーの中で隣り合う画面の本文幅と左右余白が違うと、
 * **画面を移るたびに文章の左端が動きます**。文字の大きさより先に気づく差です。
 *
 * 規約を文章で書くだけでは（`_rules.md` に本文幅の記述が無かったのが実際）
 * 画面ごとに再発するので、**部品にして選べる段を2つに絞ります**。
 *
 * ── 使い方 ────────────────────────────────────────────────
 *
 * ```tsx
 * <PageShell>
 *   <PageHeader title="機材の貸し出し" sub={`${n}件`} />
 *   …
 * </PageShell>
 * ```
 *
 * | `width` | 幅 | 使う画面 |
 * | --- | --- | --- |
 * | `full`（既定） | 制限なし | 一覧・表・ダッシュボードなど**横に情報が並ぶ画面** |
 * | `narrow` | `max-w-3xl` 中央寄せ | 設定・フォームなど**1カラムで読み下す画面** |
 *
 * 「表なのに狭い」「フォームなのに広い」以外の理由で段を増やさないこと。
 * `max-w-4xl` `max-w-5xl` `max-w-6xl` のような中間の段は**作りません** —
 * 中間を1つ許すと、次の画面が別の中間を選んで元に戻ります。
 *
 * ── 余白は案件管理（v4 の基準アプリ）に合わせている ────────
 *
 * `p-3 lg:p-6` ＋ `gap-4 lg:gap-5`。`client/src` の v4 画面が
 * `flex flex-col gap-4 p-3 lg:gap-5 lg:p-6` で揃っているので、
 * アプリを跨いでも本文の左端が動きません。
 *
 * ── `env(safe-area-inset-bottom)` をここで持たない理由 ────
 *
 * ホームバーの逃げは**共通シェルが持っています**（`shell/AppShell.tsx` の
 * 主アクションの差し込み口と `MobileTabs`）。ページ側で
 * `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` と書くと、
 * インラインの指定が `p-3` の下余白に**勝って 0px になり**、
 * ノッチの無い端末では単に本文の下の余白が消えます
 * （制作技術支援の計時・収録・配信の5画面で実際にそうなっていました）。
 */
import * as React from 'react';
import { cn } from '../utils';

export type PageShellWidth = 'full' | 'narrow';

export interface PageShellProps {
  /** 本文の幅。既定は `full`（制限なし）。設定・フォーム画面だけ `narrow` */
  width?: PageShellWidth;
  children: React.ReactNode;
  /**
   * **幅と余白の上書きには使わないこと。** 画面固有の付け足し
   * （`h-full` など、外枠の高さの都合）だけを想定しています。
   */
  className?: string;
}

export function PageShell({ width = 'full', children, className }: PageShellProps) {
  return (
    <div
      /* 実ブラウザでの計測（`scripts/verify-ui.mjs`）が本文の左端を
         画面ごとに集めるための目印。見た目のクラス名で束ねると、
         枠を手書きに戻した瞬間に検査が素通りする */
      data-page-shell={width}
      className={cn(
        'flex flex-col gap-4 p-3 lg:gap-5 lg:p-6',
        width === 'narrow' && 'mx-auto w-full max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
