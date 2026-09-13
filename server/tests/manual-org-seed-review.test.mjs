import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル — 体制図ブロックの「取り込み」元（docs/design/v4/production-manual-orgchart.md §5-4・§5-5）。
//
// 列名を migration で確認した事実に釘付けにする試験。ここを外すと本番でしか気づけない:
//   - `gpm_members` には `deleted_at` 列が無い（161/169/179。体制は物理削除）——
//     `WHERE ... AND deleted_at IS NULL` を書くと SQL エラーになる
//   - `gpm_project_id` は 179 で消えた。`project_id` が `projects(id)` を直接指すので
//     `gpm_projects` を経由する JOIN は要らない
//   - 逆に `project_members`（130）は論理削除あり ＝ `deleted_at IS NULL` が要る
// あわせて、画面へ区分の値（'internal' 等）を渡さない（§10-2）ことと、
// 電話は社内ユーザーだけ（§5-4）という規律を固定する。
// **権限**（レビュー指摘 P1）はファイル末尾の節で固定する。

async function loadOrgSeed({ memberRows = [], gpmRows = [], onSql } = {}) {
  return loadTs('server/src/contexts/qsheet/services/manual-org-seed.service.ts', {
    '../../../shared/db/connection': {
      async queryAll(sql, params) {
        if (onSql) onSql(sql, params);
        return sql.includes('gpm_members') ? gpmRows : memberRows;
      },
    },
  });
}

function gpmRow(overrides = {}) {
  return {
    name: '山田 花子', org: null, role: null, email: null,
    side: 'internal', tier: 'unit', group_label: null, badge: null,
    ...overrides,
  };
}

test('getManualOrgSeed: projectId が null（program 紐づけのマニュアル）なら両方とも空・SQLも投げない', async () => {
  let calls = 0;
  const { getManualOrgSeed } = await loadOrgSeed({ onSql: () => { calls++; } });

  const seed = await getManualOrgSeed(null, { canReadGpm: true });

  assert.deepEqual(seed, { projectMembers: [], gpmTiers: [] });
  assert.equal(calls, 0, '案件が無いのに DB を読まない');
});

test('getManualOrgSeed: gpm_members の SQL は deleted_at を使わない（この表に列が無い＝書くとSQLエラー）', async () => {
  let gpmSql = '';
  let memberSql = '';
  const { getManualOrgSeed } = await loadOrgSeed({
    onSql: (sql) => { if (sql.includes('gpm_members')) gpmSql = sql; else memberSql = sql; },
  });

  await getManualOrgSeed('proj-1', { canReadGpm: true });

  assert.equal(gpmSql.includes('deleted_at'), false, 'gpm_members に deleted_at 列は無い（161/169/179）');
  assert.equal(gpmSql.includes('gpm_project_id'), false, 'gpm_project_id は 179 で消えた');
  assert.equal(gpmSql.includes('gpm_projects'), false, 'project_id が projects(id) を直接指すので JOIN は要らない');
  assert.ok(gpmSql.includes('project_id = $1'));
  // project_members のほうは逆に論理削除あり（migration 130）
  assert.ok(memberSql.includes('deleted_at IS NULL'), 'project_members は deleted_at IS NULL が要る');
});

test('getManualOrgSeed: gpm_members の SQL は migration で確認した列だけを読む', async () => {
  let gpmSql = '';
  const { getManualOrgSeed } = await loadOrgSeed({
    onSql: (sql) => { if (sql.includes('gpm_members')) gpmSql = sql; },
  });

  await getManualOrgSeed('proj-1', { canReadGpm: true });

  for (const col of ['name', 'org', 'role', 'email', 'side', 'tier', 'group_label', 'badge']) {
    assert.ok(gpmSql.includes(col), `${col} を読む`);
  }
  assert.equal(gpmSql.includes('phone'), false, 'gpm_members に電話の列は無い（users を JOIN しない）');
  assert.equal(gpmSql.includes('updated_at'), false, 'gpm_members に updated_at 列は無い');
});

test('getManualOrgSeed: side は日本語の文字になる（区分の値を画面へ渡さない）', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    gpmRows: [
      gpmRow({ name: '発注 太郎', side: 'client', tier: 'top', group_label: '全体統括' }),
      gpmRow({ name: 'PM 花子', side: 'pm', tier: 'lead', group_label: '進行管理' }),
      gpmRow({ name: '業者 次郎', side: 'vendor', tier: 'unit', group_label: '施工ユニット' }),
      gpmRow({ name: '自社 三郎', side: 'internal', tier: 'unit', group_label: '技術ユニット' }),
    ],
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: true });

  assert.deepEqual(seed.gpmTiers.map((t) => t.label), ['決裁層', '推進層', '実務層']);
  assert.equal(seed.gpmTiers[0].boxes[0].org, '発注者');
  assert.equal(seed.gpmTiers[1].boxes[0].org, 'PM会社');
  assert.deepEqual(seed.gpmTiers[2].boxes.map((b) => b.org), ['業者', '自社']);

  // 応答の**値**に区分の生の値が1つも残っていないこと（キー名は対象外＝ gpmTiers に 'pm' が含まれる）
  const values = [];
  const walk = (v) => {
    if (typeof v === 'string') values.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(seed);
  for (const raw of ['internal', 'client', 'pm', 'vendor', 'top', 'lead', 'unit']) {
    assert.equal(values.includes(raw), false, `区分の値 ${raw} をそのまま画面へ渡さない`);
  }
});

test('getManualOrgSeed: tier → 階層 / group_label → チーム に組み上げる', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    gpmRows: [
      gpmRow({ name: '技術 一郎', tier: 'unit', group_label: '技術', role: '音声', org: '東洋中継', email: 'a@example.com', badge: '進行' }),
      gpmRow({ name: '技術 二郎', tier: 'unit', group_label: '技術' }),
      gpmRow({ name: '中継 三郎', tier: 'unit', group_label: '中継' }),
    ],
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: true });

  assert.equal(seed.gpmTiers.length, 1);
  assert.deepEqual(seed.gpmTiers[0].boxes.map((b) => b.label), ['技術', '中継']);
  assert.deepEqual(seed.gpmTiers[0].boxes[0].people.map((p) => p.name), ['技術 一郎', '技術 二郎']);
  assert.deepEqual(seed.gpmTiers[0].boxes[0].people[0], {
    name: '技術 一郎', role: '音声', org: '東洋中継', email: 'a@example.com', badge: '進行',
  });
  // 空の項目はキーごと省く（空文字のラベルを紙に出さない）
  assert.deepEqual(Object.keys(seed.gpmTiers[0].boxes[0].people[1]), ['name']);
});

test('getManualOrgSeed: group_label が空の人は立場の名前のチームに入り、所属の文字は二重に出さない', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    gpmRows: [
      gpmRow({ name: '自社 三郎', side: 'internal', group_label: null }),
      gpmRow({ name: '自社 四郎', side: 'internal', group_label: '   ' }),
    ],
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: true });
  const box = seed.gpmTiers[0].boxes[0];

  assert.equal(seed.gpmTiers[0].boxes.length, 1, '同じ立場の人は1つのチームに束ねる');
  assert.equal(box.label, '自社');
  assert.equal('org' in box, false, 'チーム名がすでに所属の文字なので二重に出さない');
  assert.deepEqual(box.people.map((p) => p.name), ['自社 三郎', '自社 四郎']);
});

test('getManualOrgSeed: CHECK に無い tier / side の値も捨てずにそのまま文字として残す', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    gpmRows: [gpmRow({ name: '新 区分', tier: '新しい段', side: '協力会社', group_label: null })],
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: true });

  assert.equal(seed.gpmTiers[0].label, '新しい段');
  assert.equal(seed.gpmTiers[0].boxes[0].label, '協力会社');
});

test('getManualOrgSeed: 電話は社内ユーザーだけ（外部の方の行には付けない）', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    memberRows: [
      { name: '社内 太郎', role: 'PM', is_external: false, phone: '090-0000-0000' },
      { name: '外部 花子', role: '音声', is_external: true, phone: '090-1111-1111' },
    ],
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: true });

  assert.deepEqual(seed.projectMembers, [
    { name: '社内 太郎', role: 'PM', phone: '090-0000-0000' },
    { name: '外部 花子', role: '音声' },
  ]);
});

test('getManualOrgSeed: gpm_members 由来の人には電話を付けない', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    memberRows: [{ name: '社内 太郎', role: 'PM', is_external: false, phone: '090-0000-0000' }],
    gpmRows: [gpmRow({ name: '社内 太郎', role: 'PM' })],
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: true });

  assert.equal('phone' in seed.gpmTiers[0].boxes[0].people[0], false);
});

test('getManualOrgSeed: 名前が空の行は流し込まない', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    memberRows: [{ name: '  ', role: 'PM', is_external: false, phone: null }],
    gpmRows: [gpmRow({ name: '' })],
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: true });

  assert.deepEqual(seed, { projectMembers: [], gpmTiers: [] });
});

// ── 権限（レビュー指摘 P1）─────────────────────────────────────
//
// `GET /manuals/:id/org-seed` は `qsheet: reader` ＋ `canAccessManual` だけで通っていて、
// `sales` を1つも持たない人に `gpm_members`（担当者のメール・所属）を全件返していた。
// `gpm_members` を読む既存のサーバーコード（`contexts/gpm/index.ts` の `canRead`）は
// `sales: reader` を要求しているのに、ここだけ素通りだった。しかも `canAccessManual` は
// `created_by` でも通るので、案件から外れた後も引けてしまう。
//
// 直したあとの約束（ここを緩めたら試験が落ちる）:
//   1. 口そのものは `qsheet: editor`（取り込みは編集操作。reader に返す意味が無い）
//   2. `gpm_members` の脚だけ `sales: reader` を要求し、無ければ **gpm を空で返す**
//      （403/404 にはしない＝「案件のメンバーから」は今までどおり使える）
//   3. 判定は HTTP の `requirePermission` と**同じ `meetsPermissionLevel`**（写さない）

test('getManualOrgSeed: canReadGpm が false なら gpm は空・SQL も投げない（案件のメンバーは今までどおり）', async () => {
  const sqls = [];
  const { getManualOrgSeed } = await loadOrgSeed({
    memberRows: [{ name: '社内 太郎', role: 'PM', is_external: false, phone: '090-0000-0000' }],
    gpmRows: [gpmRow({ name: '山田 花子', email: 'hanako@example.com' })],
    onSql: (sql) => sqls.push(sql),
  });

  const seed = await getManualOrgSeed('proj-1', { canReadGpm: false });

  assert.deepEqual(seed.gpmTiers, []);
  assert.deepEqual(seed.projectMembers, [{ name: '社内 太郎', role: 'PM', phone: '090-0000-0000' }]);
  assert.equal(sqls.some((sql) => sql.includes('gpm_members')), false, '読んでよくない表は SQL も投げない');
});

/** 本物の `requirePermission` / `meetsPermissionLevel` を使う（判定を試験側に写さない） */
async function loadRealAuth() {
  return loadTs('server/src/shared/middleware/auth.ts', {
    '../db/connection': { async queryOne() { return undefined; }, async queryAll() { return []; } },
    '../auth/jwt': { verifyToken: () => null },
    '../../config': { config: { authMode: 'mock' } },
  });
}

/**
 * `manuals.routes.ts` を偽の Router で読み込み、`GET /manuals/:id/org-seed` の
 * 中継ぎ（requireAuth → requirePermission → ハンドラ）をそのまま並べて実行する。
 * サービスは**本物**（`loadOrgSeed`）を差し込むので、ルートが決めた `scope` が
 * SQL を投げるかどうかまで通しで見える。
 */
async function loadOrgSeedRoute({ memberRows = [], gpmRows = [] } = {}) {
  const sqls = [];
  const seedService = await loadOrgSeed({ memberRows, gpmRows, onSql: (sql) => sqls.push(sql) });
  const auth = await loadRealAuth();

  const uses = [];
  const routes = new Map();
  const record = (method) => (path, ...handlers) => { routes.set(`${method} ${path}`, handlers); };
  const router = {
    use: (...handlers) => { uses.push(...handlers); },
    get: record('get'), post: record('post'), patch: record('patch'), delete: record('delete'),
  };

  await loadTs('server/src/contexts/qsheet/routes/manuals.routes.ts', {
    express: { Router: () => router, Request: undefined, Response: undefined },
    '../../../shared/middleware/auth': {
      requireAuth: auth.requireAuth,
      requirePermission: auth.requirePermission,
      meetsPermissionLevel: auth.meetsPermissionLevel,
    },
    // 行単位のゲートは別の試験（manual-create-access-review）で見るのでここは通す
    '../access': { canAccessManual: async () => true, canAssignManualProject: async () => true },
    './wrap': {
      wrap: (fn) => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } },
      p1: (v) => (Array.isArray(v) ? v[0] : v ?? ''),
    },
    '../services/httpErrors': { NotFoundError: class NotFoundError extends Error {} },
    '../services/manual.service': {
      listManuals: async () => [],
      createManual: async () => ({}),
      getManualRaw: async () => ({ id: 'm1', created_by: 'u1', project_id: 'proj-1' }),
      getManualWithMeta: async () => ({}),
      getManualPages: async () => [],
      updateManual: async () => ({}),
      deleteManual: async () => {},
    },
    '../services/manual-org-seed.service': { getManualOrgSeed: seedService.getManualOrgSeed },
  });

  const chain = [...uses, ...(routes.get('get /manuals/:id/org-seed') ?? [])];
  assert.ok(chain.length > 0, '道が張られていること');

  async function invoke(user) {
    const res = {
      statusCode: 200, body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    const req = { user, params: { id: 'm1' }, query: {}, body: {} };
    for (const handler of chain) {
      let passed = false;
      let failed = null;
      await handler(req, res, (err) => { failed = err ?? null; passed = true; });
      if (failed) throw failed;
      if (!passed) break; // ここで応答して止まった（403 など）
    }
    return res;
  }

  return { invoke, sqls };
}

test('org-seed: qsheet が reader だけの人は 403（取り込みは editor の操作）', async () => {
  const { invoke, sqls } = await loadOrgSeedRoute({ gpmRows: [gpmRow()] });

  const res = await invoke({ id: 'u1', role: 'user', permissions: { qsheet: 'reader', sales: 'owner' } });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.deepEqual(sqls, [], '止めた人のぶんは DB を読まない');
});

test('org-seed: sales を1つも持たない editor には gpm を空で返す（連絡先を渡さない）', async () => {
  const { invoke, sqls } = await loadOrgSeedRoute({
    memberRows: [{ name: '社内 太郎', role: 'PM', is_external: false, phone: '090-0000-0000' }],
    gpmRows: [gpmRow({ name: '山田 花子', email: 'hanako@example.com' })],
  });

  const res = await invoke({ id: 'u1', role: 'user', permissions: { qsheet: 'editor' } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.gpmTiers, [], 'sales が無ければ gpm は空');
  assert.deepEqual(res.body.data.projectMembers.map((p) => p.name), ['社内 太郎'], '案件のメンバーは今までどおり');
  assert.equal(sqls.some((sql) => sql.includes('gpm_members')), false);
});

test('org-seed: qsheet editor ＋ sales reader なら gpm も返る', async () => {
  const { invoke } = await loadOrgSeedRoute({
    gpmRows: [gpmRow({ name: '山田 花子', email: 'hanako@example.com' })],
  });

  const res = await invoke({ id: 'u1', role: 'user', permissions: { qsheet: 'editor', sales: 'reader' } });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.gpmTiers[0].boxes[0].people[0], {
    name: '山田 花子', email: 'hanako@example.com',
  });
});

test('org-seed: system_admin は permissions が空でも両方とも返る', async () => {
  const { invoke } = await loadOrgSeedRoute({
    memberRows: [{ name: '社内 太郎', role: 'PM', is_external: false, phone: '090-0000-0000' }],
    gpmRows: [gpmRow({ name: '山田 花子' })],
  });

  // `loadUserWithPermissions` は system_admin の permissions を {} にする
  const res = await invoke({ id: 'admin', role: 'system_admin', permissions: {} });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.gpmTiers.length, 1);
  assert.equal(res.body.data.projectMembers.length, 1);
});
