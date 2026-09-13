import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段B — 外部レビュー再指摘（P1）: updatePage()（および同じ形の
// updateManual()）の楽観ロックが「読む→JSで比較→UPDATE」のままだった。マニュアルの
// 編集ロックは**利用者単位**（`assertEditable` は locked_by !== userId だけを見る）
// なので、同じ利用者の2つのタブは両方ロックを通る——ほぼ同時に保存すると両方が
// 同じ updated_at を読んで両方 JS 側のチェックを通過し、後着の無条件 UPDATE が
// 先着を無音で上書きできてしまっていた。比較を UPDATE 自身の WHERE 句にも畳み込み、
// 1文の条件付き UPDATE（RETURNING id）にした。

class NotFoundError extends Error { constructor(m) { super(m); this.code = 'NOT_FOUND'; this.status = 404; } }
class ValidationError extends Error { constructor(m) { super(m); this.code = 'BAD_REQUEST'; this.status = 400; } }
class ConflictError extends Error {
  constructor(m, currentUpdatedAt, updatedByName) {
    super(m); this.code = 'CONFLICT'; this.status = 409;
    this.extra = { current_updated_at: currentUpdatedAt, updated_by_name: updatedByName };
  }
}
class LockError extends Error { constructor(m) { super(m); this.code = 'LOCKED'; this.status = 409; } }

// 本物の checkOptimisticLock と同じ最小限の契約（未指定なら検査しない・食い違えば投げる）
function checkOptimisticLock(expected, current, userId, what) {
  if (typeof expected !== 'string' || !expected) return;
  if (new Date(expected).getTime() === new Date(current.updated_at).getTime()) return;
  throw new ConflictError(`${what}は競合しました`, current.updated_at, current.updater_name ?? null);
}

function baseDeps(overrides = {}) {
  return {
    uuid: { v4: () => 'new-id' },
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'DOC-1' },
    './httpErrors': { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock },
    './manual-resolve.service': { resolveLinkedBlock: async () => ({ data: null, updatedAt: null }) },
    './manual-template.service': { buildPagesForNewManual: async () => [] },
    ...overrides,
  };
}

function lockRow(overrides = {}) {
  return {
    id: 'm1', status: 'draft',
    locked_by: 'me', locked_at: new Date().toISOString(), locked_by_name: null,
    lock_requested_by: null, lock_requested_at: null, lock_requested_by_name: null,
    ...overrides,
  };
}

/**
 * `race: true` のとき、最初の「既存行を読む」SELECT のちょうど直後（値を返す直前）に
 * 裏で別のタブがすでに保存を終えたことにする——JS 側の事前チェックは（読んだ時点の）
 * 古い値のまま比較して通ってしまうが、実際の UPDATE は WHERE 句でいまの値と比べる
 * ので、そこで初めて食い違いが検出できるはず（＝この if を race:true にしても
 * 無音上書きが起きないことを固定する）。
 *
 * `takeoverAfterCheck: true` のとき、冒頭の assertEditable 判定（`lock_requested_by`
 * を含むSELECT）の直後に管理者が引き継いだことにする——`updated_at` は変えない
 * （`takeoverManualLock()` と同じ）ため、楽観ロックのCASだけでは検出できないはず
 * （外部レビュー再指摘・P1）。UPDATE自身のWHERE句に畳み込んだ EDITABLE_GUARD_SQL
 * 相当をここでJS側に再現し、書き込み時点のロック所有者で判定する。
 */
function makePageDb(page, { race = false, takeoverAfterCheck = false } = {}) {
  const state = { page: { ...page }, manual: lockRow() };
  let raceApplied = false;
  let takeoverApplied = false;
  const editableNow = () => {
    if (state.manual.status === 'fixed') return false;
    const lockedBy = state.manual.locked_by;
    if (!lockedBy || lockedBy === 'me') return true;
    return new Date(state.manual.locked_at).getTime() < Date.now() - 10 * 60 * 1000;
  };
  return {
    state,
    queryAll: async () => [],
    queryOne: async (sql, params = []) => {
      if (sql.includes('lock_requested_by')) {
        const snapshot = { ...state.manual };
        if (takeoverAfterCheck && !takeoverApplied) {
          takeoverApplied = true;
          state.manual = { ...state.manual, locked_by: 'other-manager', locked_by_name: '別のmanager' };
        }
        return snapshot;
      }
      if (sql.includes('p.manual_id = $2')) {
        const snapshot = { updated_at: state.page.updated_at, updated_by: state.page.updated_by, updater_name: null };
        if (race && !raceApplied) {
          raceApplied = true;
          state.page.updated_at = '2026-09-01T10:00:05.000Z'; // 「別のタブがいま保存し終えた」
        }
        return snapshot;
      }
      if (sql.startsWith('SELECT p.updated_at, p.updated_by')) {
        return { updated_at: state.page.updated_at, updated_by: state.page.updated_by, updater_name: null };
      }
      if (sql.includes('UPDATE qsheet_manual_pages SET') && sql.includes('RETURNING')) {
        // ⚠️ SQL自体が EDITABLE_GUARD_SQL（ロック所有者の再検査）を含んでいるときだけ
        // ブロックする——実装からこのガードを消しても本テストが気づけるようにする
        // （`hasGuard` と同じ考え方）
        const hasEditableGuard = sql.includes('EXISTS (') && sql.includes('m.locked_by');
        state.sawEditableGuard = hasEditableGuard;
        if (hasEditableGuard && !editableNow()) return undefined;
        const hasGuard = sql.includes("date_trunc('milliseconds'");
        if (!hasGuard) {
          state.page.updated_at = '2026-09-01T10:00:10.000Z';
          return { id: state.page.id };
        }
        const expected = params[params.length - 1];
        if (new Date(expected).getTime() !== new Date(state.page.updated_at).getTime()) return undefined;
        state.page.updated_at = '2026-09-01T10:00:10.000Z';
        return { id: state.page.id };
      }
      if (sql.includes('SELECT id, manual_id, sort_order')) {
        return { id: state.page.id, manual_id: 'm1', sort_order: 0, chapter: null, title: '', blocks: [], created_at: state.page.updated_at, updated_at: state.page.updated_at };
      }
      return undefined;
    },
    execute: async () => {},
    withTransaction: async (fn) => fn({ execute: async () => {}, queryOne: async () => undefined, queryAll: async () => [] }),
  };
}

test('updatePage: 何も競合しなければ保存できる', async () => {
  const db = makePageDb({ id: 'page-1', updated_at: '2026-09-01T10:00:00.000Z', updated_by: 'me' });
  const { updatePage } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));

  const row = await updatePage('m1', 'page-1', 'me', { title: '通常保存', expectedUpdatedAt: '2026-09-01T10:00:00.000Z' });
  assert.ok(row);
});

test('updatePage: 事前チェックの直後に別の保存が割り込んでも、UPDATE自身のWHERE句が弾く（無音上書きしない）', async () => {
  const db = makePageDb({ id: 'page-1', updated_at: '2026-09-01T10:00:00.000Z', updated_by: 'me' }, { race: true });
  const { updatePage } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));

  await assert.rejects(
    () => updatePage('m1', 'page-1', 'me', { title: '割り込まれた保存', expectedUpdatedAt: '2026-09-01T10:00:00.000Z' }),
    (err) => err.code === 'CONFLICT',
  );
  assert.equal(db.state.page.updated_at, '2026-09-01T10:00:05.000Z', '割り込んだ側の保存だけが残り、後着では上書きされない');
});

test('updatePage: assertEditable判定の直後・UPDATE実行前に管理者が引き継いでも、無条件では上書きしない（外部レビュー再指摘・P1）', async () => {
  const db = makePageDb(
    { id: 'page-1', updated_at: '2026-09-01T10:00:00.000Z', updated_by: 'me' },
    { takeoverAfterCheck: true },
  );
  const { updatePage } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));

  await assert.rejects(
    () => updatePage('m1', 'page-1', 'me', { title: '権限を失った保存', expectedUpdatedAt: '2026-09-01T10:00:00.000Z' }),
    (err) => err.code === 'LOCKED',
    'updated_atのCASだけでは検出できないため、ロック所有者の再検査でLockErrorになるはず',
  );
  assert.equal(db.state.page.updated_at, '2026-09-01T10:00:00.000Z', '前保持者の保存は反映されない');
  assert.equal(db.state.sawEditableGuard, true, 'UPDATE文自体がEDITABLE_GUARD_SQLを含んでいること');
});

/** updatePage と同じ形の欠陥・同じ修正が updateManual() にも要る（`EDITABLE_GUARD_SQL` は共通）。 */
function makeManualDb(manual, { takeoverAfterCheck = false } = {}) {
  const state = { manual: { ...manual } };
  let takeoverApplied = false;
  const editableNow = () => {
    if (state.manual.status === 'fixed') return false;
    const lockedBy = state.manual.locked_by;
    if (!lockedBy || lockedBy === 'me') return true;
    return new Date(state.manual.locked_at).getTime() < Date.now() - 10 * 60 * 1000;
  };
  return {
    state,
    queryAll: async () => [],
    queryOne: async (sql, params = []) => {
      if (sql.includes('m.created_by')) {
        // updateManual冒頭のexisting読み取り——ここがupdatePageのgetManualLockRow
        // に相当する「事前チェック用の最初の読み取り」なので、takeoverはここで起こす
        const snapshot = { ...state.manual };
        if (takeoverAfterCheck && !takeoverApplied) {
          takeoverApplied = true;
          state.manual = { ...state.manual, locked_by: 'other-manager', locked_by_name: '別のmanager' };
        }
        return snapshot;
      }
      if (sql.includes('lock_requested_by')) return { ...state.manual }; // フォールバックの再検査用
      if (sql.includes('UPDATE qsheet_manuals SET') && sql.includes('RETURNING')) {
        const hasEditableGuard = sql.includes('EXISTS (') && sql.includes('m.locked_by');
        state.sawEditableGuard = hasEditableGuard;
        if (hasEditableGuard && !editableNow()) return undefined;
        const hasGuard = sql.includes("date_trunc('milliseconds'");
        if (!hasGuard) { state.manual.updated_at = '2026-09-01T10:00:10.000Z'; return { id: state.manual.id }; }
        const expected = params[params.length - 1];
        if (new Date(expected).getTime() !== new Date(state.manual.updated_at).getTime()) return undefined;
        state.manual.updated_at = '2026-09-01T10:00:10.000Z';
        return { id: state.manual.id };
      }
      if (sql.includes('m.updated_at, m.updated_by, u.name')) {
        return { updated_at: state.manual.updated_at, updated_by: state.manual.updated_by, updater_name: null };
      }
      if (sql.includes('m.doc_no')) {
        return { id: state.manual.id, status: state.manual.status, rev: 1 }; // getManualWithMeta
      }
      return undefined;
    },
    execute: async () => {},
    withTransaction: async (fn) => fn({ execute: async () => {}, queryOne: async () => undefined, queryAll: async () => [] }),
  };
}

test('updateManual: 何も競合しなければ保存できる', async () => {
  const db = makeManualDb({ id: 'm1', status: 'draft', locked_by: 'me', locked_at: new Date().toISOString(), updated_at: '2026-09-01T09:00:00.000Z', updated_by: 'me' });
  const { updateManual } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));

  const row = await updateManual('m1', 'me', { title: '通常保存', expectedUpdatedAt: '2026-09-01T09:00:00.000Z' });
  assert.ok(row);
});

test('updateManual: assertEditable判定の直後・UPDATE実行前に管理者が引き継いでも、無条件では上書きしない（外部レビュー再指摘・P1）', async () => {
  const db = makeManualDb(
    { id: 'm1', status: 'draft', locked_by: 'me', locked_at: new Date().toISOString(), updated_at: '2026-09-01T09:00:00.000Z', updated_by: 'me' },
    { takeoverAfterCheck: true },
  );
  const { updateManual } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));

  await assert.rejects(
    () => updateManual('m1', 'me', { title: '権限を失った保存', expectedUpdatedAt: '2026-09-01T09:00:00.000Z' }),
    (err) => err.code === 'LOCKED',
  );
  assert.equal(db.state.manual.updated_at, '2026-09-01T09:00:00.000Z', '前保持者の保存は反映されない');
  assert.equal(db.state.sawEditableGuard, true, 'UPDATE文自体がEDITABLE_GUARD_SQLを含んでいること');
});
