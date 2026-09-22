import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 技術資料（tech-docs.md §5-4「行の可視性」）の関所。
//
// 資料は案件の技術構成（映像パッチの結線・当日の技術スタッフの氏名）そのもので、
// `qsheet` reader を持つだけの利用者に他案件のぶんまで見せてはいけない。
// ルート側は見えない資料を **404** にする（存在秘匿）ので、ここが唯一のゲート。
//   - `canAccessTechDoc`      … 読む側（作成者 / 案件メンバー / assigned_to / 管理者）
//   - `canAssignTechDocProject` … 作る側（他案件になりすまして作成するのを止める。
//     作成者は自分になるので、作ったあとは `canAccessTechDoc` を素通りしてしまう）

/** `queryOne` の代わり。params は [対象id, userId] の順（access.ts の2本とも同じ形） */
function makeDb(allowed) {
  return {
    queryOne: async (_sql, params) => {
      const [targetId, userId] = params;
      return allowed.some((a) => a.targetId === targetId && a.userId === userId) ? { ok: true } : undefined;
    },
  };
}

async function loadAccess(allowed) {
  return loadTs('server/src/contexts/qsheet/access.ts', {
    '../../shared/db/connection': makeDb(allowed),
  });
}

test('canAccessTechDoc: 作成者本人は DB を引くまでもなく許可', async () => {
  const { canAccessTechDoc } = await loadAccess([]);
  assert.equal(await canAccessTechDoc({ id: 'u1', role: 'user' }, 'doc1', 'u1'), true);
});

test('canAccessTechDoc: 案件メンバー（project_members / assigned_to）なら許可', async () => {
  const { canAccessTechDoc } = await loadAccess([{ targetId: 'doc1', userId: 'u2' }]);
  assert.equal(await canAccessTechDoc({ id: 'u2', role: 'user' }, 'doc1', 'u1'), true);
});

test('canAccessTechDoc: 無関係な利用者は拒否する（ルートは404にする）', async () => {
  const { canAccessTechDoc } = await loadAccess([{ targetId: 'doc1', userId: 'u2' }]);
  assert.equal(await canAccessTechDoc({ id: 'u3', role: 'user' }, 'doc1', 'u1'), false);
});

test('canAccessTechDoc: system_admin は素通し', async () => {
  const { canAccessTechDoc } = await loadAccess([]);
  assert.equal(await canAccessTechDoc({ id: 'admin', role: 'system_admin' }, 'doc1', 'u1'), true);
});

test('canAssignTechDocProject: 自分がメンバーでない案件では作らせない（なりすまし作成）', async () => {
  const { canAssignTechDocProject } = await loadAccess([{ targetId: 'p1', userId: 'u1' }]);
  assert.equal(await canAssignTechDocProject({ id: 'u1', role: 'user' }, 'p1'), true);
  assert.equal(await canAssignTechDocProject({ id: 'u1', role: 'user' }, 'p2'), false);
});

test('canAssignTechDocProject: system_admin は案件メンバーでなくても許可', async () => {
  const { canAssignTechDocProject } = await loadAccess([]);
  assert.equal(await canAssignTechDocProject({ id: 'admin', role: 'system_admin' }, 'any-project'), true);
});
