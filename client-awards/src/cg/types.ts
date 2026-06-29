export type CgStep =
  | 'idle'
  | 'title'
  | 'nominees'
  | 'ranks52'
  | 'top3'
  | 'final-pitch'
  | 'winner-bar'
  | 'oneshot'
  | 'poll'
  | 'vote-reveal'
  | 'celebration'
  | 'survey-oneshot';   // v2.9.63: 連動アンケートの No.1 をフルスクリーン発表

/** v2.9.63: 連動アンケート (survey-oneshot 用)。/output が categories と並べて返す。 */
export interface CgSurveyChoice {
  position: number;
  name: string | null;
  name_en: string | null;
  company: string | null;
  company_en: string | null;
  photo_data_url: string | null;
  nomination_title: string | null;
  nomination_title_en: string | null;
  vote_count: number;
}
export interface CgSurvey {
  id: number;
  link_category_id: number;
  title: string;
  title_en: string | null;
  display: 'count' | 'percent';
  choice_count: number;
  choices: CgSurveyChoice[];
}

/** Normalised entry shape used by all CG render components. */
export interface CgMappedEntry {
  id: string;
  rank: number;
  name: string;
  nameEn?: string;
  company: string;
  orgEn?: string;
  points: number;
  ownPoints?: number;
  voteCount?: number;
  nominationTitle?: string;
  nominationTitleEn?: string;
  photo?: string;
  role?: string;
  is_winner?: boolean;
}

export type OneshotStyle = 'classic' | 'shards' | 'spotlight' | 'slit';

export type AwardPattern = 'direct' | 'vote';
export type VoteDisplay = 'count' | 'percent';

export interface CgEntry {
  id: number;
  rank: number | null;
  name: string;
  name_en: string | null;
  org: string | null;
  org_en: string | null;
  points: number | null;
  own_points: number | null;
  vote_count: number | null;
  nomination_title: string | null;
  nomination_title_en: string | null;
  oneshot_data: Record<string, unknown> | null;
  photo_url: string | null;
  is_winner: boolean;
}

export interface CgCategory {
  id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  award_pattern: AwardPattern;
  poll_title: string | null;
  poll_title_en: string | null;
  poll_question: string | null;
  poll_question_en: string | null;
  entries: CgEntry[];
}

export interface CgCueState {
  step: CgStep;
  categoryId: number | null;
  oneshotStyle: OneshotStyle;
  voteDisplay: VoteDisplay;
  pollStartedAt: number | null; // epoch ms; poll カウントダウン開始時刻
  revealPhase: 0 | 1 | 2 | 3;        // vote-reveal の内部フェーズ (0:shake / 1:grow / 2:winner)
  // 投票No.1決定(vote)でアンケート未紐づけのとき、operator が手動選択した No.1 のエントリ id。
  // null なら rank=1 / is_winner を No.1 として扱う (従来挙動)。
  winnerEntryId?: number | null;
  // v2.9.128: ランキング演出の半透明黒ベース (スクリム) の濃さ (0〜0.95、中心値)。
  // 操作画面のスライダーでライブ調整。未指定は 0.72 (v2.9.127 の中心値)。
  scrimOpacity?: number;
}

// Canvas dimensions
export const CG_W = 1920;
export const CG_H = 1080;

// Animation timing (ms)
export const STRIP_SETTLE = 800;
export const BAR_INTERVAL = 1100;
export const PHOTO_OFFSET = 280;
export const FADE_DURATION = 600;

// 投票演出
export const POLL_DURATION_MS = 60_000;
export const POLL_REVERT_DELAY_MS = 3_000;
