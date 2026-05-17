import { create } from 'zustand';
import type { CgCueState, CgCategory } from './types';

interface AwardsStore {
  cue: CgCueState;
  categories: CgCategory[];
  setCue: (cue: Partial<CgCueState>) => void;
  setCategories: (cats: CgCategory[]) => void;
}

export const DEFAULT_CUE: CgCueState = {
  step: 'idle',
  categoryId: null,
  oneshotStyle: 'classic',
  voteDisplay: 'count',
  pollStartedAt: null,
  revealPhase: 0,
};

export const useAwardsStore = create<AwardsStore>((set) => ({
  cue: { ...DEFAULT_CUE },
  categories: [],
  setCue: (partial) =>
    set((s) => ({ cue: { ...s.cue, ...partial } })),
  setCategories: (cats) => set({ categories: cats }),
}));
