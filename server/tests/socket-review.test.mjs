import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, fakeIO, fakeSocket } from './helpers/load-ts.mjs';

const permission = await loadTs('server/src/shared/middleware/auth.ts', {
  '../db/connection': { queryOne() {}, queryAll() {} },
  '../auth/jwt': { verifyToken() {} }, '../../config': { config: {} },
});
const resolver = { resolveSocketUser: async (socket) => socket.user };
function rooms() {
  return {
    writes: 0, acquisitions: 0,
    async acquire() { this.acquisitions++; }, release() {},
    getState() { return new Uint8Array([1]); }, applyUpdate() { this.writes++; },
  };
}

test('project collab excludes anonymous and unauthorized sockets from every private broadcast', async () => {
  const { initCollabNamespace } = await loadTs('server/src/shared/collab/socket.ts', { './socketAuth': resolver });
  const io = fakeIO();
  const manager = rooms();
  initCollabNamespace(io, {
    namespace: '/project-collab', idParam: 'projectId', roomPrefix: 'project', label: 'test',
    rooms: manager, canEdit: async (user) => user.id === 'allowed',
  });
  for (const user of [null, { id: 'denied' }, { id: 'allowed', name: 'Editor' }]) {
    const socket = fakeSocket(user);
    io.of('/project-collab').connection(socket);
    await socket.receive('yjs:sync');
    await socket.receive('presence:query');
    await socket.receive('yjs:update', new Uint8Array([2]));
    const allowed = user?.id === 'allowed';
    assert.equal(socket.rooms.has('project:project'), allowed);
    assert.equal(socket.emissions.some((e) => e.event === 'yjs:state'), allowed);
    if (!allowed) assert.deepEqual(socket.emissions.at(-1).payload.users, []);
  }
  assert.equal(manager.writes, 1);
  assert.equal(manager.acquisitions, 1);
});

test('qsheet requires module access, separates readers from editors, and preserves public cue rooms', async () => {
  for (const level of [undefined, 'reader', 'editor', 'manager']) {
    const manager = rooms();
    const { initQsheetSocketIO } = await loadTs('server/src/contexts/qsheet/socket.ts', {
      '../../shared/db/connection': { queryOne: async (sql) => sql.includes('qsheet_documents') ? { created_by: 'user' } : { access_level: level } },
      '../../shared/middleware/auth': permission,
      './access': { canAccessDoc: async () => true }, './collab': { qsheetRooms: manager },
      '../../shared/collab/socketAuth': resolver,
    });
    const io = fakeIO();
    initQsheetSocketIO(io);
    for (const namespace of ['/qsheet', '/techops']) {
      const socket = fakeSocket({ id: 'user', role: 'member', name: 'Member' });
      socket.nsp = io.of(namespace);
      socket.nsp.connection(socket);
      await socket.receive('yjs:sync');
      await socket.receive('yjs:update', new Uint8Array([2]));
      assert.equal(socket.rooms.has('doc:doc'), true);
      assert.equal(socket.rooms.has('doc:doc:members'), !!level);
      assert.equal(socket.emissions.some((e) => e.event === 'yjs:state'), !!level);
    }
    assert.equal(manager.writes, level === 'editor' || level === 'manager' ? 2 : 0);
  }
});

test('liveops validates packets and only broadcasts a control change after persistence succeeds', async () => {
  let allowed = true;
  let failWrite = false;
  let writes = 0;
  const { initLiveopsSocketIO } = await loadTs('server/src/contexts/liveops/socket.ts', {
    '../../shared/db/connection': {
      queryOne: async () => ({ id: 'timer', total_seconds: 60, paused_remaining_ms: 60000, running: false, warning_threshold_sec: 10 }),
      execute: async () => { writes++; if (failWrite) throw new Error('test write failure'); },
    },
    '../../shared/collab/socketAuth': resolver,
    '../../shared/collab/controlPermission': { canControlProduction: async () => allowed },
  });
  const io = fakeIO();
  const ns = io.of('/liveops');
  ns.use = (fn) => { ns.auth = fn; };
  const broadcasts = [];
  ns.to = () => ({ emit: (event, payload) => broadcasts.push({ event, payload }) });
  initLiveopsSocketIO(io);
  const socket = fakeSocket({ id: 'manager' });
  socket.use = (fn) => { socket.validate = fn; };
  await ns.auth(socket, (error) => assert.equal(error, undefined));
  assert.equal(socket.data.userId, 'manager');
  ns.connection(socket);
  for (const packet of [
    ['timer:set', null], ['timer:set', { timerId: 'timer', seconds: Infinity }],
    ['timer:adjust', { timerId: 'timer', deltaSeconds: NaN }], ['timer:join', { timerId: {} }],
  ]) socket.validate(packet, (error) => assert.ok(error));
  async function send(event, payload) {
    socket.validate([event, payload], (error) => assert.equal(error, undefined));
    await socket.receive(event, payload);
    await new Promise(setImmediate); // handler の直列キューを drain
  }
  await send('timer:join', { timerId: 'timer' });
  allowed = false;
  await send('timer:set', { timerId: 'timer', seconds: 20 });
  assert.equal(writes, 0);
  allowed = true;
  failWrite = true;
  await send('timer:set', { timerId: 'timer', seconds: 20 });
  assert.equal(broadcasts.length, 0);
  await send('timer:join', { timerId: 'timer' });
  assert.equal(socket.emissions.at(-1).payload.totalSeconds, 60);
  failWrite = false;
  await send('timer:set', { timerId: 'timer', seconds: 30 });
  assert.equal(broadcasts.at(-1).payload.totalSeconds, 30);
});
