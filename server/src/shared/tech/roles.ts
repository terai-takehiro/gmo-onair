/**
 * 技術スタッフの役職（メンバー表 37 枚の語をそのまま・典型の並び順）。設計: docs/design/v4/tech-docs.md §4-5
 * 画面の候補と、並べ替えの既定順に使う。「社内業務」は研修用なので候補に出さない。
 */
export const TECH_ROLES = [
  'SW', 'CAM', 'CAM-A', 'MIX', 'AUD', 'CA', 'CA-A', 'VE', 'LD', 'LD-A', 'PA', 'PA MIX', '配信管理', '3Play', 'TP', 'Dv',
] as const;

export type TechRole = (typeof TECH_ROLES)[number];

/** 役職の既定順（一覧に無い役職は末尾） */
export function roleOrder(role: string): number {
  const i = (TECH_ROLES as readonly string[]).indexOf(role);
  return i < 0 ? TECH_ROLES.length : i;
}
