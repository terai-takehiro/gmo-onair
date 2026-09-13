import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 新規作成の project_id 検証（外部レビュー指摘 P1・§7-1）。
//
// `POST /manuals` は project_id を無検査で受け取っていた——指定した本人が created_by に
// なるため、`canAccessManual`（作成者本人 / 案件メンバー / 管理者）をそのまま通ってしまう。
// つまり editor 権限さえあれば他案件になりすまして冊子を作成でき、`resolve`（差し込み・
// 段C）経由でその案件のスケジュール表・収録/配信設定（配信の鍵・WEB会議のパスコード）・
// レンタル機材・機材貸出まで読めてしまう。`canAssignManualProject`（`access.ts`）は
// 新規作成の project_id を「呼び出し本人がその案件のメンバーか」で先に検査するための
// 唯一のゲート。

function makeDb(members) {
  return {
    queryOne: async (sql, params) => {
      const [projectId, userId] = params;
      const ok = members.some((m) => m.projectId === projectId && m.userId === userId);
      return ok ? { ok: true } : undefined;
    },
  };
}

async function loadAccess(members) {
  return loadTs('server/src/contexts/qsheet/access.ts', {
    '../../shared/db/connection': makeDb(members),
  });
}

test('canAssignManualProject: 案件メンバー（project_members）なら許可', async () => {
  const { canAssignManualProject } = await loadAccess([{ projectId: 'p1', userId: 'u1' }]);
  assert.equal(await canAssignManualProject({ id: 'u1', role: 'user' }, 'p1'), true);
});

test('canAssignManualProject: 自分がメンバーでない案件は拒否する（他案件へのなりすまし作成を防ぐ）', async () => {
  const { canAssignManualProject } = await loadAccess([{ projectId: 'p1', userId: 'u1' }]);
  assert.equal(await canAssignManualProject({ id: 'u1', role: 'user' }, 'p2'), false);
});

test('canAssignManualProject: system_admin は案件メンバーでなくても許可', async () => {
  const { canAssignManualProject } = await loadAccess([]);
  assert.equal(await canAssignManualProject({ id: 'admin', role: 'system_admin' }, 'any-project'), true);
});
