/**
 * 検索の絞り込み（スペース・タグ・担当・更新日）— 値と数え方
 *
 * 画面（PC の列・スマホのシート）が2つあるので、**何が既定か・いくつ効いているか・
 * 0件のときに何を名指しするか**をここに1つだけ置きます。2か所に書くと、
 * スマホの「効いている数」だけが数え漏らします（`MobileFilterBar` の注記）。
 *
 * **「状態」は置いていません。** 下書きはそもそも検索に出ず（§7-5）、
 * サーバーに渡せる絞り込み（`WikiSearchQuery`）にも状態はありません。
 * 押しても結果が変わらない操作を並べないための判断です。
 */
// スペースごとの件数は**サーバーが数えて返す**ようになったので（`counts`）、
// ここで当たり（`WikiSearchHit`）を数え直すことはありません。
import type { WikiSpace } from '@gmo-onair/shared/src/wiki/types';
import type { WikiUserBrief } from '@/components/page/pageOpsApi';

export interface WikiSearchFilters {
  /** スペース id。空はすべて */
  spaceId: string;
  /** タグ名（1つ）。空は指定なし */
  tag: string;
  /** 担当の `users.id`。空は指定なし */
  ownerId: string;
  /** 何日以内に更新されたもの。0 はすべて */
  withinDays: number;
}

export const EMPTY_FILTERS: WikiSearchFilters = { spaceId: '', tag: '', ownerId: '', withinDays: 0 };

/** 更新日の段。モック `Search.dc.html` と同じ3つ */
export const WITHIN_CHOICES: Array<[number, string]> = [
  [30, '30日'],
  [365, '1年'],
  [0, 'すべて'],
];

/** **既定から動いているものだけ**数える（常に数が付くと意味が消えます） */
export function activeFilterCount(f: WikiSearchFilters): number {
  return [f.spaceId, f.tag, f.ownerId, f.withinDays ? '1' : ''].filter(Boolean).length;
}

/**
 * 0件のときに「これを外すと出るかもしれない」と名指しするための文字列
 * （`NoSearchResults` の `activeFilters`）。
 */
export function activeFilterLabels(
  f: WikiSearchFilters,
  spaces: WikiSpace[] | undefined,
  users: WikiUserBrief[] | undefined,
): string[] {
  const out: string[] = [];
  if (f.spaceId) {
    const s = (spaces ?? []).find((v) => v.id === f.spaceId);
    out.push(`スペース: ${s?.name ?? f.spaceId}`);
  }
  if (f.tag) out.push(`タグ: ${f.tag}`);
  if (f.ownerId) {
    const u = (users ?? []).find((v) => v.id === f.ownerId);
    out.push(`担当: ${u?.name ?? f.ownerId}`);
  }
  if (f.withinDays) {
    const label = WITHIN_CHOICES.find(([d]) => d === f.withinDays)?.[1] ?? `${f.withinDays}日`;
    out.push(`更新日: ${label}以内`);
  }
  return out;
}

