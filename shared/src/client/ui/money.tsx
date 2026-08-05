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

export interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: number | string | null | undefined;
  /** 通貨記号。円以外を出す予定は無いが、%や無記号の行と揃えるために差し替えられる */
  currency?: string;
  /** マイナスを赤にする (値引き行など「引かれている」ことを見せたいとき) */
  negativeIsDanger?: boolean;
}

/** 桁区切り。null / 空 / 数値でないものは「—」にする (0 と未入力を区別する) */
function digits(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n)).toLocaleString('ja-JP');
}

export function Money({ value, currency = '¥', negativeIsDanger, className, ...rest }: MoneyProps) {
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
 * **列幅は README の7段 (56 / 72 / 96 / 128 / 160 / 200 / 240px) からしか選べない。**
 * 中間の値 (120px・180px …) を作ると、同じ意味の列がページごとに違う幅になり、
 * 金額の右端が縦にそろわなくなる。
 */
export function MoneyCell({
  width = 128,
  className,
  ...rest
}: MoneyProps & { width?: 56 | 72 | 96 | 128 | 160 | 200 | 240 }) {
  return <Money className={cn('shrink-0', className)} style={{ width }} {...rest} />;
}
