export type CgStep =
  | 'idle'
  | 'title'
  | 'nominees'
  | 'ranks52'
  | 'winner-bar'
  | 'oneshot';

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
  photo?: string;
  role?: string;
  is_winner?: boolean;
}

export type OneshotStyle = 'classic' | 'shards' | 'spotlight' | 'slit';

export interface CgEntry {
  id: number;
  rank: number | null;
  name: string;
  name_en: string | null;
  org: string | null;
  org_en: string | null;
  points: number | null;
  own_points: number | null;
  photo_url: string | null;
  is_winner: boolean;
}

export interface CgCategory {
  id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  entries: CgEntry[];
}

export interface CgCueState {
  step: CgStep;
  categoryId: number | null;
  oneshotStyle: OneshotStyle;
}

// Canvas dimensions
export const CG_W = 1920;
export const CG_H = 1080;

// Animation timing (ms)
export const STRIP_SETTLE = 800;
export const BAR_INTERVAL = 1100;
export const PHOTO_OFFSET = 280;
export const FADE_DURATION = 600;
