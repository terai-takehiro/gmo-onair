// リアルタイムCG のイベント編集の型と小さな計算 — v2.9.295 で EventEditorPage.tsx から切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。

// ── Types ───────────────────────────────────────────────────
export interface Entry {
  id: number;
  rank: number | null;
  name: string;
  name_en: string | null;
  org: string | null;
  org_en: string | null;
  image_id: string | null;
  points: number | null;
  own_points: number | null;
  nomination_title: string | null;
  nomination_title_en: string | null;
  photo_url: string | null;
  is_winner: boolean;
}

export interface Category {
  id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  display_order: number;
  award_pattern?: 'direct' | 'vote';
  poll_title?: string | null;
  poll_title_en?: string | null;
  poll_question?: string | null;
  poll_question_en?: string | null;
  entries: Entry[];
}

export type CategoryPatch = Partial<Pick<Category,
  'name' | 'name_en' | 'description' | 'description_en' |
  'award_pattern' | 'poll_title' | 'poll_title_en' | 'poll_question' | 'poll_question_en'
>>;

export interface AwardsEventDetail {
  id: number;
  name: string;
  subtitle: string | null;
  description: string | null;
  scheduled_at: string | null;
  status: 'draft' | 'live' | 'closed';
  categories: Category[];
}

export interface AwardGroup {
  name: string;
  nameEn: string | null;
  divisions: Category[];
}

export function groupByAward(categories: Category[]): AwardGroup[] {
  const map = new Map<string, Category[]>();
  const order: string[] = [];
  for (const cat of categories) {
    if (!map.has(cat.name)) { map.set(cat.name, []); order.push(cat.name); }
    map.get(cat.name)!.push(cat);
  }
  return order.map((name) => {
    const divisions = map.get(name)!;
    const nameEn = divisions.find((d) => d.name_en?.trim())?.name_en ?? null;
    return { name, nameEn, divisions };
  });
}

export function computeReorderPayload(groups: AwardGroup[]) {
  let i = 1;
  return groups.flatMap((g) => g.divisions.map((d) => ({ id: d.id, displayOrder: i++ })));
}

export const STATUS_OPTIONS = [
  { value: 'draft',  label: '準備中' },
  { value: 'live',   label: 'LIVE中' },
  { value: 'closed', label: '終了' },
] as const;
