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
  scrimOpacity: 0.72,
};

export const useAwardsStore = create<AwardsStore>((set) => ({
  cue: { ...DEFAULT_CUE },
  categories: [],
  surveys: [],
  // 中身が同じなら**同じものを返す** (新しい object を作らない)。
  // サーバーは再接続のたびに現在の cue をもう一度配るので、以前は
  // 「同じ内容の cue:sync」でも毎回新しい object になり、出ている絵の
  // 部品が全部描き直されていた — アニメーションの途中だと**演出が跳ねる**。
  // 送出中に絵が跳ねるのは事故として見えるので、ここで止める。
  setCue: (partial) =>
    set((s) => {
      const next = { ...s.cue, ...partial };
      const same = (Object.keys(next) as (keyof CgCueState)[]).every((k) => next[k] === s.cue[k]);
      return same ? s : { cue: next };
    }),
  setCategories: (cats) => set({ categories: cats }),
  setSurveys: (surveys) => set({ surveys }),
}));
