import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段E — レビュー指摘の再発防止。
//
// 1) deleteManual() は他の更新系5関数（updateManual/addPage/updatePage/deletePage/
//    reorderPages）と同じ `assertEditable()` を通す（§6-2-1「誰かが編集している間、
//    その冊子は他の人からは読むだけになる」・確定済みは編集不可）。ここだけ検査が
//    抜けていると、ロック保持者の作業中や確定・配布済みの冊子でも editor 権限だけで
//    まるごと消せてしまう。
// 2) acquireManualLock() は「SELECT→JS判定→UPDATE」の2段ではなく、条件を WHERE 句に
//    入れた1文の UPDATE（CAS）でなければならない——2段だと、ロックが空/stale の
//    タイミングで2人がほぼ同時に呼んだとき両方に acquired:true が返ってしまう。
// 3) fixManual() は resolveLinkedBlock() を await している間に着地した他人の保存を
//    無音で上書きしてはいけない。書く直前にもう一度 updated_at を確かめ、変わっていたら
//    確定処理全体をロールバックする。

class NotFoundError extends Error {
  constructor(message) { super(message); this.code = 'NOT_FOUND'; this.status = 404; }
}
class ValidationError extends Error {
  constructor(message) { super(message); this.code = 'BAD_REQUEST'; this.status = 400; }
}
class ConflictError extends Error {
  constructor(message, currentUpdatedAt, updatedByName) {
    super(message);
    this.code = 'CONFLICT';
    this.status = 409;
    this.extra = { current_updated_at: currentUpdatedAt, updated_by_name: updatedByName };
  }
}
class LockError extends Error {
  constructor(message, lockedBy, lockedByName) {
    super(message);
    this.code = 'LOCKED';
    this.status = 409;
    this.extra = { locked_by: lockedBy, locked_by_name: lockedByName };
  }
}
function checkOptimisticLock() { /* このテスト群では使わない（no-op） */ }

const httpErrorsMock = { NotFoundError, ValidationError, ConflictError, LockError, checkOptimisticLock };

function baseDeps(overrides = {}) {
  return {
    uuid: { v4: () => 'new-id' },
    '../access': { isQsheetAdmin: () => false },
    './docNo.service': { issueDocNo: async () => 'DOC-1' },
    './httpErrors': httpErrorsMock,
    './manual-resolve.service': { resolveLinkedBlock: async () => ({ data: null, updatedAt: null }) },
    './manual-template.service': { buildPagesForNewManual: async () => [] },
    ...overrides,
  };
}

// ============================================================
// 1) deleteManual() の assertEditable 抜け
// ============================================================

function lockRow(overrides = {}) {
  return {
    id: 'm1', status: 'draft',
    locked_by: null, locked_at: null, locked_by_name: null,
    lock_requested_by: null, lock_requested_at: null, lock_requested_by_name: null,
    ...overrides,
  };
}

async function loadForDelete(manual) {
  const executed = [];
  const mod = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': {
      queryAll: async () => [],
      queryOne: async (sql, params = []) => {
        if (sql.includes('lock_requested_by')) return manual;
        if (sql.includes('UPDATE qsheet_manuals') && sql.includes('SET deleted_at') && sql.includes('RETURNING')) {
          // deleteManual の CAS。WHERE 句と同じ条件（assertEditable と同じ判定）を
          // ここでも評価する——退行（無条件 UPDATE に戻る）したらこの判定を素通りして
          // 常に成功してしまうので、このテストは「条件を実際に見ているか」も兼ねて固定する。
          const [manualId, userId] = params;
          if (manualId !== manual.id || manual.status === 'fixed') return undefined;
          const staleMs = 10 * 60 * 1000;
          const isStale = !manual.locked_at || Date.now() - new Date(manual.locked_at).getTime() > staleMs;
          const canDelete = !manual.locked_by || manual.locked_by === userId || isStale;
          if (!canDelete) return undefined;
          executed.push({ sql, params });
          return { id: manualId };
        }
        return undefined;
      },
      execute: async () => {},
      withTransaction: async (fn) => fn({ execute: async () => {}, queryOne: async () => undefined, queryAll: async () => [] }),
    },
  }));
  return { ...mod, executed };
}

test('deleteManual: 他人が新しく持っているロック中は削除できない（LockError・実際に消えない）', async () => {
  const { deleteManual, executed } = await loadForDelete(
    lockRow({ locked_by: 'other-user', locked_at: new Date().toISOString(), locked_by_name: '田中' }),
  );

  await assert.rejects(() => deleteManual('m1', 'me'), (err) => err.code === 'LOCKED');
  assert.equal(executed.length, 0, 'ロックを検査する前に削除の UPDATE を投げてはいけない');
});

test('deleteManual: 確定済み（fixed）は保持者本人でも削除できない（ValidationError）', async () => {
  const { deleteManual, executed } = await loadForDelete(lockRow({ status: 'fixed', locked_by: 'me', locked_at: new Date().toISOString() }));

  await assert.rejects(() => deleteManual('m1', 'me'), (err) => err.code === 'BAD_REQUEST');
  assert.equal(executed.length, 0);
});

test('deleteManual: 保持者本人・下書きなら削除できる', async () => {
  const { deleteManual, executed } = await loadForDelete(lockRow({ locked_by: 'me', locked_at: new Date().toISOString() }));

  await deleteManual('m1', 'me');
  assert.equal(executed.length, 1);
  assert.match(executed[0].sql, /UPDATE qsheet_manuals[\s\S]*SET deleted_at/);
});

test('deleteManual: ロックが10分より古い（stale）なら他人でも削除できる', async () => {
  const staleAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const { deleteManual, executed } = await loadForDelete(lockRow({ locked_by: 'other-user', locked_at: staleAt }));

  await deleteManual('m1', 'me');
  assert.equal(executed.length, 1);
});

test('deleteManual: 事前チェックの直後に別の manager が takeover していたら、その冊子は消えない（外部レビュー再指摘）', async () => {
  // 呼び出し時点（assertEditable の事前チェック）では自分がまだ保持者だが、その直後に
  // takeover が割り込んで保持者が変わった、というレースを再現する。事前チェック用の
  // 1回目の読み取りだけ「自分が保持者」を返し、以後（＝実際の DB の状態）は
  // 「manager-1 が保持者」を返す——無条件 UPDATE（WHERE id のみ）に戻っていたら、
  // この新しい保持者のロックを無視して消えてしまう。
  let lockReads = 0;
  const trueState = { locked_by: 'manager-1', locked_at: new Date().toISOString() };
  const mod = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': {
      queryAll: async () => [],
      queryOne: async (sql, params = []) => {
        if (sql.includes('lock_requested_by')) {
          lockReads += 1;
          if (lockReads === 1) return lockRow({ locked_by: 'me', locked_at: new Date().toISOString() }); // 事前チェック時点
          return lockRow(trueState); // 以後（フォールバックの再取得）は実際の状態
        }
        if (sql.includes('UPDATE qsheet_manuals') && sql.includes('SET deleted_at') && sql.includes('RETURNING')) {
          const [, userId] = params;
          // 実際の WHERE 句と同じ判定——事前チェックの古い認識ではなく「いまの」保持者と比較する
          if (trueState.locked_by && trueState.locked_by !== userId) return undefined;
          return { id: 'm1' };
        }
        return undefined;
      },
      execute: async () => {},
      withTransaction: async (fn) => fn({ execute: async () => {}, queryOne: async () => undefined, queryAll: async () => [] }),
    },
  }));

  await assert.rejects(() => mod.deleteManual('m1', 'me'), (err) => err.code === 'LOCKED');
});

// ============================================================
// 2) acquireManualLock() の非アトミックな SELECT→UPDATE
// ============================================================

function makeLockDb(initial) {
  const row = { ...initial };
  return {
    row,
    queryAll: async () => [],
    queryOne: async (sql, params = []) => {
      if (sql.includes('SET locked_by') && sql.includes('RETURNING')) {
        // acquireManualLock の CAS。WHERE 句と同じ条件をここでも評価し、
        // 「取れる」ときだけ実際に書き換えてから RETURNING id 相当を返す。
        const [userId] = params;
        const staleMs = 10 * 60 * 1000;
        const isStale = !row.locked_at || Date.now() - new Date(row.locked_at).getTime() > staleMs;
        const canAcquire = !row.locked_by || row.locked_by === userId || isStale;
        if (!canAcquire) return undefined;
        row.locked_by = userId;
        row.locked_at = new Date().toISOString();
        row.lock_requested_by = null;
        row.lock_requested_at = null;
        return { id: row.id };
      }
      if (sql.includes('lock_requested_by')) {
        return { ...row, locked_by_name: row.locked_by ? `name:${row.locked_by}` : null };
      }
      return undefined;
    },
    // ⚠️ acquireManualLock はもう `execute()` で無条件 UPDATE を書いてはいけない
    // （それこそが2段構えの非アトミックな旧実装の形）。呼ばれたら壊れている。
    execute: async (sql) => {
      throw new Error(`acquireManualLock が execute() を呼んだ（無条件 UPDATE が復活している）: ${sql}`);
    },
    withTransaction: async (fn) => fn({ execute: async () => {}, queryOne: async () => undefined, queryAll: async () => [] }),
  };
}

async function loadForLock(db) {
  return loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));
}

test('acquireManualLock: ロックが空のときに2人がほぼ同時に取りに行っても、片方しか取れない', async () => {
  const db = makeLockDb({ id: 'm1', status: 'draft', locked_by: null, locked_at: null, lock_requested_by: null, lock_requested_at: null });
  const { acquireManualLock } = await loadForLock(db);

  const first = await acquireManualLock('m1', 'user-A');
  const second = await acquireManualLock('m1', 'user-B');

  assert.equal(first.acquired, true);
  assert.equal(second.acquired, false, '空/stale のロックを2人とも取れてはいけない');
  assert.equal(second.manual.locked_by, 'user-A');
});

test('acquireManualLock: 保持者本人が呼ぶとハートビートとして取れたままになる', async () => {
  const lockedAt = new Date(Date.now() - 30_000).toISOString();
  const db = makeLockDb({ id: 'm1', status: 'draft', locked_by: 'user-A', locked_at: lockedAt, lock_requested_by: null, lock_requested_at: null });
  const { acquireManualLock } = await loadForLock(db);

  const result = await acquireManualLock('m1', 'user-A');
  assert.equal(result.acquired, true);
});

test('acquireManualLock: stale なロックは他人でも取れる', async () => {
  const staleAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const db = makeLockDb({ id: 'm1', status: 'draft', locked_by: 'user-A', locked_at: staleAt, lock_requested_by: null, lock_requested_at: null });
  const { acquireManualLock } = await loadForLock(db);

  const result = await acquireManualLock('m1', 'user-B');
  assert.equal(result.acquired, true);
});

// ============================================================
// 2b) releaseManualLock() の非アトミックな「JSで比較→UPDATE」
//     （外部レビュー再指摘 P2）
// ============================================================

/** `execute()` の WHERE 句をそのまま評価する疑似 DB（`locked_by` の一致まで見る） */
function makeReleaseDb(initial) {
  const row = { ...initial };
  return {
    row,
    queryAll: async () => [],
    queryOne: async (sql) => (sql.includes('lock_requested_by') ? { ...row, locked_by_name: null } : undefined),
    execute: async (sql, params = []) => {
      if (sql.includes('SET locked_by = NULL')) {
        // ⚠️ レビュー指摘: 以前は `WHERE id = ?` だけで `locked_by` を条件に含めて
        // いなかった——ここでその条件を実際に評価することで、含めていない実装に
        // 戻ったら（=常にロックを消してしまったら）テストが検出する。
        assert.equal(sql.includes('locked_by = ?'), true, 'release の UPDATE 自体に locked_by の一致条件が無い（退行）');
        const [manualId, userId] = params;
        if (manualId === row.id && row.locked_by === userId) {
          row.locked_by = null;
          row.locked_at = null;
        }
      }
    },
    withTransaction: async (fn) => fn({ execute: async () => {}, queryOne: async () => undefined, queryAll: async () => [] }),
  };
}

test('releaseManualLock: 直前に他人（manager の takeover）へ移っていたら、その新しいロックを消さない', async () => {
  // 「JSで比較→UPDATE」の2段だったころの再現: 呼び出し時点では自分が保持者だったが、
  // takeover が先に割り込んで保持者が変わった状態を渡す（=いま現在の DB の状態）。
  const db = makeReleaseDb({ id: 'm1', locked_by: 'manager-1', locked_at: new Date().toISOString() });
  const { releaseManualLock } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));

  const result = await releaseManualLock('m1', 'me'); // 自分（me）はもう保持者ではない

  assert.equal(result.locked_by, 'manager-1', 'takeover 後の新しいロックが残る');
});

test('releaseManualLock: 自分が保持者のときは放せる', async () => {
  const db = makeReleaseDb({ id: 'm1', locked_by: 'me', locked_at: new Date().toISOString() });
  const { releaseManualLock } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', baseDeps({
    '../../../shared/db/connection': db,
  }));

  const result = await releaseManualLock('m1', 'me');

  assert.equal(result.locked_by, null);
});

// ============================================================
// 3) fixManual() が解決待ちの間に着地した編集を無音で上書きする
// ============================================================

function linkedBlock(id) {
  return { id, kind: 'linked', x: 0, y: 0, w: 10, h: 10, z: 1, style: {}, link: { block: 'schedule.day', sourceId: null } };
}
function freeBlock(id) {
  return { id, kind: 'free', x: 0, y: 0, w: 10, h: 10, z: 1, style: {}, free: { type: 'text', content: { text: 'concurrent edit' } } };
}

function makeFixDb({ manual, page }) {
  const state = { manual: { ...manual }, page: { ...page } };
  return {
    state,
    queryAll: async (sql) => {
      if (sql.includes('FROM qsheet_manual_pages')) {
        return [{ id: state.page.id, manual_id: state.manual.id, sort_order: 0, chapter: null, title: '', blocks: state.page.blocks, created_at: state.page.updated_at, updated_at: state.page.updated_at }];
      }
      return [];
    },
    queryOne: async (sql) => {
      if (sql.includes('FROM qsheet_manuals WHERE id')) {
        return {
          id: state.manual.id, status: state.manual.status, project_id: state.manual.project_id,
          program_id: state.manual.program_id, service_date: null, updated_at: state.manual.updated_at,
        };
      }
      if (sql.includes('FROM qsheet_manuals m')) {
        // fixManual() 最後の getManualWithMeta()（SELECT_BASE）。中身はこのテストでは見ない
        return { id: state.manual.id, status: state.manual.status, rev: 1 };
      }
      return undefined;
    },
    execute: async () => {},
    withTransaction: async (fn) => {
      const pendingPages = new Map();
      let pendingManualFixed = false;
      const tx = {
        // fixManual() は「SELECT→JS比較→UPDATE」の2段ではなく、比較を WHERE 句に畳み込んだ
        // 1文の条件付き UPDATE（RETURNING id）を1回だけ投げる（acquireManualLock と同じ CAS）。
        // ここでその WHERE 句と同じ判定を行い、一致するときだけ実際に反映して行を返す。
        // 不一致（＝競合）のときは undefined を返し、fixManual 側の後続 SELECT（フォールバック）
        // が「いまの updated_at」を返せるよう state.page.updated_at をそのまま見せる。
        // ページ側だけでなく冊子行そのもの（外部レビュー再指摘: service_date 等の
        // メタデータ変更もfixの巻き添え検出対象）も同じ CAS 形で判定する。
        queryOne: async (sql, params = []) => {
          if (sql.includes('UPDATE qsheet_manual_pages') && sql.includes('SET blocks') && sql.includes('RETURNING')) {
            const [blocksJson, pageId, expectedUpdatedAt] = params;
            const matches = pageId === state.page.id
              && new Date(expectedUpdatedAt).getTime() === new Date(state.page.updated_at).getTime();
            if (!matches) return undefined;
            pendingPages.set(pageId, blocksJson);
            return { id: pageId };
          }
          if (sql.includes("UPDATE qsheet_manuals") && sql.includes("SET status = 'fixed'") && sql.includes('RETURNING')) {
            const [, , , manualId, expectedUpdatedAt] = params;
            const matches = manualId === state.manual.id
              && new Date(expectedUpdatedAt).getTime() === new Date(state.manual.updated_at).getTime();
            if (!matches) return undefined;
            pendingManualFixed = true;
            return { id: manualId };
          }
          if (sql.startsWith('SELECT updated_at FROM qsheet_manual_pages')) {
            return { updated_at: state.page.updated_at };
          }
          if (sql.startsWith('SELECT updated_at FROM qsheet_manuals')) {
            return { updated_at: state.manual.updated_at };
          }
          return undefined;
        },
        execute: async () => {},
        // fixManual() が①のあいだにページが追加/削除されていないかを確認する
        // `SELECT id FROM qsheet_manual_pages WHERE manual_id = ?`（外部レビュー再指摘）。
        // このテスト群ではページの増減は起きないので、現在の1ページをそのまま返す。
        queryAll: async (sql) => {
          if (sql.includes('SELECT id FROM qsheet_manual_pages')) return [{ id: state.page.id }];
          return [];
        },
      };
      // fn(tx) が throw したら、ここから下（pending の反映）を実行せずそのまま
      // 呼び出し元へ伝播する ＝ ROLLBACK 相当（pendingPages / pendingManualFixed は state に
      // 反映しない）。
      const result = await fn(tx);
      for (const [pageId, blocksJson] of pendingPages) {
        if (pageId === state.page.id) {
          state.page.blocks = JSON.parse(blocksJson);
          state.page.updated_at = '2026-09-01T10:00:10.000Z';
        }
      }
      if (pendingManualFixed) state.manual.status = 'fixed';
      return result;
    },
  };
}

test('fixManual: 解決の待ち時間中に着地した編集は消さず、確定処理をロールバックする', async () => {
  const db = makeFixDb({
    manual: { id: 'm1', status: 'draft', project_id: 'p1', program_id: null, updated_at: '2026-09-01T09:00:00.000Z' },
    page: { id: 'page-1', blocks: [linkedBlock('blk-1')], updated_at: '2026-09-01T10:00:00.000Z' },
  });

  const deps = baseDeps({
    '../../../shared/db/connection': db,
    './manual-resolve.service': {
      resolveLinkedBlock: async () => {
        // resolve の最中に、別のユーザーが同じページを保存したことにする
        db.state.page.blocks = [...db.state.page.blocks, freeBlock('new-from-editor')];
        db.state.page.updated_at = '2026-09-01T10:00:05.000Z';
        return { data: { some: 'resolved' }, updatedAt: null };
      },
    },
  });
  const { fixManual } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', deps);

  await assert.rejects(() => fixManual('m1', { id: 'manager-1', role: 'manager' }), (err) => err.code === 'CONFLICT');

  assert.equal(db.state.manual.status, 'draft', '確定処理全体がロールバックされ、fixed になっていてはいけない');
  assert.equal(
    db.state.page.blocks.some((b) => b.id === 'new-from-editor'),
    true,
    '確定処理中に着地した編集が消えてはいけない',
  );
});

test('fixManual: 何も競合しなければ差し込みブロックを凍らせて fixed にする', async () => {
  const db = makeFixDb({
    manual: { id: 'm1', status: 'draft', project_id: 'p1', program_id: null, updated_at: '2026-09-01T09:00:00.000Z' },
    page: { id: 'page-1', blocks: [linkedBlock('blk-1')], updated_at: '2026-09-01T10:00:00.000Z' },
  });

  const deps = baseDeps({
    '../../../shared/db/connection': db,
    './manual-resolve.service': { resolveLinkedBlock: async () => ({ data: { some: 'resolved' }, updatedAt: null }) },
  });
  const { fixManual } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', deps);

  await fixManual('m1', { id: 'manager-1', role: 'manager' });

  assert.equal(db.state.manual.status, 'fixed');
  assert.equal(db.state.page.blocks[0].link.frozen.data.some, 'resolved');
});

test('fixManual: ①（resolveループ）の間に新しいページが追加されると、確定処理をロールバックする（外部レビュー再指摘）', async () => {
  // addPage() は qsheet_manuals.updated_at を進めないため、ページ側・冊子側どちらの
  // CAS ガードも新しいページの出現を検出できない——確定の直前にもう一度ページ集合を
  // 数え、①で読んだ集合と完全に一致することを別途確認する仕組みを固定する。
  let pageAppeared = false;
  const deps = baseDeps({
    '../../../shared/db/connection': {
      queryAll: async (sql) => (sql.includes('FROM qsheet_manual_pages')
        ? [{ id: 'page-1', manual_id: 'm1', sort_order: 0, chapter: null, title: '', blocks: [linkedBlock('blk-1')], created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z' }]
        : []),
      queryOne: async (sql) => (sql.includes('FROM qsheet_manuals WHERE id')
        ? { id: 'm1', status: 'draft', project_id: 'p1', program_id: null, service_date: null, updated_at: '2026-09-01T09:00:00.000Z' }
        : undefined),
      execute: async () => {},
      withTransaction: async (fn) => fn({
        execute: async () => {},
        queryOne: async () => undefined, // 到達しないはず（ページ集合の不一致で先にロールバックする）
        queryAll: async (sql) => {
          if (!sql.includes('SELECT id FROM qsheet_manual_pages')) return [];
          // resolve ループの最中に addPage() が起きた、といういまの姿
          return pageAppeared ? [{ id: 'page-1' }, { id: 'page-2' }] : [{ id: 'page-1' }];
        },
      }),
    },
    './manual-resolve.service': {
      resolveLinkedBlock: async () => {
        pageAppeared = true; // ①のあいだにロック保持者が新しいページを追加したことにする
        return { data: { some: 'resolved' }, updatedAt: null };
      },
    },
  });
  const { fixManual } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', deps);

  await assert.rejects(
    () => fixManual('m1', { id: 'manager-1', role: 'manager' }),
    (err) => err.code === 'CONFLICT' && /追加\/削除/.test(err.message),
  );
});

test('fixManual: トランザクションの最初に冊子行を FOR UPDATE でロックしてから、ページ集合を数える（外部レビュー再指摘・2回目——addPage()と同じロックを取り合う）', async () => {
  const calls = [];
  const deps = baseDeps({
    '../../../shared/db/connection': {
      queryAll: async (sql) => (sql.includes('FROM qsheet_manual_pages')
        ? [{ id: 'page-1', manual_id: 'm1', sort_order: 0, chapter: null, title: '', blocks: [], created_at: '2026-09-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z' }]
        : []),
      queryOne: async (sql) => (sql.includes('FROM qsheet_manuals WHERE id')
        ? { id: 'm1', status: 'draft', project_id: 'p1', program_id: null, service_date: null, updated_at: '2026-09-01T09:00:00.000Z' }
        : undefined),
      execute: async () => {},
      withTransaction: async (fn) => fn({
        execute: async () => {},
        queryOne: async (sql) => {
          if (sql.includes('lock_requested_by')) {
            calls.push('lock');
            return { id: 'm1', status: 'draft' };
          }
          return undefined;
        },
        queryAll: async (sql) => {
          if (!sql.includes('SELECT id FROM qsheet_manual_pages')) return [];
          calls.push('page-set-check');
          // ⚠️ FOR UPDATE より前にページ集合を数えていたら退行（TOCTOUが再発）
          assert.deepEqual(calls, ['lock', 'page-set-check'], '冊子行のロック取得はページ集合の再チェックより前でなければならない');
          return [{ id: 'page-1' }];
        },
      }),
    },
    './manual-resolve.service': { resolveLinkedBlock: async () => ({ data: null, updatedAt: null }) },
  });
  const { fixManual } = await loadTs('server/src/contexts/qsheet/services/manual.service.ts', deps);

  // ページ側・冊子側のCAS UPDATEはこのモックでは常にundefined（未対応）を返すため
  // 確定処理自体はConflictErrorで終わる——ここで固定したいのは呼び出し順序だけ。
  await assert.rejects(() => fixManual('m1', { id: 'manager-1', role: 'manager' }));
  assert.deepEqual(calls, ['lock', 'page-set-check']);
});
