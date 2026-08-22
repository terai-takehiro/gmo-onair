#!/usr/bin/env node
// qsheet→techops移行 Phase 3 の Socket.IO ブリッジ検証（使い捨て・一度きりの手動検証用）。
//
// 実 Postgres（scripts/dev-verify/up.sh）+ 実 http サーバー + 実 socket.io-client 2本
// （旧 `/qsheet` ネームスペースに繋いだクライアント・新 `/techops` ネームスペースに繋いだ
// クライアント）を同時に立て、「新旧混在の瞬間でも同期が止まらない」ことを実地で確かめる。
// server/src/contexts/qsheet/socket.ts の broadcastToRoom() が正しくクロスネームスペースで
// 中継できているかどうかは、型検査にも lint にも出ない（イベント配信の話なので）。
//
// 使い方:
//   bash scripts/dev-verify/up.sh && source /tmp/onair-verify/env.sh
//   npx tsx scripts/dev-verify/socket-bridge-check.mjs
// （検証用の資料は v-admin 所有で自動で作る・無ければ）

import http from 'node:http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import * as Y from 'yjs';

const DOC_ID = 'bridge-test-doc';
const USER_ID = 'v-admin';
const PORT = 4599;

async function main() {
  const { initDb, execute } = await import('../../server/src/shared/db/connection.ts');
  await initDb();
  await execute(
    `INSERT INTO qsheet_documents (id, title, data, created_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
    [DOC_ID, 'ブリッジ検証用', JSON.stringify({ sections: [] }), USER_ID],
  );
  const { initQsheetSocketIO } = await import('../../server/src/contexts/qsheet/socket.ts');

  const httpServer = http.createServer();
  const io = new Server(httpServer, { path: '/socket.io/' });
  initQsheetSocketIO(io);
  await new Promise((resolve) => httpServer.listen(PORT, resolve));
  console.log(`[bridge-check] server on :${PORT}`);

  const base = `http://127.0.0.1:${PORT}`;
  const opts = (ns) => ({
    path: '/socket.io/',
    query: { docId: DOC_ID },
    auth: { userId: USER_ID },
    transports: ['websocket'],
    forceNew: true,
  });

  // A = 旧ビルドのタブ（/qsheet に接続したまま）。B = リロードして新ビルドに切り替わったタブ（/techops）。
  // 受信は取りこぼさないよう、接続前から persistent listener でキューに積む
  // （once() を後から登録すると、サーバー側の非同期な認証解決が先に終わって
  //  最初の presence:sync を取りこぼすレースが実際に起きる）。
  const a = ioClient(`${base}/qsheet`, opts('/qsheet'));
  const b = ioClient(`${base}/techops`, opts('/techops'));
  const queues = new Map(); // socket -> event -> array

  function track(socket, event) {
    const key = `${socket === a ? 'A' : 'B'}:${event}`;
    if (!queues.has(key)) queues.set(key, []);
    socket.on(event, (payload) => {
      queues.get(key).push(payload);
      console.log('[recv]', key, JSON.stringify(payload));
    });
  }
  a.on('connect_error', (e) => console.error('[A connect_error]', e.message));
  b.on('connect_error', (e) => console.error('[B connect_error]', e.message));
  for (const s of [a, b]) {
    for (const ev of ['connect', 'presence:sync', 'cue:sync', 'cue:next', 'yjs:state', 'yjs:update']) {
      track(s, ev);
    }
  }

  const results = [];
  const record = (name, ok, detail) => results.push({ name, ok, detail });

  async function waitForQueued(socket, event, predicate, timeoutMs = 4000, sinceIndex = 0) {
    const key = `${socket === a ? 'A' : 'B'}:${event}`;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const q = queues.get(key) || [];
      for (let i = sinceIndex; i < q.length; i++) {
        if (!predicate || predicate(q[i])) return q[i];
      }
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`timeout waiting for ${key}`);
  }
  function queueLen(socket, event) {
    return (queues.get(`${socket === a ? 'A' : 'B'}:${event}`) || []).length;
  }

  try {
    await Promise.all([waitForQueued(a, 'connect', null), waitForQueued(b, 'connect', null)]);
    console.log('[bridge-check] both clients connected');

    // presence:sync は接続直後に両方へ飛ぶ。両方が member 扱い（v-admin=system_admin）に
    // なった後、A 側に「B 参加後（users.length===1・自分自身は socket.to 系では届かないので
    // A から見た users は B の分だけ）」の presence:sync が届くかどうかで在席のブリッジを見る。
    const presenceOnA = await waitForQueued(
      a,
      'presence:sync',
      (p) => Array.isArray(p.users) && p.users.length >= 1,
    ).catch((e) => ({ __error: e.message }));
    record(
      '在席表示 (presence:sync) が /qsheet 側にも B の参加として届く',
      Array.isArray(presenceOnA.users) && presenceOnA.users.length >= 1,
      presenceOnA,
    );

    // cue:update (B=/techops から) → cue:sync が A(/qsheet) に届くか
    b.emit('cue:update', { currentCue: 3, elapsed: 12, isPlaying: true });
    const cue = await waitForQueued(a, 'cue:sync', (p) => p.currentCue === 3).catch((e) => ({ __error: e.message }));
    record(
      'cue:update(techops) → cue:sync が /qsheet 側へブリッジされる',
      cue && cue.currentCue === 3 && cue.isPlaying === true,
      cue,
    );

    // cue:next (A=/qsheet から) → B(/techops) に届くか
    a.emit('cue:next');
    const next = await waitForQueued(b, 'cue:next', null).catch((e) => ({ __error: e.message }));
    record('cue:next(qsheet) → /techops 側へブリッジされる', !next || !next.__error, next);

    // yjs:sync → 両方が qsheetRooms.acquire に成功し yjs:state を受け取れるか
    a.emit('yjs:sync');
    b.emit('yjs:sync');
    const [sa, sb] = await Promise.all([
      waitForQueued(a, 'yjs:state', null).catch(() => null),
      waitForQueued(b, 'yjs:state', null).catch(() => null),
    ]);
    record('yjs:sync が両ネームスペースとも acquire/state 取得できる', !!sa && !!sb, { sa: !!sa, sb: !!sb });

    // yjs:update (A=/qsheet から) → B(/techops) の members へブリッジされるか
    // 実際に Y.Doc を1件更新して得た本物のバイナリ差分を送る（ガベージだと
    // applyUpdate が例外を投げてサーバーごと落ちる — 実データで検証する）。
    const probeDoc = new Y.Doc();
    let realUpdate;
    probeDoc.on('update', (u) => { realUpdate = u; });
    probeDoc.getMap('probe').set('k', 'v');
    a.emit('yjs:update', realUpdate);
    const upd = await waitForQueued(b, 'yjs:update', null).catch((e) => ({ __error: e.message }));
    record(
      'yjs:update(qsheet) → /techops の members ルームへブリッジされる',
      upd instanceof Buffer || upd instanceof Uint8Array,
      upd && upd.constructor && upd.constructor.name,
    );

    // 不正な yjs:update （壊れたバイナリ）を送ってもプロセスが落ちないこと
    // （roomManager.ts の applyUpdate に try/catch を足した分の回帰確認）。
    // サーバーが生きていることは、この直後に別の cue イベントが届くかで確認する。
    const cueNextCountBefore = queueLen(b, 'cue:next');
    a.emit('yjs:update', new Uint8Array([1, 2, 3])); // 壊れたバイナリ（本物の Yjs 更新ではない）
    await new Promise((r) => setTimeout(r, 200));
    a.emit('cue:next');
    const aliveAfterBadUpdate = await waitForQueued(b, 'cue:next', null, 2000, cueNextCountBefore)
      .then(() => true)
      .catch((e) => ({ __error: e.message }));
    record(
      '不正な yjs:update を送ってもサーバープロセスが落ちない',
      aliveAfterBadUpdate === true,
      aliveAfterBadUpdate,
    );
  } finally {
    a.close();
    b.close();
    await new Promise((resolve) => httpServer.close(resolve));
  }

  console.log('\n=== 結果 ===');
  let allOk = true;
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.ok ? '' : `  detail=${JSON.stringify(r.detail)}`}`);
    if (!r.ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('[bridge-check] fatal', e);
  process.exit(1);
});
