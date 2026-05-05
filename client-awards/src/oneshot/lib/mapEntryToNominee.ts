import type { Nominee } from '../types';
import { SEED_NOMINEES } from '../data/seedNominees';

// awards_entries 行 (oneshot_data 任意) を 1S CG が描画する Nominee 形に正規化。
// oneshot_data があればそれを優先、無ければテーブル基本列 (name / org / photo_url / rank)
// から最低限の Nominee を組み立てる。これにより既存のランキングCG向けに登録済みの
// エントリも 1S CG で即座に表示される。
// イベント自体に entries が 0 件なら seed フォールバック (動作確認用)。

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

const EMPTY_RECOMMENDER = {
  name: '', nameEn: '',
  company: '', companyEn: '',
  position: '', positionEn: '',
  respect: '', respectEn: '',
  respectComment: '', respectCommentEn: '',
};

/** Build a list of Nominee objects from the `/oneshot/output` (or `/oneshot/state`)
 *  payload. Every DB entry produces a Nominee — oneshot_data fields override the
 *  base columns when present. Returns SEED_NOMINEES only when the event has zero
 *  entries (fresh event, no data yet). */
export function mapEventToNominees(event: OneShotEvent | null | undefined): Nominee[] {
  if (!event) return SEED_NOMINEES;

  const all: Nominee[] = [];
  for (const cat of event.categories) {
    for (const e of cat.entries) {
      if (!e.name && !e.oneshot_data) continue;
      const od = e.oneshot_data ?? {};
      // The DB id is the source of truth for cue.entryId lookup. We always use
      // `entry-${e.id}` regardless of whatever od.id may say.
      const id = `entry-${e.id}`;

      const merged: Nominee = {
        id,
        type: od.type ?? 'individual',
        category: od.category ?? cat.description ?? cat.name,
        categoryEn: od.categoryEn ?? cat.description_en ?? cat.name_en ?? cat.name,
        subcategory: od.subcategory ?? cat.name,
        subcategoryEn: od.subcategoryEn ?? cat.name_en ?? cat.name,
        entryNo: od.entryNo ?? String(e.rank ?? e.id).padStart(2, '0'),
        image: od.image ?? e.photo_url ?? '',
        name: od.name ?? e.name,
        nameEn: od.nameEn ?? e.name_en ?? e.name,
        nameKana: od.nameKana,
        company: od.company ?? e.org ?? '',
        companyEn: od.companyEn ?? e.org_en ?? e.org ?? '',
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
        title: od.title ?? e.name,
        titleEn: od.titleEn ?? e.name_en ?? e.name,
        comment: od.comment ?? '',
        commentEn: od.commentEn ?? '',
        projectName: od.projectName,
        projectNameEn: od.projectNameEn,
        projectKana: od.projectKana,
        teamSize: od.teamSize,
        members: od.members ?? null,
        membersEn: od.membersEn ?? null,
        recommender: od.recommender ?? EMPTY_RECOMMENDER,
      };
      all.push(merged);
    }
  }

  return all.length > 0 ? all : SEED_NOMINEES;
}

/** Extract DB entry id (integer) from a Nominee.id of the form `entry-<n>`.
 *  Returns null for seed (non-DB) nominees. */
export function nomineeDbId(nominee: { id: string } | null | undefined): number | null {
  if (!nominee) return null;
  const m = nominee.id.match(/^entry-(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}
