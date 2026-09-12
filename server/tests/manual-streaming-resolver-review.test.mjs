import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// 運営マニュアル 段C — streaming.resolver.ts は12種の差し込みブロックのうち唯一「秘密」
// （配信のストリームキー・WEB会議のパスコード）を扱う。`link.reveal?.fields` に対応する
// field 名が無ければ必ず伏せ字で返し、field 名があるときだけ平文を返す——ここが崩れると
// 配信の鍵・会議のパスコードが紙面（PDF・配布物）に漏れる（レビュー指摘: この分岐に
// 固定するテストが1件も無かった）。
async function loadStreamingResolver({ queryOneImpl, getStreamingImpl, ownerWhereImpl, decryptImpl, maskImpl }) {
  return loadTs('server/src/contexts/qsheet/services/manual-resolvers/streaming.resolver.ts', {
    '../../../../shared/db/connection': { queryOne: queryOneImpl },
    '../device-settings.service': { getStreaming: getStreamingImpl },
    '../../device-settings-owner': {
      ownerWhere: ownerWhereImpl ?? ((owner, i) => ({ clause: `project_id = $${i}`, params: [owner.projectId] })),
    },
    '../../../../shared/utils/secret-box': {
      decrypt: decryptImpl ?? ((enc) => (enc ? `decrypted:${enc}` : null)),
      mask: maskImpl ?? ((v) => (v ? `****${String(v).slice(-4)}` : '')),
    },
  });
}

function baseCtx(overrides = {}) {
  return { projectId: 'proj-1', programId: null, sourceId: null, revealFields: [], manualServiceDate: null, ...overrides };
}

test('resolveStreamingList masks the stream key by default and never queries the raw destinations', async () => {
  let rawQueryCalled = false;
  const settings = {
    serviceDate: '2026-09-01',
    destinations: [{ id: 'd1', name: 'YouTube', streamKeyMasked: '****1234', hasStreamKey: true }],
    meetings: [],
  };
  const { resolveStreamingList } = await loadStreamingResolver({
    queryOneImpl: async (sql) => {
      if (sql.includes('SELECT destinations')) rawQueryCalled = true; // これが呼ばれたら伏せ字化が壊れている
      return undefined;
    },
    getStreamingImpl: async () => settings,
  });

  const result = await resolveStreamingList(baseCtx());

  assert.equal(rawQueryCalled, false, 'reveal 指定が無いときは生の streamKeyEnc を引いてはいけない');
  assert.deepEqual(result.data.destinations, settings.destinations);
  assert.equal(result.data.destinations[0].streamKey, undefined, '伏せ字のときは平文の streamKey を持たない');
});

test('resolveStreamingList returns the decrypted stream key only when reveal.fields includes streamKey', async () => {
  const settings = {
    serviceDate: '2026-09-01',
    destinations: [{ id: 'd1', name: 'YouTube', streamKeyMasked: '****1234', hasStreamKey: true }],
    meetings: [],
  };
  const { resolveStreamingList } = await loadStreamingResolver({
    queryOneImpl: async (sql) => {
      if (sql.includes('SELECT destinations')) {
        return { destinations: [{ id: 'd1', name: 'YouTube', streamKeyEnc: 'enc-abc' }] };
      }
      return undefined; // fetchRowUpdatedAt
    },
    getStreamingImpl: async () => settings,
  });

  // reveal 無し: 平文は絶対に混ざらない
  const withoutReveal = await resolveStreamingList(baseCtx());
  assert.equal(withoutReveal.data.destinations[0].streamKey, undefined);

  // reveal あり: 復号済みの平文が返る
  const withReveal = await resolveStreamingList(baseCtx({ revealFields: ['streamKey'] }));
  assert.equal(withReveal.data.destinations[0].streamKey, 'decrypted:enc-abc');
  assert.equal(withReveal.data.destinations[0].streamKeyEnc, undefined, '暗号文そのものは返さない');
});

test('resolveStreamingWebMeeting masks the passcode by default and reveals it only when asked', async () => {
  const settings = {
    serviceDate: '2026-09-01',
    destinations: [],
    meetings: [{ id: 'm1', url: 'https://example.test/m1', passcode: '123456' }],
  };
  const { resolveStreamingWebMeeting } = await loadStreamingResolver({
    queryOneImpl: async () => undefined,
    getStreamingImpl: async () => settings,
  });

  const masked = await resolveStreamingWebMeeting(baseCtx());
  assert.equal(masked.data.meetings[0].passcode, '****3456');

  const revealed = await resolveStreamingWebMeeting(baseCtx({ revealFields: ['passcode'] }));
  assert.equal(revealed.data.meetings[0].passcode, '123456');
});

test('both resolvers return null when the owner has no streaming settings, without leaking anything', async () => {
  const { resolveStreamingList, resolveStreamingWebMeeting } = await loadStreamingResolver({
    queryOneImpl: async () => undefined,
    getStreamingImpl: async () => null,
  });

  assert.deepEqual(await resolveStreamingList(baseCtx()), { data: null, updatedAt: null });
  assert.deepEqual(await resolveStreamingWebMeeting(baseCtx()), { data: null, updatedAt: null });
});
