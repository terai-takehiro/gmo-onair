import type { Nominee } from '../types';
import { SEED_NOMINEES } from '../data/seedNominees';

// awards_entries 行 (oneshot_data 込み) を 1S CG が描画する Nominee 形に正規化。
// oneshot_data に必要なフィールドが入っていればそれを優先、不足分はテーブル基本列から補完。
// oneshot_data が空なら seed フォールバックを使う (動作確認用)。

export interface AwardsEntryRow {
  id: number;
  category_id: number;
  rank: number | null;
  name: string;
  name_en: string | null;
  org: string | null;
  org_en: string | null;
  photo_url: string | null;
  oneshot_data: Partial<Nominee> | null;
}

export interface AwardsCategoryRow {
  id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  display_order?: number;
  entries: AwardsEntryRow[];
}

interface OneShotEvent {
  id: number;
  name: string;
  subtitle: string | null;
  categories: AwardsCategoryRow[];
}

/** Build a list of Nominee objects from server `/oneshot/output` payload.
 *  Falls back to SEED_NOMINEES when no entries have oneshot_data populated. */
export function mapEventToNominees(event: OneShotEvent | null | undefined): Nominee[] {
  if (!event) return SEED_NOMINEES;

  const all: Nominee[] = [];
  for (const cat of event.categories) {
    for (const e of cat.entries) {
      const od = e.oneshot_data ?? null;
      if (!od) continue;

      const fallbackId = `entry-${e.id}`;
      const merged: Nominee = {
        id: od.id ?? fallbackId,
        type: od.type ?? 'individual',
        category: od.category ?? cat.description ?? cat.name,
        categoryEn: od.categoryEn ?? cat.description_en ?? cat.name_en ?? '',
        subcategory: od.subcategory ?? cat.name,
        subcategoryEn: od.subcategoryEn ?? cat.name_en ?? '',
        entryNo: od.entryNo ?? String(e.rank ?? e.id).padStart(2, '0'),
        image: od.image ?? e.photo_url ?? '',
        name: od.name ?? e.name,
        nameEn: od.nameEn ?? e.name_en ?? '',
        nameKana: od.nameKana,
        company: od.company ?? e.org ?? '',
        companyEn: od.companyEn ?? e.org_en ?? '',
        department: od.department ?? '',
        departmentEn: od.departmentEn ?? '',
        position: od.position,
        positionEn: od.positionEn,
        location: od.location,
        locationEn: od.locationEn,
        joinDate: od.joinDate,
        ism: od.ism ?? '',
        ismEn: od.ismEn ?? '',
        skills: od.skills ?? [],
        skillsEn: od.skillsEn ?? [],
        title: od.title ?? '',
        titleEn: od.titleEn ?? '',
        comment: od.comment ?? '',
        commentEn: od.commentEn ?? '',
        projectName: od.projectName,
        projectNameEn: od.projectNameEn,
        projectKana: od.projectKana,
        teamSize: od.teamSize,
        members: od.members ?? null,
        membersEn: od.membersEn ?? null,
        recommender: od.recommender ?? {
          name: '', nameEn: '',
          company: '', companyEn: '',
          position: '', positionEn: '',
          respect: '', respectEn: '',
          respectComment: '', respectCommentEn: '',
        },
      };
      all.push(merged);
    }
  }

  // どのエントリにも oneshot_data が無ければ seed を返す
  return all.length > 0 ? all : SEED_NOMINEES;
}

/** Build map: nominee.id (string) → DB entry id. */
export function findEntryIdForNominee(entries: AwardsEntryRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.oneshot_data?.id) map.set(e.oneshot_data.id, e.id);
    map.set(`entry-${e.id}`, e.id);
  }
  return map;
}
