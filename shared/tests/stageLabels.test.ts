/**
 * ステージラベルの一本化 (docs/core-redesign-plan.md §3-7) — ズレたら落ちるテスト。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 案件ステージのラベルはかつて4系統 (shared / client の型 / 一覧バッジ / MCP) に
 * 分裂し、同じ `neta` が「ネタ」「E 問合せ」、同じ `s_completed` が
 * 「S 完了」「完了」「S 案件終了」と画面によって違う名前で出ていた。
 * 正は **`shared/src/constants/statuses.ts` の `PROJECT_STAGE` 1か所**。
 *
 *  - client の型 (`client/src/types/stages.ts`) は shared を **import** して
 *    組み立てるので原理的にずれない — ここでは「本当に参照している」ことを
 *    値の一致で確かめる（誰かがベタ書きに戻した日に落ちる）
 *  - MCP (`server/.../projects.tools.ts` の `STAGE_LABELS`) は server が shared を
 *    import できない (`server/tsconfig.json` の `rootDir`) ため**値の写し**。
 *    写しは必ずずれるので、ソースをテキストで読んで突き合わせる
 *  - 一覧バッジ (`projectList/stages.ts` の `STAGE_BADGE_LABEL`) は
 *    **表示上の短縮 (和文2〜4字・`TableBadge` の幅揃え) として意図的に別**。
 *    文字の一致は求めず、**鍵の集合だけ**を揃える
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_STAGE } from '../src/constants/statuses';
import { ProjectStageLabels, ProjectStage } from '../../client/src/types/stages';
import { STAGE_BADGE_LABEL } from '../../client/src/contexts/sales/pages/projectList/stages';

const STAGE_KEYS = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed', 'e_lost'];

/** MCP 側はモジュールごと import すると DB 依存を巻き込むので、ソースを読んで抜く */
function mcpStageLabels(): Record<string, string> {
  const src = readFileSync(
    join(__dirname, '..', '..', 'server', 'src', 'contexts', 'mcp', 'tools', 'projects.tools.ts'),
    'utf8',
  );
  const m = src.match(/const STAGE_LABELS: Record<string, string> = \{([\s\S]*?)\};/);
  expect(m, 'projects.tools.ts に STAGE_LABELS が見つからない (形を変えたらこのテストも直す)').toBeTruthy();
  const out: Record<string, string> = {};
  for (const pair of m![1].matchAll(/(\w+):\s*'([^']*)'/g)) out[pair[1]] = pair[2];
  return out;
}

describe('ステージラベルの一本化 (§3-7)', () => {
  it('決定した値: neta =「ネタ」・s_completed =「S 完了」', () => {
    expect(PROJECT_STAGE.neta.label).toBe('ネタ');
    expect(PROJECT_STAGE.s_completed.label).toBe('S 完了');
  });

  it('shared の PROJECT_STAGE が7ステージすべてを持つ', () => {
    expect(Object.keys(PROJECT_STAGE).sort()).toEqual([...STAGE_KEYS].sort());
  });

  it('client の ProjectStageLabels は shared と完全一致 (ベタ書きに戻したら落ちる)', () => {
    for (const key of STAGE_KEYS) {
      expect(ProjectStageLabels[key as ProjectStage], `stage=${key}`)
        .toBe(PROJECT_STAGE[key as keyof typeof PROJECT_STAGE].label);
    }
  });

  it('MCP の STAGE_LABELS (写し) は shared と完全一致', () => {
    const mcp = mcpStageLabels();
    expect(Object.keys(mcp).sort()).toEqual([...STAGE_KEYS].sort());
    for (const key of STAGE_KEYS) {
      expect(mcp[key], `stage=${key}`).toBe(PROJECT_STAGE[key as keyof typeof PROJECT_STAGE].label);
    }
  });

  it('一覧バッジ (意図的な和文短縮) も鍵の集合は同じ', () => {
    expect(Object.keys(STAGE_BADGE_LABEL).sort()).toEqual([...STAGE_KEYS].sort());
  });
});
