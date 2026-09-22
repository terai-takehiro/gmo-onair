/**
 * `/wiki/transfer` の選択欄の見た目（書き出しと取り込みで同じもの）
 *
 * `<select>` は素で使います（この製品の `Select` は Radix で、選ぶだけの欄には重い。
 * `components/page/PageCreateSheet.tsx` と同じ判断）。**スマホで 44px**（`min-h-tap`）、
 * PC では 40px に締めます。
 */
export const FIELD_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground lg:h-10 lg:min-h-0';
