/**
 * 案件台帳の「表に出す形」— 長い名前の切り詰めと、並べ替えの押し方
 *
 * **画面の物を1つも import しません**（`csv.ts` と同じ理由 — 試験からそのまま読める）。
 */

/**
 * 表に出す案件名の上限（ご指示）。
 *
 * ⚠️ **CSS の `…` だけに任せていません。** 幅で切ると、同じ列でも
 * **端末と書体で切れる位置が変わり**、行によって出る文字数がばらばらになります。
 * 文字数で切れば**どの端末でも同じところで切れる**ので、
 * 「どこまで読めるか」が読む人にとって一定になります。
 */
export const NAME_MAX_CHARS = 20;

/**
 * 長い名前を `…` で切る。**切ったかどうかも返します** —
 * 呼ぶ側が「全文はマウスを当てれば出る」ことを伝えるために要ります
 * （切れているのに何も言わないと、それが正式な名前だと読まれます）。
 *
 * ⚠️ **サロゲートペア（絵文字・一部の漢字）を割らない。** `slice` で切ると
 * **文字が半分になって化けます**。`[...s]` で数え直します。
 */
export function truncateName(name: string, max = NAME_MAX_CHARS): {
  text: string; cut: boolean;
} {
  const chars = [...(name ?? '')];
  if (chars.length <= max) return { text: name ?? '', cut: false };
  return { text: `${chars.slice(0, max).join('')}…`, cut: true };
}

// ───────────────────────────────────────────────────────
// 並べ替え
// ───────────────────────────────────────────────────────

export interface SortState {
  /** `GET /projects` の `sort_by`。空なら「おすすめ順」（サーバーの既定） */
  by: string;
  dir: 'asc' | 'desc';
}

export const DEFAULT_SORT: SortState = { by: '', dir: 'desc' };

/**
 * 表頭を押したときの次の状態。**同じ列を押すと 昇順 → 降順 → 既定 の3段**で回します。
 *
 * ⚠️ **3段目（既定に戻る）を必ず置くこと。** 昇順と降順の2段だけだと、
 * **一度押したら元の並びに戻せません** — 元の並び（おすすめ順）は
 * 「次に手を打つべき順」で、この画面でいちばんよく使う並びです。
 */
export function nextSort(cur: SortState, key: string): SortState {
  if (cur.by !== key) return { by: key, dir: 'asc' };
  if (cur.dir === 'asc') return { by: key, dir: 'desc' };
  return { ...DEFAULT_SORT };
}

/**
 * 表頭に出す印。読み上げ（`aria-sort`）にも使う。
 *
 * ⚠️ **空の鍵は必ず「印なし」。** 並べ替えられない列は鍵を持たない（`''`）ので、
 * 素朴に `cur.by === key` と書くと、**既定（`by: ''`）に戻した瞬間に
 * 並べ替えられない列すべてに矢印が出ます**（実ブラウザで踏んだ —
 * 案件名を3回押して既定に戻したら、案件分類に降順の矢印が付いていた）。
 * 押しても何も起きない列が「いま並べ替えている列」に見えるので、いちばん困ります。
 */
export function sortMark(cur: SortState, key: string): 'asc' | 'desc' | null {
  if (!key || !cur.by) return null;
  return cur.by === key ? cur.dir : null;
}

/**
 * 並べ替えの説明。⚠️ **「五十音順」と言い切らないこと** —
 * 漢字は読みを持っていないので五十音では並びません（`japanese-sort.ts` に実測）。
 */
export const JA_SORT_NOTE = 'かな・カナは あいうえお 順で並びます（漢字は読みを持っていないので字の順です）';

/** 名前として並べる列（説明を出す先）。サーバーの `JAPANESE_SORT_KEYS` と対 */
export const JA_SORT_KEYS = ['name', 'customer', 'assigned_to'];
