import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段A/E — 外部レビュー再指摘（P2）: deletePage() の「最後の1ページは
// 削除できない」という不変条件が「SELECT COUNT→JS判定→DELETE」の3段のままだった。
// 同じ冊子の別々のページをほぼ同時に消す2つのリクエストが両方 count=2 を見て両方
// DELETE でき、0ページの冊子ができてしまう。冊子行を `FOR UPDATE` でロックしてから
// 数える1トランザクションに直し、同じ冊子への deletePage を直列化した
// （`acquireManualLock` と同じ「不変条件は行ロックで守る」考え方）。

class NotFoundError extends Error { constructor(m) { super(m); this.code = 'NOT_FOUND'; this.status = 404; } }
class ValidationError extends Error { constructor(m) { super(m); this.code = 'BAD_REQUEST'; this.status = 400; } }
class ConflictError extends Error { constructor(m) { super(m); this.code = 'CONFLICT'; this.status = 409; } }
class LockError extends Error { constructor(m) { super(m); this.code = 'LOCKED'; this.status = 409; } }

function baseDeps(overrides = {}) {
  return {
    uuid: { v4: () => 'new-id' },
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'DOC-1' },
    './httpErrors': { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock: () => {} },
    './manual-resolve.service': { resolveLinkedBlock: async () => ({ data: null, updatedAt: null }) },
    './manual-template.service': { buildPagesForNewManual: async () => [] },
    ...overrides,
  };
}

function lockRow(overrides = {}) {
  return {
    id: 'm1', status: 'draft',
    locked_by: null, locked_at: null, locked_by_name: null,
    lock_requested_by: null, lock_requested_at: null, lock_requested_by_name: null,
    ...overrides,
  };
}

/** `pageIds`（現存するページ id の配列。テスト中に消えたら呼び出し側で splice する）を
 *  そのまま「いまの件数」として数える——SELECT COUNT を毎回叩き直すのと同じ形。 */
function loadForDeletePage(manual, pageIds) {
  const forUpdateCalls = [];
  const deleted = [];
  return loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': {
      queryAll: async () => [],
      queryOne: async (sql, params = []) => {
        if (sql.includes('lock_requested_by')) return manual;
        if (sql.includes('SELECT id FROM qsheet_manual_pages WHERE id')) {
          return pageIds.includes(params[0]) ? { id: params[0] } : undefined;
        }
        return undefined;
      },
      execute: async () => {},
      withTransaction: async (fn) => fn({
        execute: async (sql, params = []) => {
          if (sql.includes('FOR UPDATE')) forUpdateCalls.push(params);
          else if (sql.startsWith('DELETE FROM qsheet_manual_pages')) {
            deleted.push(params[0]);
            const i = pageIds.indexOf(params[0]);
            if (i >= 0) pageIds.splice(i, 1);
          }
        },
        // ⚠️ FOR UPDATE より前に呼ばれたら、まだロックを取らずに数えている＝退行
        queryOne: async (sql) => {
          if (sql.includes('COUNT(*)')) {
            assert.equal(forUpdateCalls.length, 1, 'COUNT の前に冊子行を FOR UPDATE でロックすること');
            return { c: pageIds.length };
          }
          return undefined;
        },
        queryAll: async () => [],
      }),
    },
  })).then((mod) => ({ ...mod, forUpdateCalls, deleted, pageIds }));
}

test('deletePage: 冊子行を FOR UPDATE でロックしてから件数を数え、削除する', async () => {
  const { deletePage, forUpdateCalls, deleted, pageIds } = await loadForDeletePage(lockRow(), ['page-1', 'page-2']);

  await deletePage('m1', 'page-1', 'me');

  assert.deepEqual(forUpdateCalls[0], ['m1']);
  assert.deepEqual(deleted, ['page-1']);
  assert.deepEqual(pageIds, ['page-2']);
});

test('deletePage: 最後の1ページは削除できない（ValidationError・実際に消えない）', async () => {
  const { deletePage, deleted } = await loadForDeletePage(lockRow(), ['page-1']);

  await assert.rejects(() => deletePage('m1', 'page-1', 'me'), (err) => err.code === 'BAD_REQUEST');
  assert.equal(deleted.length, 0);
});

test('deletePage: 他人が新しく持っているロック中は削除できない（LockError）', async () => {
  const { deletePage, forUpdateCalls } = await loadForDeletePage(
    lockRow({ locked_by: 'other-user', locked_at: new Date().toISOString(), locked_by_name: '田中' }),
    ['page-1', 'page-2'],
  );

  await assert.rejects(() => deletePage('m1', 'page-1', 'me'), (err) => err.code === 'LOCKED');
  assert.equal(forUpdateCalls.length, 0, 'ロックを検査する前にトランザクションへ入ってはいけない');
});
