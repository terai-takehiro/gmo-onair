/**
 * 案件のステージ (v4)
 *
 * `types/index.ts` から切り出したもの。`index.ts` から再エクスポートしているので、
 * 読む側の import は変わらない。
 *
 * **正式名の正は `shared/src/constants/statuses.ts` の `PROJECT_STAGE`**
 * (docs/core-redesign-plan.md §3-7)。以前はここがモックの値
 * (「E 問合せ」「完了」) を独自に持ち、shared・MCP と3様に食い違っていた。
 * ラベルを変えたいときは shared 側を直すこと — ここは写しではなく参照。
 * 色・確度はモック (`docs/design/v4/mockups/onair-data.js`) の実測値のまま。
 */
import { PROJECT_STAGE } from '@gmo-onair/shared/src/constants/statuses';

// 統合ステージ (ヨミ〜案件終了まで一本化)
export const ProjectStage = {
  NETA: 'neta',
  D_HOLD: 'd_hold',
  C_PROPOSAL: 'c_proposal',
  B_VERBAL: 'b_verbal',
  A_WON: 'a_won',
  S_COMPLETED: 's_completed',
  E_LOST: 'e_lost',
} as const;
export type ProjectStage = (typeof ProjectStage)[keyof typeof ProjectStage];

// 正式名。**shared の `PROJECT_STAGE` を参照する**（書き写すと必ずずれる —
// 実際に4系統へ分裂していた）。一覧バッジの和文短縮だけは `projectList/stages.ts`
export const ProjectStageLabels: Record<ProjectStage, string> = {
  neta: PROJECT_STAGE.neta.label,
  d_hold: PROJECT_STAGE.d_hold.label,
  c_proposal: PROJECT_STAGE.c_proposal.label,
  b_verbal: PROJECT_STAGE.b_verbal.label,
  a_won: PROJECT_STAGE.a_won.label,
  s_completed: PROJECT_STAGE.s_completed.label,
  e_lost: PROJECT_STAGE.e_lost.label,
};

// グラフ・じょうごの色。**モックの実測値** (`onair-data.js` の `pmStages`)
export const ProjectStageColors: Record<ProjectStage, string> = {
  neta: '#cbd2da',
  d_hold: '#a6ceeb',
  c_proposal: '#4a9fd8',
  b_verbal: '#005bac',
  a_won: '#197a4b',
  s_completed: '#5d6470',
  e_lost: '#c7243a',
};

export const ProjectStageProbability: Record<ProjectStage, number> = {
  neta: 0, d_hold: 20, c_proposal: 40,
  b_verbal: 80, a_won: 100, s_completed: 100, e_lost: 0,
};

export const PROJECT_STAGES = Object.entries(ProjectStageLabels).map(([value, label]) => ({
  value: value as ProjectStage,
  label,
  color: ProjectStageColors[value as ProjectStage],
  probability: ProjectStageProbability[value as ProjectStage],
}));
