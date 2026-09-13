import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段C — 外部レビュー再指摘（P1）。
//
// schedule.resolver.ts は「同じ案件/番組のスケジュール表から1つ選ぶ」だけをゲートに
// しており、`canAccessSchedule` を経由しなかった。project 紐づけの表は
// canAccessSchedule も案件メンバー全員に自動で見えるためマニュアル側の可視性と一致するが、
// program 紐づけの表は canAccessSchedule が作成者本人/個別共有/管理者にしか許さない
// （qsheet_programs 自体は行単位の権限を持たないため誰でも新しい番組マニュアルを
// 作れる）。案件メンバー自動可視ではなく創作者限定というより狭い表を、マニュアルの可視性
// だけをゲートにして読めてしまうと、他人の番組の表を丸ごと覗ける経路になる。
// pickScheduleId が canAccessSchedule を通る最初の候補を選ぶことを固定する。

function baseCtx(overrides = {}) {
  return {
    projectId: null,
    programId: 'prog-1',
    sourceId: null,
    revealFields: [],
    manualServiceDate: null,
    user: { id: 'u1', role: 'user' },
    ...overrides,
  };
}

async function loadScheduleResolver({ scheduleRows, canAccessScheduleImpl, metaById = {} }) {
  return loadTs('server/src/contexts/qsheet/services/manual-resolvers/schedule.resolver.ts', {
    '../../../../shared/db/connection': {
      queryAll: async () => scheduleRows,
    },
    '../../access': {
      canAccessSchedule: canAccessScheduleImpl,
    },
    '../../../../shared/schedule/time': {
      fmtHm: (min) => String(min),
    },
    '../schedule.service': {
      getScheduleWithMeta: async (id) => metaById[id] ?? null,
      getScheduleColumns: async () => [],
      getScheduleItems: async () => [],
    },
  });
}

test('resolveScheduleDay: canAccessSchedule が通らない候補は飛ばし、通る次点を選ぶ', async () => {
  const calls = [];
  const { resolveScheduleDay } = await loadScheduleResolver({
    scheduleRows: [
      { id: 'sched-other', created_by: 'other-user' },
      { id: 'sched-mine', created_by: 'u1' },
    ],
    canAccessScheduleImpl: async (user, id, createdBy) => {
      calls.push(id);
      return createdBy === user.id; // 自分が作成したものだけ読める、という単純化した検査
    },
    metaById: {
      'sched-mine': {
        title: '自分の表', service_date: '2026-09-01', slot_min: 15, view_start_min: 0, view_end_min: 1440, updated_at: '2026-09-01T00:00:00.000Z',
      },
    },
  });

  const result = await resolveScheduleDay(baseCtx());

  assert.deepEqual(calls, ['sched-other', 'sched-mine'], '先頭候補が弾かれたら次点を試す');
  assert.equal(result.data.scheduleId, 'sched-mine');
});

test('resolveScheduleDay: どの候補も canAccessSchedule を通らなければ null（他人の番組の表は一切見せない）', async () => {
  const { resolveScheduleDay } = await loadScheduleResolver({
    scheduleRows: [{ id: 'sched-other', created_by: 'other-user' }],
    canAccessScheduleImpl: async () => false,
  });

  const result = await resolveScheduleDay(baseCtx());

  assert.deepEqual(result, { data: null, updatedAt: null });
});

test('resolveScheduleLoadInOut も同じ canAccessSchedule ゲートを通る', async () => {
  const { resolveScheduleLoadInOut } = await loadScheduleResolver({
    scheduleRows: [{ id: 'sched-other', created_by: 'other-user' }],
    canAccessScheduleImpl: async () => false,
  });

  const result = await resolveScheduleLoadInOut(baseCtx());

  assert.deepEqual(result, { data: null, updatedAt: null });
});
