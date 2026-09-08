import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

test('temporary auth failures retain the session, 401 clears it, and user switches discard old permissions', async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const status of [503, 401, 200]) {
      const cached = { id: 'old', role: 'member', name: 'Old' };
      const storage = new Map([
        ['gmo_onair_user', JSON.stringify(cached)],
        ['gmo_onair_permissions', JSON.stringify({ sales: 'manager' })],
        ['gmo_onair_token', 'token'],
      ]);
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key),
      } });
      const state = [];
      let effect;
      const { createAuthHook } = await loadTs('shared/src/client/createAuthHook.ts', {
        react: {
          useState(initial) {
            const index = state.length;
            state.push(typeof initial === 'function' ? initial() : initial);
            return [state[index], (value) => { state[index] = value; }];
          },
          useCallback: (fn) => fn, useEffect: (fn) => { effect = fn; },
        },
        './uiStore': { useUiStore: (selector) => selector({ setCurrentUserId() {} }) },
      });
      createAuthHook({ storageKey: 'gmo_onair_user', api: {
        async get(path) {
          if (status !== 200) throw { response: { status } };
          if (path.includes('permissions')) throw new Error('permission endpoint outage');
          return { data: { data: { id: 'new', role: 'member', permissions: { sales: 'reader' } } } };
        },
      } })();
      effect();
      await new Promise(setImmediate);
      assert.equal(state[2], false);
      if (status === 503) {
        assert.equal(state[0].id, 'old');
        assert.equal(storage.get('gmo_onair_token'), 'token');
      } else if (status === 401) {
        assert.equal(state[0], null);
        assert.deepEqual(state[1], {});
        assert.equal(storage.has('gmo_onair_token'), false);
      } else {
        assert.equal(state[0].id, 'new');
        assert.deepEqual(state[1], { sales: 'reader' });
      }
    }
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  }
});

test('production config cannot be switched to mock auth through AUTH_MODE', async () => {
  const before = { ...process.env };
  try {
    Object.assign(process.env, {
      NODE_ENV: 'production', AUTH_MODE: 'mock', JWT_SECRET: 'x'.repeat(32),
      DATABASE_URL: 'postgresql://test', ALLOWED_ORIGINS: 'https://example.test',
    });
    const { config } = await loadTs('server/src/config.ts');
    assert.equal(config.authMode, 'password');
    process.env.NODE_ENV = 'development';
    const dev = await loadTs('server/src/config.ts');
    assert.equal(dev.config.authMode, 'mock');
    assert.ok(dev.getAllowedOrigins().includes('http://localhost:5180'));
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});
