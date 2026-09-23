import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

/*
 * 営業活動記録の AI 整形の修正記録（`ai_corrections`）— #727 の Codex 指摘。
 *
 * 一度直してから AI の値へ**全部戻した**保存で、`(全体) none` だけ積み直して
 * 前の保存の項目ごとの `fix`/`reject` を残すと、**同じ出力が「直した」と
 * 「無修正」の両方に数えられます**（`as_is_rate` とよく直される項目が両方狂う）。
 * 差分が無い回は、その出力の行を**項目名を問わず**全部消してから積むことを止める。
 */

const AI = {
  subject: '見学日程の打診',
  body_struct: null,
  next_action: '候補日を送る',
  next_action_date: '2026-09-30',
  key_points: [],
};

// 差分の分類と本文の構造は本物を使う（どちらも DB に触らない）
const aiCoverage = await loadTs('server/src/shared/services/ai-coverage.ts');
const activityStruct = await loadTs('server/src/shared/services/activity-struct.ts');

async function load() {
  const calls = { execute: [], recorded: [] };
  const mod = await loadTs('server/src/contexts/sales/services/activity-corrections.service.ts', {
    '../../../shared/db/connection': {
      async execute(sql, params) { calls.execute.push({ sql, params }); },
    },
    '../../../shared/services/ai-output.service': {
      async findLatestAiOutput() { return { id: 'out-1', payload: AI }; },
      async hasCorrections() { return false; },
      async recordCorrections(outputId, diffs) { calls.recorded.push({ outputId, diffs }); },
    },
    '../../../shared/services/ai-coverage': aiCoverage,
    '../../../shared/services/activity-struct': activityStruct,
  });
  return { mod, calls };
}

test('全部戻した保存は、その出力の行を項目名を問わず消してから (全体) none を積む', async () => {
  const { mod, calls } = await load();
  await mod.recordActivityCorrections('log-1', { ...AI }, 'u1');
  assert.equal(calls.execute.length, 1);
  const { sql, params } = calls.execute[0];
  assert.match(sql, /DELETE FROM ai_corrections WHERE output_id = \?/);
  // 項目名で絞ると、前の保存の `next_action` の fix などが残る
  assert.doesNotMatch(sql, /field_path/);
  assert.deepEqual(params, ['out-1']);
  assert.deepEqual(calls.recorded[0].diffs, [{ fieldPath: '(全体)', type: 'none' }]);
});

test('差分がある保存は、積む項目と (全体) だけを消す（明示の不採用など別の行は残す）', async () => {
  const { mod, calls } = await load();
  await mod.recordActivityCorrections('log-1', { ...AI, next_action: '候補日を3つ送る' }, 'u1');
  const { sql, params } = calls.execute[0];
  assert.match(sql, /field_path = ANY/);
  assert.equal(params[0], 'out-1');
  assert.ok(params[1].includes('next_action'));
  assert.ok(params[1].includes('(全体)'));
});
