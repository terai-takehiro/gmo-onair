import { create } from 'zustand';
import type { CgCueState, CgCategory, CgSurvey } from './types';

interface AwardsStore {
  cue: CgCueState;
  categories: CgCategory[];
  surveys: CgSurvey[];
  setCue: (cue: Partial<CgCueState>) => void;
  setCategories: (cats: CgCategory[]) => void;
  setSurveys: (surveys: CgSurvey[]) => void;
}

export const DEFAULT_CUE: CgCueState = {
  step: 'idle',
  categoryId: null,
  oneshotStyle: 'classic',
  voteDisplay: 'count',
  pollStartedAt: null,
  revealPhase: 0,
  winnerEntryId: null,
};

export const useAwardsStore = create<AwardsStore>((set) => ({
  cue: { ...DEFAULT_CUE },
  categories: [],
  surveys: [],
  setCue: (partial) =>
    set((s) => ({ cue: { ...s.cue, ...partial } })),
  setCategories: (cats) => set({ categories: cats }),
  setSurveys: (surveys) => set({ surveys }),
}));
