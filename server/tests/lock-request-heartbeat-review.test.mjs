import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 編集ロックのハートビート（60秒延長）が「編集を要求」を消してしまう不具合の再発防止。
//
// `acquireManualLock`（manual.service.ts）・`acquireVenueLayoutLock`（venue-layout.service.ts）
// は保持者本人の60秒ごとのハートビートも兼ねる。以前はこの UPDATE が
// `lock_requested_by`/`lock_requested_at` を無条件に NULL へ落としていたため、他の人が
// 「編集を要求」しても、保持者が編集画面を開いたままにしているだけで（＝定期的に延長する
// だけで）次のハートビート（最大60秒後）で要求が消え、保持者には一度も伝わらなかった。
// `tech-doc.service.ts` の `acquireTechDocLock` で先に直した形（SET の右辺の `locked_by` が
// 更新前の値であることを利用し、持ち主が変わったときだけ消す）を manual / venue-layout にも
// 適用したことを、実際の SQL の CASE 式をここで評価する疑似 DB で確認する。

class NotFoundError extends Error { constructor(m) { super(m); this.code = 'NOT_FOUND'; } }
class ValidationError extends Error { constructor(m) { super(m); this.code = 'BAD_REQUEST'; } }
class ConflictError extends Error { constructor(m) { super(m); this.code = 'CONFLICT'; } }
class LockError extends Error { constructor(m) { super(m); this.code = 'LOCKED'; } }
function checkOptimisticLock() { /* このテスト群では使わない（no-op） */ }

const httpErrorsMock = { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock };

/**
 * 実際の acquire 系 UPDATE（1文の CAS）の SQL を、その WHERE 句・SET の CASE 式まで含めて
 * 評価する疑似 DB。`makeLockDb`（manual-lock-review.test.mjs）と違い、
 * `lock_requested_by`/`lock_requested_at` を無条件クリアで済ませず、実装の SQL 文字列に
 * `IS DISTINCT FROM` が含まれているかを固定してから、その意味どおりに動かす——退行
 * （無条件 `= NULL` に戻す）を検出できるようにする。
 */
function makeLockDb(initial, { table }) {
  const row = { ...initial };
  return {
    row,
    queryAll: async () => [],
    queryOne: async (sql, params = []) => {
      if (sql.includes('SET locked_by') && sql.includes('RETURNING')) {
        assert.ok(
          sql.includes('lock_requested_by = CASE WHEN locked_by IS DISTINCT FROM'),
          'acquire の UPDATE は lock_requested_by を無条件 NULL にせず、持ち主が変わったときだけ消すこと（退行）',
        );
        assert.ok(
          sql.includes('lock_requested_at = CASE WHEN locked_by IS DISTINCT FROM'),
          'acquire の UPDATE は lock_requested_at も同じ CASE で守ること（退行）',
        );
        assert.ok(sql.includes("status != 'fixed'"), '確定済みガードが消えていないこと');
        const userId = params[0];
        const staleMs = 10 * 60 * 1000;
        const isStale = !row.locked_at || Date.now() - new Date(row.locked_at).getTime() > staleMs;
        const canAcquire = row.status !== 'fixed' && (!row.locked_by || row.locked_by === userId || isStale);
        if (!canAcquire) return undefined;
        const ownerChanged = row.locked_by !== userId; // SET 右辺と同じ: 更新前の locked_by と比較
        row.locked_by = userId;
        row.locked_at = new Date().toISOString();
        if (ownerChanged) {
          row.lock_requested_by = null;
          row.lock_requested_at = null;
        }
        return { id: row.id };
      }
      if (sql.includes('lock_requested_by')) {
        return { ...row, locked_by_name: row.locked_by ? `name:${row.locked_by}` : null, lock_requested_by_name: row.lock_requested_by ? `name:${row.lock_requested_by}` : null };
      }
      return undefined;
    },
    execute: async (sql) => {
      throw new Error(`${table} の acquire で execute() を呼んだ（無条件 UPDATE が復活している）: ${sql}`);
    },
    withTransaction: async (fn) => fn({ execute: async () => {}, queryOne: async () => undefined, queryAll: async () => [] }),
  };
}

test('acquireManualLock: 保持者本人が延長しても、他人からの「編集を要求」は消えない', async () => {
  const lockedAt = new Date(Date.now() - 30_000).toISOString();
  const db = makeLockDb(
    { id: 'm1', status: 'draft', locked_by: 'user-A', locked_at: lockedAt, lock_requested_by: 'user-B', lock_requested_at: new Date().toISOString() },
    { table: 'qsheet_manuals' },
  );
  const { acquireManualLock } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', {
    uuid: { v4: () => 'new-id' },
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'DOC-1' },
    './httpErrors': httpErrorsMock,
    './manual-resolve.service': { resolveLinkedBlock: async () => ({ data: null, updatedAt: null }) },
    './manual-template.service': { buildPagesForNewManual: async () => [] },
    '../../../shared/db/connection': db,
  });

  const result = await acquireManualLock('m1', 'user-A'); // 保持者本人のハートビート（延長）

  assert.equal(result.acquired, true);
  assert.equal(result.manual.lock_requested_by, 'user-B', '延長しても保留中の要求が残ること');
  assert.ok(result.manual.lock_requested_at, 'lock_requested_at も残ること');
});

test('acquireManualLock: 新しい保持者が空/staleなロックを取ったときは、古い要求をクリアする', async () => {
  const staleAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const db = makeLockDb(
    { id: 'm1', status: 'draft', locked_by: 'user-A', locked_at: staleAt, lock_requested_by: 'user-B', lock_requested_at: new Date().toISOString() },
    { table: 'qsheet_manuals' },
  );
  const { acquireManualLock } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', {
    uuid: { v4: () => 'new-id' },
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'DOC-1' },
    './httpErrors': httpErrorsMock,
    './manual-resolve.service': { resolveLinkedBlock: async () => ({ data: null, updatedAt: null }) },
    './manual-template.service': { buildPagesForNewManual: async () => [] },
    '../../../shared/db/connection': db,
  });

  const result = await acquireManualLock('m1', 'user-B'); // 要求していた本人が stale なロックを奪う

  assert.equal(result.acquired, true);
  assert.equal(result.manual.lock_requested_by, null, '持ち主が変わったら要求はクリアされること');
  assert.equal(result.manual.lock_requested_at, null);
});

test('acquireVenueLayoutLock: 保持者本人が延長しても、他人からの「編集を要求」は消えない', async () => {
  const lockedAt = new Date(Date.now() - 30_000).toISOString();
  const db = makeLockDb(
    { id: 'v1', status: 'draft', locked_by: 'user-A', locked_at: lockedAt, lock_requested_by: 'user-B', lock_requested_at: new Date().toISOString() },
    { table: 'qsheet_venue_layouts' },
  );
  const { acquireVenueLayoutLock } = await loadTs('server/src/contexts/qsheet/services/venue-layout.service.ts', {
    uuid: { v4: () => 'new-id' },
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'DOC-1' },
    './httpErrors': httpErrorsMock,
    '../../../shared/db/connection': db,
  });

  const result = await acquireVenueLayoutLock('v1', 'user-A'); // 保持者本人のハートビート（延長）

  assert.equal(result.acquired, true);
  assert.equal(result.layout.lockRequestedBy, 'user-B', '延長しても保留中の要求が残ること');
  assert.ok(result.layout.lockRequestedAt, 'lockRequestedAt も残ること');
});

test('acquireVenueLayoutLock: 新しい保持者が空/staleなロックを取ったときは、古い要求をクリアする', async () => {
  const staleAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const db = makeLockDb(
    { id: 'v1', status: 'draft', locked_by: 'user-A', locked_at: staleAt, lock_requested_by: 'user-B', lock_requested_at: new Date().toISOString() },
    { table: 'qsheet_venue_layouts' },
  );
  const { acquireVenueLayoutLock } = await loadTs('server/src/contexts/qsheet/services/venue-layout.service.ts', {
    uuid: { v4: () => 'new-id' },
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'DOC-1' },
    './httpErrors': httpErrorsMock,
    '../../../shared/db/connection': db,
  });

  const result = await acquireVenueLayoutLock('v1', 'user-B'); // 要求していた本人が stale なロックを奪う

  assert.equal(result.acquired, true);
  assert.equal(result.layout.lockRequestedBy, null, '持ち主が変わったら要求はクリアされること');
  assert.equal(result.layout.lockRequestedAt, null);
});
