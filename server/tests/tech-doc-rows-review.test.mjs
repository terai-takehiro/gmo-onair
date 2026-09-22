import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 技術資料（PR #731 のレビュー指摘）の再発防止。
//
// 1) 行（映像パッチ・技術スタッフ）の書き込みは、親の資料行を `FOR UPDATE` で押さえてから
//    確定・ロックを見直し、同じトランザクションで書く。以前は検査と書き込みが別の文で、
//    その間に確定・強制引き継ぎが入ると確定済みの資料が書き換わった。
// 2) 行の書き込みは親の資料の新しい `updated_at` を返す（画面が名前の保存に使う）。
// 3) 画面から足した盤のパッチ番号 id は盤の id から作る。名前の slug から作っていたため、
//    日本語だけの名前や `A-B`/`AB` がぶつかり、2枚目の盤に番号が1つも作られなかった。

class NotFoundError extends Error { constructor(m) { super(m); this.code = 'NOT_FOUND'; } }
class ValidationError extends Error { constructor(m) { super(m); this.code = 'BAD_REQUEST'; } }
class ConflictError extends Error { constructor(m) { super(m); this.code = 'CONFLICT'; } }
class LockError extends Error {
  constructor(m, lockedBy, name) { super(m); this.code = 'LOCKED'; this.extra = { locked_by: lockedBy, locked_by_name: name }; }
}
const httpErrors = { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock() {} };

/** 資料行1件だけを持つ偽の DB。`log` に全ての SQL（トランザクションの中かどうか付き）を残す */
function fakeDb(docRow) {
  const log = [];
  const run = (inTx) => async (sql, params = []) => {
    log.push({ sql, params, inTx });
    if (/FROM qsheet_tech_docs t[\s\S]*FOR UPDATE/.test(sql)) return [docRow].filter(Boolean);
    if (/UPDATE qsheet_tech_docs SET updated_at = NOW\(\)[\s\S]*RETURNING updated_at/.test(sql)) return [{ updated_at: 'T2' }];
    if (/COALESCE\(MAX\(sort_order\)/.test(sql)) return [{ n: 0 }];
    if (/^SELECT[\s\S]*FROM qsheet_tech_patch_rows WHERE id/.test(sql.trim())) return [{ id: params[0] }];
    return [];
  };
  const tx = {
    execute: async (s, p) => { await run(true)(s, p); },
    queryOne: async (s, p) => (await run(true)(s, p))[0],
    queryAll: async (s, p) => run(true)(s, p),
  };
  return {
    log,
    deps: {
      queryAll: async (s, p) => run(false)(s, p),
      queryOne: async (s, p) => (await run(false)(s, p))[0],
      execute: async (s, p) => { await run(false)(s, p); },
      withTransaction: async (fn) => fn(tx),
    },
  };
}

async function loadDocService(docRow) {
  const db = fakeDb(docRow);
  const mod = await loadTs('server/src/contexts/qsheet/services/tech-doc.service.ts', {
    uuid: { v4: () => 'row-1' },
    '../../../shared/db/connection': db.deps,
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'TD-1' },
    './httpErrors': httpErrors,
  });
  return { mod, log: db.log };
}

test('createPatchRow: 確定済みの資料には書かない（資料行を FOR UPDATE で押さえた同じトランザクションで検査する）', async () => {
  const { mod, log } = await loadDocService({ id: 'd1', status: 'fixed', locked_by: null, locked_at: null });
  await assert.rejects(mod.createPatchRow('d1', 'u1', { label: 'x' }), ValidationError);
  const lockRead = log.find((e) => /FOR UPDATE/.test(e.sql));
  assert.ok(lockRead?.inTx, '資料行の FOR UPDATE はトランザクションの中で読む');
  assert.equal(log.some((e) => /INSERT INTO qsheet_tech_patch_rows/.test(e.sql)), false, '行は INSERT しない');
});

test('updateStaffRow: 他人の生きたロックがあれば書かない（LockError）', async () => {
  const { mod, log } = await loadDocService({
    id: 'd1', status: 'draft', locked_by: 'u2', locked_at: new Date().toISOString(), locked_by_name: '別の人',
  });
  await assert.rejects(mod.updateStaffRow('d1', 'r1', 'u1', { role: 'VE' }), LockError);
  assert.equal(log.some((e) => /UPDATE qsheet_tech_staff_rows/.test(e.sql)), false);
});

test('createPatchRow: 書き込みと親の updated_at の更新は同じトランザクションで、新しい値を返す', async () => {
  const { mod, log } = await loadDocService({ id: 'd1', status: 'draft', locked_by: 'u1', locked_at: new Date().toISOString() });
  const res = await mod.createPatchRow('d1', 'u1', { label: 'CCU1' });
  assert.equal(res.doc_updated_at, 'T2');
  assert.equal(res.data.id, 'row-1');
  const insert = log.find((e) => /INSERT INTO qsheet_tech_patch_rows/.test(e.sql));
  const touch = log.find((e) => /RETURNING updated_at/.test(e.sql));
  assert.ok(insert?.inTx && touch?.inTx, 'INSERT と touch はどちらもトランザクションの中');
  assert.ok(log.indexOf(insert) > log.findIndex((e) => /FOR UPDATE/.test(e.sql)), '押さえてから書く');
});

test('fixTechDoc / takeoverTechDocLock も資料行を FOR UPDATE で押さえる（行の書き込みと直列になる）', async () => {
  for (const fn of ['fixTechDoc', 'unfixTechDoc', 'takeoverTechDocLock']) {
    const status = fn === 'unfixTechDoc' ? 'fixed' : 'draft';
    const { mod, log } = await loadDocService({ id: 'd1', status });
    await mod[fn]('d1', 'u1').catch(() => { /* 返りの SELECT は偽の DB では空。押さえ方だけを見る */ });
    assert.ok(log.some((e) => e.inTx && /FROM qsheet_tech_docs[\s\S]*FOR UPDATE/.test(e.sql)), `${fn} は FOR UPDATE で押さえる`);
  }
});

// createTechDoc の copy_from（PR #731 レビュー指摘 #1）。資料行の INSERT と複製元の行コピー
// （映像パッチ行・技術スタッフ行）が**1つのトランザクション**（`withTransaction`）に入っている
// ことを見る。以前は資料行の INSERT が自動コミットの別文で、行コピーの途中で失敗すると
// 「中身の無い資料」だけが残った（検証用 Postgres で FK 違反を起こして実際に確認済み——
// 修正前は `qsheet_tech_docs` に部分コピーの行が残り、修正後は 1 行も残らない）。
function fakeCopyDb(sourcePatchRows, sourceStaffRows, { failOnPatchRowIndex = -1 } = {}) {
  const log = [];
  let patchInsertCount = 0;
  const txRun = async (sql, params = []) => {
    log.push({ sql, params, inTx: true });
    if (/SELECT[\s\S]*FROM qsheet_tech_patch_rows WHERE tech_doc_id = \$1/.test(sql)) return sourcePatchRows;
    if (/SELECT[\s\S]*FROM qsheet_tech_staff_rows WHERE tech_doc_id = \$1/.test(sql)) return sourceStaffRows;
    if (/INSERT INTO qsheet_tech_patch_rows/.test(sql)) {
      const idx = patchInsertCount++;
      if (idx === failOnPatchRowIndex) throw new Error('verify: forced failure mid-copy');
      return [];
    }
    return [];
  };
  const tx = {
    execute: async (s, p) => { await txRun(s, p); },
    queryOne: async (s, p) => (await txRun(s, p))[0],
    queryAll: async (s, p) => txRun(s, p),
  };
  return {
    log,
    deps: {
      queryAll: async () => { throw new Error('module-level queryAll は使わない想定（トランザクションの外）'); },
      queryOne: async (s) => {
        log.push({ sql: s, params: [], inTx: false });
        return { id: 'new-doc', doc_no: 'TD-1' }; // getTechDoc(id) の返り
      },
      execute: async (s) => {
        log.push({ sql: s, params: [], inTx: false });
        throw new Error('module レベルの execute（トランザクション外）で資料/行を書いてはいけない: ' + s);
      },
      withTransaction: async (fn) => fn(tx),
    },
  };
}

async function loadDocServiceForCopy(sourcePatchRows, sourceStaffRows, opts) {
  const db = fakeCopyDb(sourcePatchRows, sourceStaffRows, opts);
  const mod = await loadTs('server/src/contexts/qsheet/services/tech-doc.service.ts', {
    uuid: { v4: () => 'new-row' },
    '../../../shared/db/connection': db.deps,
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'TD-1' },
    './httpErrors': httpErrors,
  });
  return { mod, log: db.log };
}

test('createTechDoc(copy_from): 資料行の INSERT と行コピーは同じトランザクションに入る（モジュールレベルの execute は使わない）', async () => {
  const { mod, log } = await loadDocServiceForCopy(
    [{ id: 'p1', group_label: '', sort_order: 0, from_device_text: '', from_jack_id: null, from_jack_text: '', from_is_extra: false, to_device_text: '', to_jack_id: null, to_jack_text: '', to_is_extra: false, label: '', signal: '', note: '' }],
    [{ id: 's1', work_date: '2026-10-01', role: '', person_id: null, person_name: '', company_id: null, company_name: '', note: '', sort_order: 0 }],
  );
  const doc = await mod.createTechDoc({ title: '複製先', programId: 'prog-1', createdBy: 'u1', copyFrom: 'src-1' });
  assert.equal(doc.id, 'new-doc');
  const docInsert = log.find((e) => /INSERT INTO qsheet_tech_docs/.test(e.sql));
  const patchInsert = log.find((e) => /INSERT INTO qsheet_tech_patch_rows/.test(e.sql));
  const staffInsert = log.find((e) => /INSERT INTO qsheet_tech_staff_rows/.test(e.sql));
  assert.ok(docInsert?.inTx, '資料行の INSERT はトランザクションの中');
  assert.ok(patchInsert?.inTx, '映像パッチ行のコピーはトランザクションの中');
  assert.ok(staffInsert?.inTx, '技術スタッフ行のコピーはトランザクションの中');
});

test('createTechDoc(copy_from): 行コピーの途中で失敗したら、資料行の INSERT ごと投げる（部分コピーを残さない）', async () => {
  const { mod, log } = await loadDocServiceForCopy(
    [
      { id: 'p1', group_label: '', sort_order: 0, from_device_text: '', from_jack_id: null, from_jack_text: '', from_is_extra: false, to_device_text: '', to_jack_id: null, to_jack_text: '', to_is_extra: false, label: '1行目', signal: '', note: '' },
      { id: 'p2', group_label: '', sort_order: 1, from_device_text: '', from_jack_id: null, from_jack_text: '', from_is_extra: false, to_device_text: '', to_jack_id: null, to_jack_text: '', to_is_extra: false, label: '2行目(失敗させる)', signal: '', note: '' },
    ],
    [],
    { failOnPatchRowIndex: 1 },
  );
  await assert.rejects(
    mod.createTechDoc({ title: '複製先', programId: 'prog-1', createdBy: 'u1', copyFrom: 'src-1' }),
    /forced failure mid-copy/,
  );
  // 資料行の INSERT・1行目のコピーはどちらも同じトランザクション（withTransaction）の中で
  // 起きている＝2行目の失敗で fn 全体が throw し、withTransaction が ROLLBACK する対象になる。
  // （モジュールレベルの execute で先にコミットしていないことは fakeCopyDb 側で強制している）
  const docInsert = log.find((e) => /INSERT INTO qsheet_tech_docs/.test(e.sql));
  assert.ok(docInsert?.inTx, '資料行の INSERT もロールバック対象の同じトランザクションの中にある');
});

test('patchJackId: 盤の id から作るので、名前が日本語だけでも・A-B と AB でもぶつからない', async () => {
  const { patchJackId } = await loadTs('server/src/contexts/qsheet/services/tech-master.service.ts', {
    uuid: { v4: () => 'x' },
    '../../../shared/db/connection': { queryAll: async () => [], queryOne: async () => undefined, execute: async () => {}, withTransaction: async (fn) => fn({}) },
    './httpErrors': httpErrors,
  });
  assert.notEqual(patchJackId('panel-a', 1, 'A'), patchJackId('panel-b', 1, 'A'));
  assert.notEqual(patchJackId('panel-a', 1, 'A'), patchJackId('panel-a', 1, 'B'));
  assert.equal(patchJackId('panel-a', 3, 'B'), 'pj_panel-a_03b');
});

test('createPanel: 日本語だけの名前の盤を2枚足しても、それぞれに ch数×2 の番号が別の id で入る', async () => {
  const ids = ['panel-1', 'panel-2'];
  const inserted = [];
  const tx = {
    queryOne: async () => ({ n: 1 }),
    execute: async (sql, params) => {
      if (/INSERT INTO qsheet_patch_jacks/.test(sql)) {
        assert.equal(/ON CONFLICT/.test(sql), false, 'ぶつかりを黙って捨てない');
        inserted.push({ id: params[0], panel: params[1] });
      }
    },
  };
  const { createPanel } = await loadTs('server/src/contexts/qsheet/services/tech-master.service.ts', {
    uuid: { v4: () => ids.shift() },
    '../../../shared/db/connection': {
      queryAll: async () => [],
      queryOne: async (sql, params) => (/FROM qsheet_patch_panels p/.test(sql) ? { id: params[0] } : undefined),
      execute: async () => {},
      withTransaction: async (fn) => fn(tx),
    },
    './httpErrors': httpErrors,
  });
  await createPanel({ name: '第一調整室', jack_count: 32, kind: 'jack', location: '', model: '' }, 'u1');
  await createPanel({ name: '第二調整室', jack_count: 32, kind: 'jack', location: '', model: '' }, 'u1');
  assert.equal(inserted.filter((j) => j.panel === 'panel-1').length, 64);
  assert.equal(inserted.filter((j) => j.panel === 'panel-2').length, 64);
  assert.equal(new Set(inserted.map((j) => j.id)).size, 128, '128 個の id がすべて別');
});
