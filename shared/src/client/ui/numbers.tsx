/**
 * 数字と見出しのサイズを1か所にする — デザイン 6章（部品と数字のサイズの共通化）
 *
 * ── なにが問題だったか（実装を数えた結果）────────────────
 *
 * 同じ「金額」を出す書き方が画面ごとに違っていた:
 *
 *  - `¥{n.toLocaleString()}` を**手で書いている箇所が10か所**
 *  - **万円に丸める関数が3本**（`yen` / `formatYen` / `formatYenShort`）
 *    それぞれ別のページに、別の名前で、別の丸め方で置かれていた
 *    （`Math.round(v/10000)` と `(v/10000).toFixed(0)` は**桁の丸め方が違う**ので、
 *     同じ 45,000円 が画面Aでは「¥5万」画面Bでは「¥5万」…と一致する保証が無い）
 *  - 大きい数字の見た目が `text-2xl font-bold font-number` のように**その場書き**
 *  - ページの見出しが `text-xl lg:text-2xl font-bold` と**10ページ以上で重複**
 *
 * 画面ごとにバラバラでも「動く」ので、直すきっかけが無いまま増える。
 * だから**部品にして、手で書けないようにする**（`scripts/check-ui-tokens.mjs`）。
 *
 * ── サイズの段（これ以外は使わない）──────────────────────
 *
 *  | 用途 | 段 | 実際のクラス |
 *  | --- | --- | --- |
 *  | ダッシュボードの主役の数字 | `lg` | `text-3xl sm:text-4xl` |
 *  | カードの数字 | `md`（既定） | `text-2xl sm:text-3xl` |
 *  | 表の中・注記の数字 | `sm` | `text-xl sm:text-2xl` |
 *  | 本文と同じ大きさ | `inline` | 継承（サイズを指定しない） |
 *
 * `KpiCard` と同じ段にしてある（片方だけ変えると同じ数字が画面で違う大きさになる）。
 */
import * as React from 'react';
import { cn } from '../utils';

// ───────────────────────────────────────────────────────
// 数字のサイズ
// ───────────────────────────────────────────────────────

export type StatSize = 'lg' | 'md' | 'sm' | 'inline';

/** サイズの段。**KpiCard と同じ値**にしてある */
export const STAT_SIZE: Record<StatSize, string> = {
  lg: 'text-3xl sm:text-4xl',
  md: 'text-2xl sm:text-3xl',
  sm: 'text-xl sm:text-2xl',
  inline: '',
};

export interface StatValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: StatSize;
  children: React.ReactNode;
}

/**
 * 大きく見せる数字の器。**サイズは段から選ぶ**（`text-*` を直接書かない）。
 * 等幅数字 (`font-number`) が入るので、縦に並べたときに桁が揃う。
 */
export function StatValue({ size = 'md', className, children, ...rest }: StatValueProps) {
  return (
    <span className={cn('font-number font-bold leading-tight', STAT_SIZE[size], className)} {...rest}>
      {children}
    </span>
  );
}

// ───────────────────────────────────────────────────────
// 数字そのもの
// ───────────────────────────────────────────────────────

/** 桁区切り。**「0」と「未入力」を区別する**（未入力は「—」） */
export function formatNum(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('ja-JP');
}

export interface NumProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number | string | null | undefined;
  /** 単位（件・本・人・％ など）。数字より小さく薄く出す */
  unit?: string;
}

/** 金額でない数字（件数・本数・％）。等幅で桁を揃える */
export function Num({ value, unit, className, ...rest }: NumProps) {
  const d = formatNum(value);
  if (d === null) {
    return <span className={cn('font-number text-muted-foreground', className)} {...rest}>—</span>;
  }
  return (
    <span className={cn('font-number whitespace-nowrap', className)} {...rest}>
      {d}
      {unit && <span className="ml-0.5 text-[0.8em] opacity-70">{unit}</span>}
    </span>
  );
}

// ───────────────────────────────────────────────────────
// 万円（グラフの軸・ダッシュボードの要約で使う）
// ───────────────────────────────────────────────────────

/**
 * 万円に丸めた文字列。**丸め方をここ1本にする**。
 *
 * 以前は `Math.round(v/10000)` と `(v/10000).toFixed(0)` が別のページに置かれていた。
 * どちらも「四捨五入」に見えるが、**負の数で結果が変わる**
 * (`Math.round(-0.5) = -0` / `(-0.5).toFixed(0) = "-1"`)。
 * 売上のマイナス（取り消しの請求書など）が出る画面があるので、揃えないと合わない。
 *
 * 文字列だけを返す関数も出しているのは、**グラフの軸ラベル**のように
 * React 要素を置けない場所があるため。
 */
export function manYen(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  // 四捨五入は「絶対値で丸めて符号を戻す」形にそろえる (負の数で差が出ないように)
  const man = Math.sign(n) * Math.round(Math.abs(n) / 10_000);
  return `¥${man.toLocaleString('ja-JP')}万`;
}

export interface ManYenProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number | string | null | undefined;
}

/** 万円の表示。丸めているので、正確な金額が要る場所では `Money` を使う */
export function ManYen({ value, className, ...rest }: ManYenProps) {
  return (
    <span className={cn('font-number whitespace-nowrap', className)} {...rest}>{manYen(value)}</span>
  );
}

// ───────────────────────────────────────────────────────
// ページの見出し
// ───────────────────────────────────────────────────────

export interface PageTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** 見出しの左に置くアイコン */
  icon?: React.ReactNode;
  /** 見出しの下の1行説明 */
  sub?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * ページの見出し。`text-xl lg:text-2xl font-bold` が10ページ以上で重複していたので
 * 部品にした（片方だけ直すと画面ごとに見出しの大きさが違う）。
 */
export function PageTitle({ icon, sub, className, children, ...rest }: PageTitleProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <h1 className="flex items-center gap-2 text-xl font-bold lg:text-2xl [overflow-wrap:anywhere]" {...rest}>
        {icon}
        {children}
      </h1>
      {sub && <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
