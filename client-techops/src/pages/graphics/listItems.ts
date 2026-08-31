// テロップCG — 一覧表部品の項目配列（`fields.items`）の型と正規化。
//
// `GraphicsPageRow.fields` は `Record<string, unknown>` なので、一覧の項目は JSON 配列を
// 1キーに持たせるだけでよい（サーバー側スキーマ変更・migration 不要 — scoreEntries.ts /
// voteChoices.ts と同じ設計）。多言語対応（`?lang=en`・graphics-awards-migration-plan.md
// §2-2の7番）のため、対戦者/選択肢と同じ発想で項目ごとに英語版を持てる構造体配列にした
// （旧: 文字列1本の配列だったが「bilingual の概念がそもそも無い」制約を解いた）。
export interface ListItem {
  text: string;
  /** 英語版（任意）。出力の `?lang=en` で優先表示・未入力なら `text` へフォールバック */
  textEn?: string;
}

export const LIST_ITEMS_KEY = 'items';

/** 項目数の目安上限。outputPartsExtra.tsx の MAX_LIST_ITEMS と揃えてある
 *  （超過分は出力側で「ほか N名」に畳まれるため、入力自体は止めない） */
export const DEFAULT_MAX_LIST_ITEMS = 20;

/** 1件あたりの文字数の目安上限（pageFields.ts の list 定義コメント参照） */
export const DEFAULT_ITEM_LIMIT = 10;

function toItem(v: unknown): ListItem | null {
  // レガシー形式（旧: string[]）: DB に今も残っている行を安全に読む後方互換
  if (typeof v === 'string') return { text: v, textEn: '' };
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text : '';
  const textEn = typeof o.textEn === 'string' ? o.textEn : '';
  return { text, textEn };
}

/** 未知の値（DB から読んだ `fields.items` 生値）を安全な配列へ正規化する。
 *  要素が文字列（レガシー）でもオブジェクト（{text,textEn}）でも読める。
 *  どちらでもない値は無視する */
export function normalizeListItems(v: unknown): ListItem[] {
  if (!Array.isArray(v)) return [];
  return v.map(toItem).filter((it): it is ListItem => it !== null);
}

/** 新規作成時の初期項目（空欄3件。並べ替え/追加/削除の操作感が最初の画面で分かるように） */
export function defaultListItems(): ListItem[] {
  return [{ text: '', textEn: '' }, { text: '', textEn: '' }, { text: '', textEn: '' }];
}
