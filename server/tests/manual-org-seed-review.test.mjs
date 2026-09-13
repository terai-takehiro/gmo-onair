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

  const seed = await getManualOrgSeed(null);

  assert.deepEqual(seed, { projectMembers: [], gpmTiers: [] });
  assert.equal(calls, 0, '案件が無いのに DB を読まない');
});

test('getManualOrgSeed: gpm_members の SQL は deleted_at を使わない（この表に列が無い＝書くとSQLエラー）', async () => {
  let gpmSql = '';
  let memberSql = '';
  const { getManualOrgSeed } = await loadOrgSeed({
    onSql: (sql) => { if (sql.includes('gpm_members')) gpmSql = sql; else memberSql = sql; },
  });

  await getManualOrgSeed('proj-1');

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

  await getManualOrgSeed('proj-1');

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

  const seed = await getManualOrgSeed('proj-1');

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

  const seed = await getManualOrgSeed('proj-1');

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

  const seed = await getManualOrgSeed('proj-1');
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

  const seed = await getManualOrgSeed('proj-1');

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

  const seed = await getManualOrgSeed('proj-1');

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

  const seed = await getManualOrgSeed('proj-1');

  assert.equal('phone' in seed.gpmTiers[0].boxes[0].people[0], false);
});

test('getManualOrgSeed: 名前が空の行は流し込まない', async () => {
  const { getManualOrgSeed } = await loadOrgSeed({
    memberRows: [{ name: '  ', role: 'PM', is_external: false, phone: null }],
    gpmRows: [gpmRow({ name: '' })],
  });

  const seed = await getManualOrgSeed('proj-1');

  assert.deepEqual(seed, { projectMembers: [], gpmTiers: [] });
});
