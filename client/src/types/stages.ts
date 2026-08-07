/**
 * 案件のステージ (v4)
 *
 * `types/index.ts` から切り出したもの。**モックが v4 の正**なので、
 * 記号・名前・色はモック (`docs/design/v4/mockups/onair-data.js`) の値に合わせている。
 * `index.ts` から再エクスポートしているので、読む側の import は変わらない。
 */
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

// 正式名。**記号はモックに合わせてある** — A〜E は受注に近い順で E は問合せ (DB は `neta`)。
// 完了・失注は記号なし。**DB の値は変えていない** (画面の名前だけ)。詳細 `projectList/stages.ts`
export const ProjectStageLabels: Record<ProjectStage, string> = {
  neta: 'E 問合せ',
  d_hold: 'D 仮押さえ',
  c_proposal: 'C 見積提案',
  b_verbal: 'B 口頭決定',
  a_won: 'A 受注済',
  s_completed: '完了',
  e_lost: '失注',
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
