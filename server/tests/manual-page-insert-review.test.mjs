import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段A/E — 外部レビュー再指摘（P1）: `fixManual()` の手順①（resolveループ）
// のあいだに `addPage()` がページを追加する競合は、確定直前のページ集合の再チェック
// （前巡の修正）だけでは閉じない——その再チェック自体がロックを取らない SELECT のまま
// だと、addPage() の「編集可能か」チェックとこの SELECT のどちらが先に走るかは保証
// されず、両者の間に挟まって INSERT されたページを見逃しうる（TOCTOU）。
// addPage() を1トランザクションにし、fixManual() と同じ冊子行ロック（FOR UPDATE OF m）
// を取り合ってから「編集可能か」を判定するようにした——ロックを取った後に読み直した
// 状態で assertEditable() を判定することを固定する（`getManualLockRowForUpdate`）。

class NotFoundError extends Error { constructor(m) { super(m); this.code = 'NOT_FOUND'; this.status = 404; } }
class ValidationError extends Error { constructor(m) { super(m); this.code = 'BAD_REQUEST'; this.status = 400; } }
class ConflictError extends Error { constructor(m) { super(m); this.code = 'CONFLICT'; this.status = 409; } }
class LockError extends Error { constructor(m) { super(m); this.code = 'LOCKED'; this.status = 409; } }

function baseDeps(overrides = {}) {
  return {
    uuid: { v4: () => 'new-page-id' },
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

/** `lockedManual` は、トランザクション内で FOR UPDATE 取得後に読み直したときの状態
 *  （省略時は draft・未ロック）。 */
function loadForAddPage({ lockedManual = lockRow(), maxSortOrder = -1 } = {}) {
  const forUpdateCalls = [];
  const inserted = [];
  return loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': {
      queryAll: async () => [],
      queryOne: async () => undefined,
      execute: async () => {},
      withTransaction: async (fn) => fn({
        queryOne: async (sql, params = []) => {
          if (sql.includes('lock_requested_by')) {
            forUpdateCalls.push(params);
            return lockedManual;
          }
          if (sql.includes('MAX(sort_order)')) {
            // ⚠️ FOR UPDATE より前に呼ばれたら、まだロックを取らずに編集可否を
            // 判定せず先へ進んでいる＝退行
            assert.equal(forUpdateCalls.length, 1, 'MAX(sort_order) の前に冊子行を FOR UPDATE でロックし、editableを判定すること');
            return { m: maxSortOrder };
          }
          if (sql.includes('SELECT id, manual_id, sort_order')) {
            return { id: 'new-page-id', manual_id: 'm1', sort_order: maxSortOrder + 1, chapter: null, title: '', blocks: [], created_at: 'now', updated_at: 'now' };
          }
          return undefined;
        },
        queryAll: async () => [],
        execute: async (sql, params = []) => {
          if (sql.startsWith('INSERT INTO qsheet_manual_pages')) inserted.push(params);
        },
      }),
    },
  })).then((mod) => ({ ...mod, forUpdateCalls, inserted }));
}

test('addPage: 冊子行を FOR UPDATE でロックしてから編集可否を判定し、挿入する', async () => {
  const { addPage, forUpdateCalls, inserted } = await loadForAddPage({ lockedManual: lockRow(), maxSortOrder: 2 });

  const row = await addPage('m1', 'me', { title: '新しいページ' });

  assert.deepEqual(forUpdateCalls[0], ['m1']);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0][2], 3, 'sort_order は既存の最大値+1');
  assert.equal(row.id, 'new-page-id');
});

test('addPage: FOR UPDATE取得後に読み直した状態が確定済みなら、挿入しない（ValidationError）——事前チェックとこのSELECTの間でfixManual()が割り込む競合を閉じる', async () => {
  const { addPage, inserted } = await loadForAddPage({ lockedManual: lockRow({ status: 'fixed' }) });

  await assert.rejects(() => addPage('m1', 'me', { title: 'x' }), (err) => err.code === 'BAD_REQUEST');
  assert.equal(inserted.length, 0);
});

test('addPage: FOR UPDATE取得後に読み直した状態が他人のロック中なら、挿入しない（LockError）', async () => {
  const { addPage, inserted } = await loadForAddPage({
    lockedManual: lockRow({ locked_by: 'other-user', locked_at: new Date().toISOString(), locked_by_name: '田中' }),
  });

  await assert.rejects(() => addPage('m1', 'me', { title: 'x' }), (err) => err.code === 'LOCKED');
  assert.equal(inserted.length, 0);
});

test('addPage: 冊子が見つからなければ NotFoundError（削除済み等）', async () => {
  // ⚠️ デフォルト引数は値が `undefined` のときに発動する——「未指定」を装うつもりで
  // `lockedManual: undefined` を渡すと既定の `lockRow()` に化けてしまうため、
  // ここでは区別できる `null` を渡す。
  const { addPage, inserted } = await loadForAddPage({ lockedManual: null });

  await assert.rejects(() => addPage('m1', 'me', { title: 'x' }), (err) => err.code === 'NOT_FOUND');
  assert.equal(inserted.length, 0);
});
