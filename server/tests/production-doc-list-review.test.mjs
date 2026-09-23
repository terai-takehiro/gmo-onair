import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// MCP `list_production_docs`（doc-list.service.ts）に技術資料（qsheet_tech_docs）を足した
// ときの関所（tech-docs.md §7-5）。
//   - 技術資料は明示共有を持たない。見える範囲は `canAccessTechDoc` / `listTechDocs` と同じ
//     （作成者 / 案件メンバー / assigned_to / 管理者）。台本の「共有先」の条件を写し間違えると
//     他案件の技術構成（結線・当日スタッフの氏名）が MCP から漏れる
//   - `app` で種類を絞ったら、その表しか読まない（以前は sheet/schedule 以外を渡すと両方返った）

function makeDb(rowsByTable) {
  const calls = [];
  return {
    calls,
    db: {
      // 件数（fetchPage の COUNT）。rowsByTable の件数、または countByTable で上書きした件数を返す
      queryOne: async (sql) => {
        const table = Object.keys(rowsByTable).find((t) => sql.includes(`FROM ${t} `));
        const n = table ? (rowsByTable.__count?.[table] ?? rowsByTable[table].length) : 0;
        return { n };
      },
      queryAll: async (sql, params) => {
        calls.push({ sql, params });
        const table = Object.keys(rowsByTable).filter((t) => t !== '__count').find((t) => sql.includes(`FROM ${t} `));
        return table ? rowsByTable[table] : [];
      },
    },
  };
}

async function loadService(rowsByTable) {
  const { calls, db } = makeDb(rowsByTable);
  const mod = await loadTs('server/src/contexts/qsheet/services/production/doc-list.service.ts', {
    '../../../../shared/db/connection': db,
    '../../access': { isQsheetAdmin: (u) => u.role === 'system_admin' },
    '../../../../shared/production/miniapps': { docPathOf: (key, id) => `/${key}/${id}` },
  });
  return { ...mod, calls };
}

const TECH_ROW = {
  id: 'td1', doc_no: 'TD-202610-0001', title: '本番用', project_id: 'p1', gls_number: 'GLS-A001',
  status: 'draft', updated_at: '2026-09-20T00:00:00Z', updated_by_name: '山田',
};
const base = { limit: 20, page: 1 };

test('技術資料を app=tech の行として返す（date は null・URL は docPathOf）', async () => {
  const { listProductionDocs, calls } = await loadService({ qsheet_tech_docs: [TECH_ROW] });
  const res = await listProductionDocs({ id: 'u1', role: 'user' }, { ...base, app: 'tech' });
  assert.equal(calls.length, 1, 'app=tech のときは技術資料の表だけを読む');
  assert.deepEqual(res.docs, [{
    app: 'tech', id: 'td1', docNo: 'TD-202610-0001', title: '本番用', projectId: 'p1', glsNumber: 'GLS-A001',
    date: null, status: 'draft', updatedAt: '2026-09-20T00:00:00.000Z', updatedByName: '山田', url: '/tech/td1',
  }]);
});

test('技術資料の見える範囲は 作成者 / 案件メンバー / assigned_to（明示共有の表は見ない）', async () => {
  const { listProductionDocs, calls } = await loadService({});
  await listProductionDocs({ id: 'u1', role: 'user' }, { ...base, app: 'tech' });
  const { sql, params } = calls[0];
  assert.match(sql, /t\.deleted_at IS NULL/);
  assert.match(sql, /t\.created_by = \?/);
  assert.match(sql, /project_members pm WHERE pm\.project_id = t\.project_id AND pm\.user_id = \? AND pm\.deleted_at IS NULL/);
  assert.match(sql, /pj\.assigned_to = \?/);
  assert.doesNotMatch(sql, /_shares/);
  assert.deepEqual(params.slice(0, 3), ['u1', 'u1', 'u1']);
});

test('system_admin には行条件を付けない', async () => {
  const { listProductionDocs, calls } = await loadService({});
  await listProductionDocs({ id: 'admin', role: 'system_admin' }, { ...base, app: 'tech' });
  assert.doesNotMatch(calls[0].sql, /created_by/);
});

test('app 省略時は 台本・スケジュール表・技術資料 の3種を読み、更新の新しい順に混ぜる', async () => {
  const { listProductionDocs, calls } = await loadService({
    qsheet_documents: [{ id: 'd1', title: '台本', status: 'draft', section_count: 0, updated_at: '2026-09-19T00:00:00Z' }],
    qsheet_schedules: [{ id: 's1', title: '表', status: 'draft', updated_at: '2026-09-18T00:00:00Z' }],
    qsheet_tech_docs: [TECH_ROW],
  });
  const res = await listProductionDocs({ id: 'u1', role: 'user' }, base);
  assert.equal(calls.length, 3);
  assert.deepEqual(res.docs.map((d) => `${d.app}:${d.url}`), ['tech:/tech/td1', 'sheet:/sheet/d1', 'schedule:/schedule/s1']);
  assert.equal(res.pagination.total, 3);
});

test('date 絞り込みは技術資料では作業日（スタッフ行）で当てる', async () => {
  const { listProductionDocs, calls } = await loadService({});
  await listProductionDocs({ id: 'admin', role: 'system_admin' }, { ...base, app: 'tech', date: '2026-10-15' });
  assert.match(calls[0].sql, /qsheet_tech_staff_rows sr WHERE sr\.tech_doc_id = t\.id AND sr\.work_date = \?/);
  assert.ok(calls[0].params.includes('2026-10-15'));
});

test('件数は COUNT で数え、要求されたページに要る件数（page × limit）だけ取る（200件で打ち切らない）', async () => {
  const { listProductionDocs, calls } = await loadService({ qsheet_tech_docs: [TECH_ROW], __count: { qsheet_tech_docs: 250 } });
  const res = await listProductionDocs({ id: 'admin', role: 'system_admin' }, { limit: 100, page: 3, app: 'tech' });
  assert.equal(res.pagination.total, 250, '200 に張り付かない');
  assert.equal(res.pagination.totalPages, 3);
  const { params } = calls[0];
  assert.equal(params[params.length - 1], 300, '3ページ目を組むのに要る 300 件を取る');
});
