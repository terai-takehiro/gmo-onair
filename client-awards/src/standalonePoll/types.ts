export interface PollChoice {
  name: string;
  nameEn: string;
  company: string;
  companyEn: string;
  photoDataUrl: string | null; // 画像なしも OK (null)
  voteCount: number;
}

export type PollStep = 'idle' | 'poll' | 'reveal' | 'winner';

export interface StandalonePollState {
  title: string;
  titleEn: string;
  question: string;
  questionEn: string;
  choices: PollChoice[]; // 3 件想定
  step: PollStep;
  pollStartedAt: number | null;
  display: 'count' | 'percent';
  revealPhase: 0 | 1 | 2;
  lang: 'ja' | 'en';
}

export const DEFAULT_POLL: StandalonePollState = {
  title: '余興投票',
  titleEn: 'Bonus Vote',
  question: 'Q. もっともふさわしいのは？',
  questionEn: 'Q. Who deserves it?',
  choices: [
    { name: '選択肢A', nameEn: 'Choice A', company: '', companyEn: '', photoDataUrl: null, voteCount: 0 },
    { name: '選択肢B', nameEn: 'Choice B', company: '', companyEn: '', photoDataUrl: null, voteCount: 0 },
    { name: '選択肢C', nameEn: 'Choice C', company: '', companyEn: '', photoDataUrl: null, voteCount: 0 },
  ],
  step: 'idle',
  pollStartedAt: null,
  display: 'count',
  revealPhase: 0,
  lang: 'ja',
};

export const POLL_DURATION_MS = 60_000;
export const POLL_REVERT_DELAY_MS = 3_000;
