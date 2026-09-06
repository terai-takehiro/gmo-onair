// 列（会場・支度・運営）の色。14-schedule-v2-plan.md §3 A1
//
// 任意の色ピッカーは作らない（§2「削るもの」）。固定の6色＋「色なし」だけ。
// 保存形式は区分（`shared/src/schedule/kinds.ts`）と同じ **`#` なしの6桁**。
// `studio_rooms.color` は `#3b82f6` のように `#` 付きで入っているので、
// 読むときは `cssColor()` で両方を受ける。
export interface ColumnColorDef { value: string; label: string }

export const COLUMN_COLORS: ColumnColorDef[] = [
  { value: "3B82F6", label: "青" },
  { value: "10B981", label: "緑" },
  { value: "F59E0B", label: "橙" },
  { value: "EF4444", label: "赤" },
  { value: "8B5CF6", label: "紫" },
  { value: "6B7280", label: "灰" },
];

/** DB の値（`#` 有無どちらでも）→ CSS の色。空なら null */
export function cssColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  return v.startsWith("#") ? v : `#${v}`;
}

/** `studio_rooms.color`（`#` 付き）→ 保存形式（`#` なし・大文字） */
export function normalizeColor(value: string | null | undefined): string | null {
  const css = cssColor(value);
  return css ? css.slice(1).toUpperCase() : null;
}
