/**
 * Wiki の AI — 画面と形を合わせる型（`shared/src/wiki/types.ts` の §7 の節と対）。
 *
 * ⚠️ **意図的な複製です。** サーバーはルートの `shared/`（`@gmo-onair/shared`）を
 * import できません（`server/tsconfig.json` の `rootDir: ./src`）。
 * `wiki-markdown.ts`・`wiki-search-score.ts` と同じ理由で、
 * **画面と同じ答えが要るものだけ**を写しています。
 *
 * ⚠️ 片方だけ直さないこと。形が食い違うと、画面が受け取った JSON を描けません。
 */

/** 3値のフィードバック（§7-3 条件2。対話は「直される」ものではないので3値） */
export type WikiAiFeedback = 'good' | 'rephrase' | 'reject';

/** 出典（§7-1 ②）。`quote` は材料の写しで、要約ではない */
export interface WikiCitation {
  pageId: string;
  title?: string;
  heading: string | null;
  quote: string;
}

/** 出典つきで答えたか、書かれていないと返したか（§10 の判断8） */
export type WikiAnswerConfidence = 'cited' | 'none';

/** 「AI で整える」のやり方。主な使い方は structure（手入力のメモ → 手順書の形） */
export const WIKI_TIDY_MODES = ['structure', 'heading', 'bullets', 'terms', 'shorten'] as const;
export type WikiTidyMode = (typeof WIKI_TIDY_MODES)[number];

/** 足りないページの状態（§7-2） */
export const WIKI_GAP_STATUSES = ['open', 'written', 'dismissed'] as const;
export type WikiGapStatus = (typeof WIKI_GAP_STATUSES)[number];
