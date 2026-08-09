/**
 * 行の立ち上がり（v4 案件一覧・指示書 6-1）
 *
 * **新しく現れた行だけ**を 8px 下からフェードインさせます。動きそのものは
 * `tokens-v4.css` の `[data-row-in]` が持ち、ここは「どの行に付けるか」だけ。
 * 判定（どれが新しいか）は `client-v4/flip.ts` の `isNew()` です。
 */
import type * as React from 'react';

/**
 * 並びの中での位置と、**この更新で新しく現れたか**（`client-v4/flip.ts`）。
 * 新しい行だけ 8px 下からフェードインさせ、**1行 18ms ずらして**立ち上げます。
 * 元から居た行を一緒にフェードさせると、絞り込むたびに一覧全体が明滅します。
 */
export interface RowAnim { index: number; isNew: boolean }

/** `data-row-in` と順番。渡されなければ何も付けない（動かさない） */
export function rowInProps(row?: RowAnim): Record<string, unknown> {
  if (!row?.isNew) return {};
  return { 'data-row-in': '', style: { '--v4-row': row.index } as React.CSSProperties };
}
