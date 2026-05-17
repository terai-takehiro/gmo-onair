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
  | 'vote-reveal';

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
export const POLL_DURATION_MS = 30_000;
export const POLL_REVERT_DELAY_MS = 3_000;
