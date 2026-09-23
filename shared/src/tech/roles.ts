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

/**
 * 役職の略号の正式名称（**確かなものだけ**。画面では略号の `title` と小さな補足に出す）。
 * `CA` は §13-3 の決定で「カメラアシスタント」。意味の確定していない略号
 * （`CAM-A`・`CA-A`・`LD-A`・`PA MIX`・`3Play`・`TP`・`Dv`）は載せない——推測で書いた名前が
 * 画面に出ると、それが正しいように見えてしまう。`配信管理` は略号ではないので要らない。
 */
export const TECH_ROLE_NAMES: Readonly<Record<string, string>> = {
  SW: 'スイッチャー',
  CAM: 'カメラ',
  CA: 'カメラアシスタント',
  VE: 'ビデオエンジニア',
  MIX: '音声',
  AUD: '音声',
  LD: '照明',
  PA: '場内音響',
};

/** 役職の正式名称（無ければ空文字） */
export function roleName(role: string): string {
  return TECH_ROLE_NAMES[role] ?? '';
}
