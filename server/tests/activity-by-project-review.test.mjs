import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

/*
 * `GET /activity-logs/by-project` の `summary`（#727 の宿題①）と担当者の絞り込み（同②）。
 *
 * SQL の中身そのものは検証用 Postgres で実測しています（PR 本文）。ここで止めるのは
 * **戻ると画面の数字が静かに狂う形**だけです:
 *   - `summary` の集計に `due` の絞り込みが混ざる（選んだチップ以外が 0 になる）
 *   - 担当者の絞り込みが時系列の一覧（`a.user_id = ?`）と違う意味に変わる
 *   - `pg` が文字列で返した件数を数値に読まずに返す
 */

// next-action-state は本物の式を使う（式が変わったときに試験だけ古い式を見続けないため）
const nextActionState = await loadTs('server/src/shared/services/next-action-state.ts', {
  '../db/connection': { queryAll: async () => [] },
});

async function loadService(aggRow) {
  const calls = [];
  const mod = await loadTs('server/src/contexts/sales/services/activity-by-project.service.ts', {
    '../../../shared/db/connection': {
      async queryOne(sql, params) { calls.push({ kind: 'one', sql, params }); return aggRow; },
      async queryAll(sql, params) { calls.push({ kind: 'all', sql, params }); return []; },
    },
    '../../../shared/services/next-action-state': nextActionState,
    './activity-corrections.service': {
      ACTIVITY_FORMAT_KIND: 'activity_format', ACTIVITY_INTAKE_KIND: 'activity_intake',
    },
  });
  return { mod, calls };
}

/** 集計の SQL から「総数」の1行を除いたもの（ここが `due` で変わってはいけない） */
const summaryPart = (sql) => sql.replace(/SELECT COUNT\(\*\)[^\n]*AS total,/, 'SELECT <total>,');

test('by-project: summary は due を無視し、1本の集計で全区分を返す', async () => {
  const row = {
    total: 2, a_overdue: '3', a_today: 1, a_week: 0, a_none: 2, a_all: '7',
    p_overdue: 2, p_today: 1, p_week: 0, p_none: 1, p_all: 3,
  };
  const sqls = {};
  for (const due of ['all', 'overdue', 'today', 'week', 'none']) {
    const { mod, calls } = await loadService(row);
    const r = await mod.listByProject({ due }, 1, 20, 0);
    // 集計は1本だけ（区分ごとに問い合わせ直さない）
    const aggs = calls.filter((c) => c.kind === 'one');
    assert.equal(aggs.length, 1, `due=${due}: 集計は1本`);
    sqls[due] = aggs[0].sql;
    // bigint の文字列で来ても数値で返す
    assert.deepEqual(r.summary, {
      actions: { overdue: 3, today: 1, week: 0, none: 2, all: 7 },
      projects: { overdue: 2, today: 1, week: 0, none: 1, all: 3 },
    });
    assert.equal(r.total, 2);
  }
  // `due` で変わるのは総数の行だけ。summary の列と CTE は一字一句同じ
  for (const due of ['overdue', 'today', 'week', 'none']) {
    assert.equal(summaryPart(sqls[due]), summaryPart(sqls.all), `due=${due} で summary の式が変わった`);
    assert.match(sqls[due], new RegExp(`COUNT\\(\\*\\) FILTER \\(WHERE g\\.${due}_count > 0\\)::int AS total`));
  }
  assert.match(sqls.all, /SELECT COUNT\(\*\) ::int AS total/);
  // CTE の WHERE に due の条件が入っていない（入ると他の区分が 0 になる）
  const cte = sqls.overdue.split('grouped AS')[0];
  assert.doesNotMatch(cte, /overdue_count > 0/);
});

test('by-project: 担当者の絞り込みは活動を記録した人（時系列の一覧と同じ意味）', async () => {
  const { mod, calls } = await loadService({ total: 0 });
  await mod.listByProject({ due: 'all', userId: 'u-1', search: '展示' }, 1, 20, 0);
  for (const c of calls) {
    // 画面は案件別と時系列で同じ ?user= を持ち回る。GET /activity-logs は a.user_id で絞るので、
    // こちらだけ案件の担当者（p.assigned_to）に変えると切り替えた瞬間に別の集まりが出る
    assert.match(c.sql, /AND a\.user_id = \?/);
    assert.doesNotMatch(c.sql, /assigned_to[^\n]*= \?/, '担当者の絞り込みが案件の担当者に変わっている');
    // 引数は 担当者 → 検索4つ の順（一覧はさらに limit / offset）
    assert.deepEqual(c.params.slice(0, 5), ['u-1', '%展示%', '%展示%', '%展示%', '%展示%']);
  }
  assert.deepEqual(calls.find((c) => c.kind === 'all').params.slice(-2), [20, 0]);
});

test('by-project: 集計の行が無くても summary は 0 で埋まる', async () => {
  const { mod } = await loadService(undefined);
  const r = await mod.listByProject({ due: 'week' }, 1, 20, 0);
  const zero = { overdue: 0, today: 0, week: 0, none: 0, all: 0 };
  assert.deepEqual(r.summary, { actions: zero, projects: zero });
  assert.equal(r.total, 0);
  assert.deepEqual(mod.summaryFromRow({ a_overdue: null, p_all: 'x' }).projects.all, 0);
});
