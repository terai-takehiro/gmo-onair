/**
 * 名前を五十音で並べる（案件台帳の「あいうえお順」）
 *
 * ── なぜ素の ORDER BY では駄目か（実測）────────────────────
 *
 * この DB の照合順序は `C.UTF-8`＝**文字コード順**です。ひらがなとカタカナは
 * Unicode の別の区画にあるので、**ひらがなで始まる名前が全部先、カタカナが全部後**
 * に固まります:
 *
 *   素の順   … あした / いちご / アサヒ / イロハ / カサ / ガス
 *   五十音   … アサヒ / あした / いちご / イロハ / カサ / ガス   ← `ja-x-icu`
 *
 * 「あ行を探しているのに、カタカナの会社が画面の下のほうにいる」ので、
 * **並べ替えたのに探せません**。
 *
 * ── ⚠️ 漢字は五十音では並びません ──────────────────────────
 *
 * `ja-x-icu` でも漢字は**読みではなく字の順**で並びます
 * （実測: 山田 → 浅田 → 大阪 → 東京。五十音なら おおさか → とうきょう →
 * やまだ → あさだ）。**読み（ふりがな）を持っていないので、どう並べても
 * 五十音にはできません。** 画面には「あいうえお順（かなのみ）」と書き、
 * 五十音順だと言い切らないこと。読みの列を足すのが先です。
 *
 * ── 使えない環境で 500 にしない ────────────────────────────
 *
 * `ja-x-icu` は Postgres が ICU 付きで作られていないと**存在しません**。
 * 決め打ちで書くと、その環境では**並べ替えを押した瞬間に一覧が 500**になります
 * （しかも押すまで誰も気づけません）。**1回だけ調べて憶えておき、
 * 無ければ素の順に落とします** — 並びが五十音でなくなるだけで、画面は動きます。
 */
import { queryOne } from '../../../shared/db/connection';

/** 調べた結果。`null` = まだ調べていない */
let hasIcu: boolean | null = null;

/**
 * `ja-x-icu` が使えるか。**1回だけ調べる**（毎回問い合わせると一覧が遅くなる）。
 * 調べること自体に失敗したら「無い」に倒す（動くほうへ倒す）。
 */
export async function japaneseCollationAvailable(): Promise<boolean> {
  if (hasIcu !== null) return hasIcu;
  try {
    const row = await queryOne(
      `SELECT 1 AS ok FROM pg_collation WHERE collname = 'ja-x-icu' LIMIT 1`
    ) as { ok?: number } | null;
    hasIcu = !!row;
  } catch {
    hasIcu = false;
  }
  return hasIcu;
}

/**
 * 並べ替えに使う式。名前の列にだけ付ける。
 *
 * **`column` は呼ぶ側が決めた固定の文字列だけを渡すこと**
 * （`SORT_COLUMN_MAP` の値）。利用者が送ってきた文字列を通さない。
 */
export function withJapaneseCollation(column: string, available: boolean): string {
  return available ? `${column} COLLATE "ja-x-icu"` : column;
}

/** 名前として五十音で並べる鍵（`SORT_COLUMN_MAP` の鍵） */
export const JAPANESE_SORT_KEYS = new Set(['name', 'customer', 'assigned_to']);

/** 試験から状態を消すため（本番では呼ばれない） */
export function __resetJapaneseCollationCache(): void {
  hasIcu = null;
}
