export type ModuleKey =
  | 'title'
  | 'respect'
  | 'skills'
  | 'comment'
  | 'members'
  | 'recComment'
  | 'none';

export type Lang = 'ja' | 'en';

export interface NomineeMember {
  name: string;
  company: string;
  role: string;
}

export interface NomineeRecommender {
  name: string;
  nameEn: string;
  company: string;
  companyEn: string;
  position: string;
  positionEn: string;
  respect: string;
  respectEn: string;
  respectComment: string;
  respectCommentEn: string;
}

export interface Nominee {
  id: string;
  type: 'individual' | 'team';
  category: string;
  categoryEn: string;
  subcategory: string;
  subcategoryEn: string;
  entryNo: string;
  image: string;
  name: string;
  nameEn: string;
  nameKana?: string;
  company: string;
  companyEn: string;
  department: string;
  departmentEn: string;
  position?: string;
  positionEn?: string;
  location?: string;
  locationEn?: string;
  joinDate?: string;
  ism: string;
  ismEn: string;
  skills: string[];
  skillsEn: string[];
  title: string;
  titleEn: string;
  comment: string;
  commentEn: string;
  // team only
  projectName?: string;
  projectNameEn?: string;
  projectKana?: string;
  teamSize?: number;
  members?: NomineeMember[] | null;
  membersEn?: NomineeMember[] | null;
  recommender: NomineeRecommender;
}

export interface TickerItem {
  name: string;
  company: string;
}

/** 賞内の 1 部門 (ティッカーの 1 ローテーション単位) */
export interface TickerDivision {
  division: string;
  items: TickerItem[];
}

/** 賞単位のティッカーカテゴリ。1賞内の全部門を順番にループ表示する。 */
export interface TickerCategory {
  /** 賞名 (e.g., '新人賞' / 'Rookie Award') */
  award: string;
  /** 賞内の部門配列。1ループ完走後に次の部門にローテーションする。 */
  divisions: TickerDivision[];
}

export interface OneShotCueState {
  entryId: number | null;
  moduleKey: ModuleKey;
  tickerOn: boolean;
  tickerCatIdx: number;
  transparent: boolean;
  lang: Lang;
  isLive: boolean;
  /** v2.8.70+: 画像 (Portrait) を表示するか。OFF の場合は左 168px の画像エリアを畳んだ単列レイアウトになる */
  showPortrait: boolean;
}
