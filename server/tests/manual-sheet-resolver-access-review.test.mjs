import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段C — 外部レビュー再指摘（P1・Security Review）。
//
// sheet.resolver.ts は「sourceId で引いた qsheet_documents の project_id/program_id が
// マニュアルと一致するか」だけをゲートにしており、qsheet_documents 自体のアクセス制御
// （canAccessDoc: 作成者/個別共有/system_admin。案件メンバー自動可視は持たない）を
// 経由しなかった。canAccessManual（マニュアル）は案件メンバー全員に自動で見える設計なので、
// このままだと案件メンバーなら誰でも「差し込みブロックの sourceId に他人の非共有台本の
// id を指定する」だけでその台本の全文を読めてしまう。resolveAccessibleDoc が
// canAccessDoc も追加でゲートすること・listSheetSources の一覧も同じ条件で絞ることを固定する。

function baseCtx(overrides = {}) {
  return {
    projectId: 'proj-1',
    programId: null,
    sourceId: 'doc-1',
    user: { id: 'u1', role: 'user' },
    ...overrides,
  };
}

async function loadSheetResolver({ docRow, canAccessDocImpl, queryAllImpl } = {}) {
  return loadTs('server/src/contexts/qsheet/services/manual-resolvers/sheet.resolver.ts', {
    '../../../../shared/db/connection': {
      queryOne: async (sql) => (sql.includes('FROM qsheet_documents') ? docRow : undefined),
      queryAll: queryAllImpl ?? (async () => []),
    },
    '../../access': {
      canAccessDoc: canAccessDocImpl ?? (async () => true),
      isQsheetAdmin: (user) => user.role === 'system_admin',
    },
    '../production/qsheet-read.service': {
      fetchDocForRead: async () => ({ id: 'doc-1', title: 'T', doc_no: 'D-1', data: { blocks: [], sections: [] } }),
      getQsheetOutline: async () => ({ sections: [], blocks: [], totals: {}, masters: { micChannels: [], micTypes: [] } }),
      getQsheetRows: async () => [],
    },
  });
}

test('resolveSheetExcerpt: 案件は一致しても canAccessDoc が false なら access_denied（他人の非共有台本は読めない）', async () => {
  const { resolveSheetExcerpt } = await loadSheetResolver({
    docRow: { project_id: 'proj-1', program_id: null, created_by: 'other-user', updated_at: '2026-09-01T00:00:00.000Z' },
    canAccessDocImpl: async () => false,
  });

  const result = await resolveSheetExcerpt(baseCtx());
  assert.equal(result.error, 'access_denied');
  assert.equal(result.data, null);
});

test('resolveSheetExcerpt: 案件が一致しcanAccessDocも通れば読める', async () => {
  const { resolveSheetExcerpt } = await loadSheetResolver({
    docRow: { project_id: 'proj-1', program_id: null, created_by: 'u1', updated_at: '2026-09-01T00:00:00.000Z' },
    canAccessDocImpl: async () => true,
  });

  const result = await resolveSheetExcerpt(baseCtx());
  assert.equal(result.error, undefined);
  assert.equal(result.data.docTitle, 'T');
});

test('resolveSheetExcerpt: 案件が違えばcanAccessDocを呼ぶ前にaccess_denied（他案件のデータは一切見せない）', async () => {
  let canAccessDocCalled = false;
  const { resolveSheetExcerpt } = await loadSheetResolver({
    docRow: { project_id: 'other-proj', program_id: null, created_by: 'u1', updated_at: '2026-09-01T00:00:00.000Z' },
    canAccessDocImpl: async () => { canAccessDocCalled = true; return true; },
  });

  const result = await resolveSheetExcerpt(baseCtx());
  assert.equal(result.error, 'access_denied');
  assert.equal(canAccessDocCalled, false, '案件不一致の時点で弾き、資料の権限チェックまで進まない');
});

test('listSheetSources: 一般ユーザーには作成者/個別共有の条件を追加する', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const { listSheetSources } = await loadSheetResolver({
    queryAllImpl: async (sql, params) => { capturedSql = sql; capturedParams = params; return []; },
  });

  await listSheetSources({ projectId: 'proj-1', programId: null }, { id: 'u1', role: 'user' });

  assert.match(capturedSql, /created_by = \?/);
  assert.match(capturedSql, /qsheet_document_shares/);
  assert.deepEqual(capturedParams, ['proj-1', 'u1', 'u1']);
});

test('listSheetSources: system_admin には資料の権限条件を追加しない', async () => {
  let capturedSql = '';
  const { listSheetSources } = await loadSheetResolver({
    queryAllImpl: async (sql) => { capturedSql = sql; return []; },
  });

  await listSheetSources({ projectId: 'proj-1', programId: null }, { id: 'admin', role: 'system_admin' });

  assert.doesNotMatch(capturedSql, /created_by = \?/);
});
