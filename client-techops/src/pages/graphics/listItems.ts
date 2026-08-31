// テロップCG — 一覧表部品の項目配列（`fields.items`）の型と正規化。
//
// `GraphicsPageRow.fields` は `Record<string, unknown>` なので、一覧の項目は JSON 配列を
// 1キーに持たせるだけでよい（サーバー側スキーマ変更・migration 不要 — scoreEntries.ts /
// voteChoices.ts と同じ設計）。対戦者/選択肢と違い構造体（{name,points}等）は要らない
// — 一覧の項目は文字列1本（氏名など）で足りるため、この配列は `string[]` のまま。
export const LIST_ITEMS_KEY = 'items';

/** 項目数の目安上限。outputPartsExtra.tsx の MAX_LIST_ITEMS と揃えてある
 *  （超過分は出力側で「ほか N名」に畳まれるため、入力自体は止めない） */
export const DEFAULT_MAX_LIST_ITEMS = 20;

/** 1件あたりの文字数の目安上限（pageFields.ts の list 定義コメント参照） */
export const DEFAULT_ITEM_LIMIT = 10;

/** 未知の値（DB から読んだ `fields.items` 生値）を安全な配列へ正規化する */
export function normalizeListItems(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x : x == null ? '' : String(x)));
}

/** 新規作成時の初期項目（空欄3件。並べ替え/追加/削除の操作感が最初の画面で分かるように） */
export function defaultListItems(): string[] {
  return ['', '', ''];
}
