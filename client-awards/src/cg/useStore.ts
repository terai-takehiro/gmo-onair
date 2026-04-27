import { create } from 'zustand';
import type { CgCueState, CgCategory } from './types';

interface AwardsStore {
  cue: CgCueState;
  categories: CgCategory[];
  setCue: (cue: Partial<CgCueState>) => void;
  setCategories: (cats: CgCategory[]) => void;
}

export const useAwardsStore = create<AwardsStore>((set) => ({
  cue: {
    step: 'idle',
    categoryId: null,
    oneshotStyle: 'classic',
  },
  categories: [],
  setCue: (partial) =>
    set((s) => ({ cue: { ...s.cue, ...partial } })),
  setCategories: (cats) => set({ categories: cats }),
}));
