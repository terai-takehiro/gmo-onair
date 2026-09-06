/**
 * ② プロジェクト一覧の並び順（v4・GPM 一覧フォーマット統一 PR②・delta 4）
 *
 * `GpmProjectListPage.tsx` から独立させた純粋関数だけの置き場所。**UI
 * （`FilterBar.tsx` のプルダウン・`ProjectRows.tsx` の表頭クリック）の両方が
 * 同じ3値（`SortKey`）を触るので、値の定義と並べ替えのロジックを1か所にする
 * — 別々に持つと「表頭で並べ替えたのにプルダウンの表示が違う」が起きる
 * （案件一覧 `sales/pages/projectList/FilterBar.tsx` で実際に踏んだ形）。
 *
 * ── 案件一覧と違う簡略形にしてある理由 ──────────────────────
 *
 * 案件一覧の `sort` は `${sort_by}:${sort_dir}` の文字列で、列ごとに
 * 昇順・降順の両方を選べる。GPM は件数が数十件の規模で、プルダウンの選択肢も
 * 3つ（おすすめ順／見積金額が大きい順／期限が近い順）で足りているため、
 * 表頭クリックも**この3値をそのまま押しボタンにするだけ**にしてある。
 * 昇順・降順の3段トグルは作らない（選ぶ理由が無い逆順を増やさない、
 * という案件一覧の `SORT_OPTIONS` と同じ考え方）。
 */
import type { GpmProjectRow } from '../../types';
import { ymd } from '../../types';

export type SortKey = 'recommended' | 'estimate_desc' | 'due_asc';

/**
 * プルダウンの選択肢。**ラベルは `FilterBar` の固定幅の枠に1行で収まる長さ**にすること
 * （`SelectValue` は選んだ項目の文字をそのまま出すので、はみ出すと切れて読めない）。
 */
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recommended', label: 'おすすめ順' },
  { value: 'estimate_desc', label: '見積金額が大きい順' },
  { value: 'due_asc', label: '期限が近い順' },
];

/** 表頭のクリックで選べる列。プルダウンに無い列（プロジェクト名・状態など）は押せないままにする */
export const HEADER_SORT_KEYS = ['estimate_desc', 'due_asc'] as const satisfies readonly SortKey[];

/** 表頭がいまの並び順を担っているか（担っていれば矢印を常時出す） */
export function headerSortActive(sort: SortKey, key: SortKey): boolean {
  return sort === key;
}

/** 表頭を押したときの次の値。**同じ列をもう一度押すと「おすすめ順」に戻す**（2段トグル） */
export function nextHeaderSort(sort: SortKey, key: SortKey): SortKey {
  return sort === key ? 'recommended' : key;
}

/** 期限なしは末尾（無いことを「近い」とは見なさない）。null 同士・値同士はそれぞれ元の順を保つ */
export function compareDue(da: string | null, db: string | null, tie: number): number {
  if (da === db) return tie;
  if (da === null) return 1;
  if (db === null) return -1;
  return da < db ? -1 : 1;
}

/**
 * **「おすすめ順」は案件台帳の `sort_by=recommended` と同じ考え方で並べる**
 * （`server/.../project.service.ts` の `RECOMMENDED_SORT_SQL`）:
 * ① 停滞している案件を先に ② 期限が近い順。
 *
 * 「停滞」の判定は**サーバーが一覧の行に付けて返す `health`**
 * （`project-health.ts` の単一定義。終端・スヌーズ中・期限超過は 'stalled' に
 * ならない）をそのまま読む。
 */
function recommendedRank(p: GpmProjectRow): number {
  return p.health === 'stalled' ? 0 : 1;
}

export function sortRows(rows: GpmProjectRow[], sort: SortKey): GpmProjectRow[] {
  const withKey = rows.map((p, i) => ({ p, i }));
  if (sort === 'estimate_desc') {
    withKey.sort((a, b) => (b.p.estimate_amount ?? -1) - (a.p.estimate_amount ?? -1) || a.i - b.i);
  } else if (sort === 'due_asc') {
    withKey.sort((a, b) => compareDue(ymd(a.p.next_due), ymd(b.p.next_due), a.i - b.i));
  } else {
    withKey.sort((a, b) => {
      const rankDiff = recommendedRank(a.p) - recommendedRank(b.p);
      if (rankDiff !== 0) return rankDiff;
      return compareDue(ymd(a.p.next_due), ymd(b.p.next_due), a.i - b.i);
    });
  }
  return withKey.map((x) => x.p);
}
