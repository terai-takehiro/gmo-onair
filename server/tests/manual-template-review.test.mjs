import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段E — `buildPagesForNewManual` は「ひな形／前回の冊子から複製した
// kind:'linked' ブロックの frozen（確定済みの中身）と reveal（秘密の解除記録）を
// 必ず null に戻す」という約束を持つ（段Eの設計判断3「reveal…を省略しないこと」）。
// ここが崩れると、複製した新しい冊子で「まだ誰も確認していないのに秘密（配信の鍵・
// WEB会議のパスコード）が出たまま」という事故になる——固定するテストを置く。
// あわせて「同じ案件/番組の冊子だけ複製を許す」ガードも固定する。

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

function freeBlock(id) {
  return { id, kind: 'free', x: 0, y: 0, w: 10, h: 10, z: 1, style: {}, free: { type: 'text', content: { text: 'hi' } } };
}

async function loadService({ manuals = {}, templates = {}, pagesByManual = {}, onExecute } = {}) {
  let nextId = 0;
  return loadTs('server/src/contexts/qsheet/services/manual-template.service.ts', {
    uuid: { v4: () => `new-id-${++nextId}` },
    '../../../shared/db/connection': {
      async queryOne(sql, params = []) {
        if (sql.includes('SELECT pages FROM qsheet_manual_templates')) {
          const tpl = templates[params[0]];
          return tpl ? { pages: tpl.pages } : undefined;
        }
        if (sql.includes('SELECT project_id, program_id FROM qsheet_manuals')) {
          const m = manuals[params[0]];
          return m ? { project_id: m.projectId ?? null, program_id: m.programId ?? null } : undefined;
        }
        if (sql.includes('SELECT id FROM qsheet_manuals')) {
          return manuals[params[0]] ? { id: params[0] } : undefined;
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
    './httpErrors': { NotFoundError, ValidationError },
  });
}

test('buildPagesForNewManual strips frozen/reveal and reissues block ids when copying from a manual', async () => {
  const { buildPagesForNewManual } = await loadService({
    manuals: { 'manual-1': { projectId: 'proj-1' } },
    pagesByManual: {
      'manual-1': [{ chapter: '1章', title: 'ページ1', blocks: [linkedBlock('blk-1'), freeBlock('blk-2')] }],
    },
  });

  const pages = await buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null });

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
    manuals: { 'manual-1': { projectId: 'proj-other' } },
    pagesByManual: { 'manual-1': [{ chapter: null, title: '', blocks: [] }] },
  });

  await assert.rejects(
    buildPagesForNewManual({ copyFromManualId: 'manual-1', projectId: 'proj-1', programId: null }),
    ValidationError,
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

test('buildPagesForNewManual raises NotFoundError for an unknown template or source manual', async () => {
  const { buildPagesForNewManual } = await loadService({});
  await assert.rejects(buildPagesForNewManual({ templateId: 'missing' }), NotFoundError);
  await assert.rejects(buildPagesForNewManual({ copyFromManualId: 'missing', projectId: 'proj-1' }), NotFoundError);
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
