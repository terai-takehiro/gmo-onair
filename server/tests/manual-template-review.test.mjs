import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段E — `buildPagesForNewManual` は「ひな形／前回の冊子から複製した
// kind:'linked' ブロックの frozen（確定済みの中身）と reveal（秘密の解除記録）を
// 必ず null に戻す」という約束を持つ（段Eの設計判断3「reveal…を省略しないこと」）。
// ここが崩れると、複製した新しい冊子で「まだ誰も確認していないのに秘密（配信の鍵・
// WEB会議のパスコード）が出たまま」という事故になる——固定するテストを置く。
// あわせて「同じ案件/番組の冊子だけ複製を許す」ガードと、外部レビュー再指摘（P1）
// 「案件/番組が一致するだけでなく `canAccessManual` も通ること」（番組紐づけの冊子は
// 作成者本人/管理者にしか見えないため、番組一致だけでは他人の冊子を複製できてしまう）も固定する。

class NotFoundError extends Error {
  constructor(message) { super(message); this.code = 'NOT_FOUND'; this.status = 404; }
}
class ValidationError extends Error {
  constructor(message) { super(message); this.code = 'BAD_REQUEST'; this.status = 400; }
}

function linkedBlock(id) {
  return {
    id, kind: 'linked', x: 0, y: 0, w: 10, h: 10, z: 1, style: {},
    link: {
      block: 'schedule.day',
      sourceId: null,
      options: { keep: true },
      frozen: { at: '2026-09-01T00:00:00.000Z', data: { some: 'frozen data' } },
      reveal: { by: 'user-1', at: '2026-09-01T00:00:00.000Z', fields: ['streamKey'] },
    },
  };
}

function sheetBlock(id, sourceId) {
  return {
    id, kind: 'linked', x: 0, y: 0, w: 10, h: 10, z: 1, style: {},
    link: { block: 'sheet.excerpt', sourceId, options: {}, frozen: null },
  };
}

function freeBlock(id) {
  return { id, kind: 'free', x: 0, y: 0, w: 10, h: 10, z: 1, style: {}, free: { type: 'text', content: { text: 'hi' } } };
}

const DEFAULT_USER = { id: 'user-1', role: 'user' };

async function loadService({ manuals = {}, templates = {}, pagesByManual = {}, documents = {}, onExecute, canAccessManualImpl, canAccessDocImpl } = {}) {
  let nextId = 0;
  return loadTs('server/src/contexts/qsheet/services/manual-template.service.ts', {
    uuid: { v4: () => `new-id-${++nextId}` },
    '../../../shared/db/connection': {
      async queryOne(sql, params = []) {
        if (sql.includes('SELECT pages FROM qsheet_manual_templates')) {
          const tpl = templates[params[0]];
          return tpl ? { pages: tpl.pages } : undefined;
        }
        if (sql.includes('SELECT project_id, program_id, created_by FROM qsheet_manuals')) {
          const m = manuals[params[0]];
          return m ? { project_id: m.projectId ?? null, program_id: m.programId ?? null, created_by: m.createdBy ?? null } : undefined;
        }
        if (sql.includes('SELECT id FROM qsheet_manuals')) {
          return manuals[params[0]] ? { id: params[0] } : undefined;
        }
        if (sql.includes('FROM qsheet_documents')) {
          // reissueBlock: sheet.* ブロックの sourceId が複製先の案件/番組にまだ属しているか
          const doc = documents[params[0]];
          if (!doc) return undefined;
          const ownerId = params[1];
          if (sql.includes('project_id = $2') && doc.projectId !== ownerId) return undefined;
          if (sql.includes('program_id = $2') && doc.programId !== ownerId) return undefined;
          if (!sql.includes('project_id = $2') && !sql.includes('program_id = $2')) return undefined; // `AND FALSE`
          return { created_by: doc.createdBy ?? null };
        }
        if (sql.includes('SELECT t.id')) {
          // createTemplateFromManual の INSERT 直後の SELECT
          return { id: params[0], name: 'stub', scope: 'org', created_by: 'user-1', created_at: '2026-09-12T00:00:00.000Z', creator_name: null, page_count: 1 };
        }
        return undefined;
      },
      async queryAll(sql, params = []) {
        if (sql.includes('FROM qsheet_manual_pages')) return pagesByManual[params[0]] ?? [];
        return [];
      },
      async execute(sql, params = []) { if (onExecute) onExecute(sql, params); },
    },
    '../access': {
      canAccessManual: canAccessManualImpl ?? (async () => true),
      canAccessDoc: canAccessDocImpl ?? (async () => true),
      isQsheetAdmin: () => false,
    },
    './httpErrors': { NotFoundError, ValidationError },
  });
}

test('buildPagesForNewManual strips frozen/reveal and reissues block ids when copying from a manual', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-1', createdBy: 'user-1' } },
    pagesByManual: {
      'manual-1': [{ chapter: '1章', title: 'ページ1', blocks: [linkedBlock('blk-1'), freeBlock('blk-2')] }],
    },
  });

  const pages = await buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null, user: DEFAULT_USER });

  assert.equal(pages.length, 1);
  const [linked, free] = pages[0].blocks;
  assert.notEqual(linked.id, 'blk-1', 'ブロック id は発番し直す');
  assert.equal(linked.link.frozen, null, 'frozen は null に戻す');
  assert.equal('reveal' in linked.link, false, 'reveal は持ち越さない');
  assert.deepEqual(linked.link.options, { keep: true }, 'options はそのまま持ち越す');
  assert.notEqual(free.id, 'blk-2', '自由ブロックの id も発番し直す');
});

test('buildPagesForNewManual rejects copying from a manual under a different project/program', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-other', createdBy: 'user-1' } },
    pagesByManual: { 'manual-1': [{ chapter: null, title: '', blocks: [] }] },
  });

  await assert.rejects(
    buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null, user: DEFAULT_USER }),
    ValidationError,
  );
});

test('buildPagesForNewManual rejects copying a manual the requester cannot access, even when project/program matches (レビュー指摘・番組紐づけの冊子は作成者/管理者にしか見えない)', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { programId: 'prog-1', createdBy: 'other-user' } },
    pagesByManual: { 'manual-1': [{ chapter: null, title: '', blocks: [] }] },
    canAccessManualImpl: async () => false,
  });

  await assert.rejects(
    buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: null, programId: 'prog-1', user: DEFAULT_USER }),
    NotFoundError,
    '番組が一致するだけでは複製できない——canAccessManual も通す必要がある',
  );
});

test('buildPagesForNewManual strips frozen/reveal when applying an org template, and falls back to one blank page otherwise', async () => {
  const { buildPagesForNewManual } = await loadService({
    templates: { 'tpl-1': { pages: [{ chapter: null, title: '柱', blocks: [linkedBlock('blk-9')] }] } },
  });

  const fromTemplate = await buildPagesForNewManual({ templateId: 'tpl-1' });
  assert.equal(fromTemplate[0].blocks[0].link.frozen, null);
  assert.equal('reveal' in fromTemplate[0].blocks[0].link, false);

  const blank = await buildPagesForNewManual({});
  assert.deepEqual(blank, [{ chapter: null, title: '', blocks: [] }]);
});

test('buildPagesForNewManual nulls out a sheet.* block\'s sourceId when the copy target project does not own that document (外部レビュー再指摘・P2)', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-1', createdBy: 'user-1' } },
    pagesByManual: {
      'manual-1': [{ chapter: null, title: 'ページ1', blocks: [sheetBlock('blk-1', 'doc-1')] }],
    },
    documents: { 'doc-1': { projectId: 'proj-other' } },
  });

  const pages = await buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null, user: DEFAULT_USER });

  assert.equal(pages[0].blocks[0].link.sourceId, null, '複製先の案件には属さない資料は sourceId を落とす');
});

test('buildPagesForNewManual keeps a sheet.* block\'s sourceId when the copy target project still owns that document', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-1', createdBy: 'user-1' } },
    pagesByManual: {
      'manual-1': [{ chapter: null, title: 'ページ1', blocks: [sheetBlock('blk-1', 'doc-1')] }],
    },
    documents: { 'doc-1': { projectId: 'proj-1' } },
  });

  const pages = await buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null, user: DEFAULT_USER });

  assert.equal(pages[0].blocks[0].link.sourceId, 'doc-1', '複製先の案件にまだ属している資料は sourceId を持ち越す');
});

test('buildPagesForNewManual nulls out a sheet.* block\'s sourceId when the applying user cannot access the document, even though it belongs to the target project (外部レビュー再指摘・2回目・P2)', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-1', createdBy: 'user-1' } },
    pagesByManual: {
      'manual-1': [{ chapter: null, title: 'ページ1', blocks: [sheetBlock('blk-1', 'doc-1')] }],
    },
    documents: { 'doc-1': { projectId: 'proj-1', createdBy: 'other-user' } },
    canAccessDocImpl: async () => false, // 適用する本人はこの資料の作成者でも共有先でもない
  });

  const pages = await buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null, user: DEFAULT_USER });

  assert.equal(pages[0].blocks[0].link.sourceId, null, '資料が複製先の案件に属していても、適用する本人が読めなければ落とす');
});

test('buildPagesForNewManual keeps a sheet.* block\'s sourceId when the document belongs to the target project AND the applying user can access it', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-1', createdBy: 'user-1' } },
    pagesByManual: {
      'manual-1': [{ chapter: null, title: 'ページ1', blocks: [sheetBlock('blk-1', 'doc-1')] }],
    },
    documents: { 'doc-1': { projectId: 'proj-1', createdBy: 'user-1' } },
    canAccessDocImpl: async (user, docId, createdBy) => createdBy === user.id,
  });

  const pages = await buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null, user: DEFAULT_USER });

  assert.equal(pages[0].blocks[0].link.sourceId, 'doc-1');
});

test('buildPagesForNewManual nulls out a sheet.* block\'s sourceId when applying an org template to a project the source document does not belong to', async () => {
  const { buildPagesForNewManual } = await loadService({
    templates: { 'tpl-1': { pages: [{ chapter: null, title: '柱', blocks: [sheetBlock('blk-9', 'doc-9')] }] } },
    documents: { 'doc-9': { projectId: 'proj-1' } },
  });

  const pages = await buildPagesForNewManual({ templateId: 'tpl-1', projectId: 'proj-2', programId: null, user: DEFAULT_USER });

  assert.equal(pages[0].blocks[0].link.sourceId, null, '組織共通ひな形は案件を問わず適用できるため、資料が別案件のものなら落とす');
});

test('buildPagesForNewManual nulls out a sheet.* block\'s sourceId when neither projectId nor programId is given (新規冊子で所属先が無い場合)', async () => {
  const { buildPagesForNewManual } = await loadService({
    templates: { 'tpl-1': { pages: [{ chapter: null, title: '柱', blocks: [sheetBlock('blk-9', 'doc-9')] }] } },
    documents: { 'doc-9': { projectId: 'proj-1' } },
  });

  const pages = await buildPagesForNewManual({ templateId: 'tpl-1', user: DEFAULT_USER });

  assert.equal(pages[0].blocks[0].link.sourceId, null);
});

test('buildPagesForNewManual raises NotFoundError for an unknown template or source manual', async () => {
  const { buildPagesForNewManual } = await loadService({});
  await assert.rejects(buildPagesForNewManual({ templateId: 'missing' }), NotFoundError);
  await assert.rejects(buildPagesForNewManual({ copyFromManualId: 'missing', projectId: 'proj-1', user: DEFAULT_USER }), NotFoundError);
});

test('createTemplateFromManual requires a name and an existing source manual', async () => {
  const { createTemplateFromManual } = await loadService({});
  await assert.rejects(createTemplateFromManual('', 'manual-1', 'user-1'), ValidationError);
  await assert.rejects(createTemplateFromManual('見本', 'missing', 'user-1'), NotFoundError);
});

test('createTemplateFromManual copies the source pages as-is (frozen/reveal untouched — that is buildPagesForNewManual’s job)', async () => {
  let insertedArgs = null;
  const { createTemplateFromManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-1' } },
    pagesByManual: { 'manual-1': [{ chapter: null, title: 'ページ1', blocks: [linkedBlock('blk-1')] }] },
    onExecute: (sql, params) => { if (sql.includes('INSERT INTO qsheet_manual_templates')) insertedArgs = params; },
  });

  await createTemplateFromManual('見本ひな形', 'manual-1', 'user-1');

  assert.ok(insertedArgs, 'INSERT INTO qsheet_manual_templates が呼ばれる');
  const [, name, pagesJson, createdBy] = insertedArgs;
  assert.equal(name, '見本ひな形');
  assert.equal(createdBy, 'user-1');
  const pages = JSON.parse(pagesJson);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].blocks[0].link.frozen, { at: '2026-09-01T00:00:00.000Z', data: { some: 'frozen data' } });
  assert.ok(pages[0].blocks[0].link.reveal, 'テンプレート登録時点では reveal も含めそのまま写す');
});
