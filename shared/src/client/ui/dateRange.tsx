/**
 * 期間の書き方 (docs/design/v4/_rules.md「1. 縦の整列」)
 *
 * **開始日・区切り・終了日を別の要素に分ける。** 1つの文字列
 * (`2026/05/12 〜 2026/05/31`) にすると、片方が空の行・年をまたぐ行が混ざったときに
 * 日付の桁が縦にそろわず、期間の長短が読み取れない。
 *
 * ── 実際に何がばらついていたか (v4 着手時に数えた) ──────────────
 * 手書きの期間が 19 か所あり、**区切りも空白も欠けたときの出し方も違っていた**:
 *
 *   区切り        `〜` が16か所 / `~` (半角) が3か所
 *   空白          ` 〜 ` (前後あり) と `〜` (なし) が混在
 *   片方が空       `—` / `最古`・`最新` / `返却予定日なし` / 何も出さない の4通り
 *   同じ日        「開始だけ出す」画面と「両方出す」画面がある
 *
 * どれも「動く」ので直すきっかけが無く増える。だから部品にする。
 */
import * as React from 'react';
import { cn } from '../utils';

/**
 * `YYYY-MM-DD...` を `YYYY/MM/DD` にする。`shared/src/client/format.ts` と同じ規則。
 *
 * `short` のときは `MM/DD` まで落とす。一覧の「実施日」列は横幅が
 * 96px しかなく、年まで出すと期間 (開始〜終了) が入りません。
 * **年を落としてよいのは、その一覧が期間で絞り込まれているときだけ**なので、
 * 既定は `full` のままにしてあります。
 */
function fmt(value: string | null | undefined, short: boolean): string | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return short ? `${m[2]}/${m[3]}` : `${m[1]}/${m[2]}/${m[3]}`;
  // すでに整形済みの文字列 (`5/12` など) はそのまま通す
  return String(value);
}

export interface DateRangeProps extends React.HTMLAttributes<HTMLSpanElement> {
  start: string | null | undefined;
  end: string | null | undefined;
  /**
   * 開始と終了が同じ日のとき、1つだけ出す (既定)。
   * 表の列で**必ず2つ分の幅を取りたい**ときは `false` にする。
   */
  collapseSameDay?: boolean;
  /** 値が無いときに出す文字。列の幅を保つため既定でも何か出す */
  placeholder?: string;
  /**
   * 年を落として `MM/DD` にする。**狭い列でだけ**使うこと
   * (一覧が期間で絞り込まれていないと、来年の予定と今年の予定が同じに見える)。
   */
  short?: boolean;
}

/**
 * 期間。**開始 / 区切り / 終了 が別の要素**なので、縦に並べたとき桁がそろう。
 *
 * ```tsx
 * <DateRange start={p.event_start} end={p.event_end} />
 * ```
 */
export function DateRange({
  start,
  end,
  collapseSameDay = true,
  placeholder = '—',
  short = false,
  className,
  ...rest
}: DateRangeProps) {
  const s = fmt(start, short);
  const e = fmt(end, short);

  if (!s && !e) {
    return (
      <span className={cn('font-number text-muted-foreground', className)} {...rest}>
        {placeholder}
      </span>
    );
  }

  // 同じ日なら1つだけ。「2026/05/12 〜 2026/05/12」は読み手の手間を増やすだけ
  if (collapseSameDay && s && e && s === e) {
    return (
      <span className={cn('font-number whitespace-nowrap', className)} {...rest}>
        {s}
      </span>
    );
  }

  return (
    <span
      className={cn('font-number inline-flex items-baseline gap-1 whitespace-nowrap', className)}
      {...rest}
    >
      <span>{s ?? placeholder}</span>
      {/* 区切りは読み上げに要らないので隠す。薄くして日付を主役にする */}
      <span className="opacity-55" aria-hidden="true">〜</span>
      <span>{e ?? placeholder}</span>
    </span>
  );
}
