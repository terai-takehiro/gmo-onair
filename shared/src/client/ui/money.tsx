/**
 * 金額の書き方 (デザイン README「数字の書き方」/ 6章 33a)
 *
 * **`¥` を左端に固定し、数字を右端に寄せる**。円記号と数字を別の要素に分けるのが要点で、
 * 1つの文字列 (`¥4,820,000`) にすると桁数の違う金額が縦に並んだときに
 * 円記号の位置がばらつき、数字の右端も揃わないので比較できない。
 *
 * `¥` は `opacity:.65` で薄くし、数字を主役にする。
 * 数字は `tnum` (等幅数字) で桁を揃える (`font-number` が指定済み)。
 */
import * as React from 'react';
import { cn } from '../utils';
import { type SlotWidth } from './row';

export interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number | string | null | undefined;
  /** 通貨記号。円以外を出す予定は無いが、%や無記号の行と揃えるために差し替えられる */
  currency?: string;
  /** マイナスを赤にする (値引き行など「引かれている」ことを見せたいとき) */
  negativeIsDanger?: boolean;
  /**
   * **縦に並べない場所で使う** (帯の中・文中・カードの1つだけの金額)。
   * `¥` を数字の**すぐ左**に付ける (モックの事実の帯: `gap:4px`)。
   *
   * 既定 (`inline` なし) は列で使う形で、枠の幅いっぱいに
   * **`¥` を左端・数字を右端**へ引き離す。桁をそろえるための形なので、
   * 縦に1つしか無い金額に当てると**円記号だけが遠くに離れて見える**
   * (利用者からのご指摘。案件詳細の「見積金額」がこれだった)。
   */
  inline?: boolean;
}

/** 桁区切り。null / 空 / 数値でないものは「—」にする (0 と未入力を区別する) */
function digits(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

export function Money({ value, currency = '¥', negativeIsDanger, inline, className, ...rest }: MoneyProps) {
  const d = digits(value);
  const n = Number(value);
  const isNegative = d !== null && Number.isFinite(n) && n < 0;

  if (d === null) {
    return (
      <span className={cn('font-number text-muted-foreground', className)} {...rest}>—</span>
    );
  }
  return (
    <span
      className={cn(
        'font-number flex items-baseline justify-between gap-1.5 whitespace-nowrap',
        // 幅を内容に合わせる (block の flex は幅いっぱいに広がるので justify-between が効いてしまう)
        inline && 'inline-flex justify-start gap-1',
        isNegative && negativeIsDanger && 'text-destructive',
        className,
      )}
      {...rest}
    >
      <span className="opacity-65">{isNegative ? `-${currency}` : currency}</span>
      <span>{d}</span>
    </span>
  );
}

/**
 * 表の列で使う固定幅つき。
 * **列幅は7段 (56 / 72 / 96 / 128 / 160 / 200 / 240px) からしか選べない。**
 * 中間の値 (120px・180px …) を作ると、同じ意味の列がページごとに違う幅になり、
 * 金額の右端が縦にそろわなくなる。
 *
 * 段の定義は `row.tsx` の `SlotWidth` **1か所だけ**。ここに数字を書き写すと
 * 「金額列は96px・バッジ列は100px」のように片方だけ増えて必ずずれる (P2)。
 */
export function MoneyCell({
  width = 128,
  className,
  ...rest
}: MoneyProps & { width?: SlotWidth }) {
  return <Money className={cn('shrink-0', className)} style={{ width }} {...rest} />;
}
