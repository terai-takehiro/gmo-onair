import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段C — 外部レビュー再指摘（P1）。
//
// resolveProjectHeading() が `projects.event_start`/`event_end` に `to_char()` を
// 掛けて引いていたが、この2列は DATE ではなく TEXT（`YYYY-MM-DD`・migration 001b）——
// `to_char(text, ...)` は Postgres の型エラーになり、案件紐づけの project.heading
// ブロックが必ず resolve_failed になり一度も表示できていなかった（`device-settings.routes.ts`
// と同じ注意）。SQL が to_char を使わないこと・TEXT 列の値がそのまま渡ることを固定する。

function baseCtx(overrides = {}) {
  return {
    projectId: 'proj-1',
    programId: null,
    sourceId: null,
    revealFields: [],
    manualServiceDate: null,
    user: { id: 'u1', role: 'user' },
    ...overrides,
  };
}

async function loadProjectResolver({ projectRow, onQueryOne, memberRows = [], onQueryAll } = {}) {
  return loadTs('server/src/contexts/qsheet/services/manual-resolvers/project.resolver.ts', {
    '../../../../shared/db/connection': {
      async queryOne(sql, params) {
        if (onQueryOne) onQueryOne(sql, params);
        return projectRow;
      },
      async queryAll(sql, params) {
        if (onQueryAll) onQueryAll(sql, params);
        return memberRows;
      },
    },
  });
}

test('resolveProjectHeading: SQL は to_char() を使わない（TEXT列にto_charを掛けると型エラーになるため）', async () => {
  let seenSql = '';
  const { resolveProjectHeading } = await loadProjectResolver({
    projectRow: {
      name: '本番案件', gls_number: 'PJ-0001',
      event_start: '2026-09-01', event_end: '2026-09-01',
      updated_at: '2026-09-01T00:00:00.000Z',
    },
    onQueryOne: (sql) => { seenSql = sql; },
  });

  await resolveProjectHeading(baseCtx());

  assert.equal(seenSql.includes('to_char'), false, 'event_start/event_end はTEXT列——to_char()を掛けない');
  assert.ok(seenSql.includes('event_start') && seenSql.includes('event_end'));
});

test('resolveProjectHeading: TEXT列の値（YYYY-MM-DD）をそのままeventStart/eventEndへ渡す', async () => {
  const { resolveProjectHeading } = await loadProjectResolver({
    projectRow: {
      name: '本番案件', gls_number: 'PJ-0001',
      event_start: '2026-09-01', event_end: '2026-09-03',
      updated_at: '2026-09-01T00:00:00.000Z',
    },
  });

  const result = await resolveProjectHeading(baseCtx());

  assert.equal(result.data.eventStart, '2026-09-01');
  assert.equal(result.data.eventEnd, '2026-09-03');
});

test('resolveProjectHeading: event_start と event_end が同じ（単日開催）ならeventEndは省く', async () => {
  const { resolveProjectHeading } = await loadProjectResolver({
    projectRow: {
      name: '本番案件', gls_number: 'PJ-0001',
      event_start: '2026-09-01', event_end: '2026-09-01',
      updated_at: '2026-09-01T00:00:00.000Z',
    },
  });

  const result = await resolveProjectHeading(baseCtx());

  assert.equal(result.data.eventStart, '2026-09-01');
  assert.equal('eventEnd' in result.data, false);
});

test('resolveProjectHeading: projectId が無ければ常にnull（programId由来のマニュアル）', async () => {
  const { resolveProjectHeading } = await loadProjectResolver({ projectRow: undefined });

  const result = await resolveProjectHeading(baseCtx({ projectId: null }));

  assert.deepEqual(result, { data: null, updatedAt: null });
});
