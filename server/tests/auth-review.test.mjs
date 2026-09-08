import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, AppError } from './helpers/load-ts.mjs';

const otp = await loadTs('server/src/shared/auth/otpChallenge.ts');
const secret = 'review-test-secret';

test('OTP challenge requires the same user, secret, signature and unexpired lifetime', () => {
  const value = otp.createOtpChallenge('user-a', secret, 1000);
  assert.equal(otp.verifyOtpChallenge(value, 'user-a', secret, 1001), true);
  for (const args of [
    [undefined, 'user-a', secret, 1001], [value, 'user-b', secret, 1001],
    [value, 'user-a', 'wrong', 1001], [value + 'x', 'user-a', secret, 1001],
    [value, 'user-a', secret, 1000 + otp.OTP_CHALLENGE_TTL_MS],
    ['x'.repeat(2049), 'user-a', secret, 1001], [{}, 'user-a', secret, 1001],
  ]) assert.equal(otp.verifyOtpChallenge(...args), false);
  assert.notEqual(value, otp.createOtpChallenge('user-a', secret, 1000));
  assert.deepEqual(otp.otpCookieOptions(true), {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/internal/auth',
  });
});

async function otpRoutes() {
  const routes = new Map();
  const calls = { sql: [], sms: 0, tokens: 0 };
  let unused = true;
  const router = { post(path, limiter, handler) { routes.set(path, { limiter, handler }); } };
  await loadTs('server/src/contexts/platform/routes/auth-otp.routes.ts', {
    express: { Router: () => router },
    'express-rate-limit': { default: (options) => options },
    '../../../shared/db/connection': {
      async queryOne(sql) {
        calls.sql.push(sql);
        if (sql.includes('FROM users')) return { id: 'user-a', email: 'a@example.test', phone: '+8100' };
        assert.match(sql, /UPDATE verification_codes[\s\S]*used_at IS NULL[\s\S]*expires_at > NOW\(\)[\s\S]*code = \?[\s\S]*RETURNING id/);
        if (!unused) return undefined;
        unused = false;
        return { id: 'otp' };
      },
      async execute(sql) { calls.sql.push(sql); },
    },
    '../../../shared/middleware/errorHandler': { AppError },
    '../../../shared/auth/jwt': { signToken() { calls.tokens++; return 'jwt'; } },
    '../../../shared/auth/sms': { sendSms: async () => { calls.sms++; }, generateOtp: () => '123456' },
    '../../../shared/auth/otpChallenge': otp,
    '../../../config': { config: { jwtSecret: secret, isProduction: true } },
  });
  async function invoke(path, cookies = {}) {
    const res = { cookies: [], body: null, cookie(...args) { this.cookies.push(args); }, clearCookie() {}, json(body) { this.body = body; } };
    let error;
    await routes.get(path).handler({ body: { user_id: 'user-a', code: '123456' }, cookies, socket: {} }, res, (e) => { error = e; });
    return { res, error };
  }
  return { routes, calls, invoke };
}

test('OTP verification and resend reject a user ID without the password challenge', async () => {
  const { invoke, calls, routes } = await otpRoutes();
  for (const path of ['/verify-2fa', '/resend-otp']) {
    const { error } = await invoke(path);
    assert.equal(error?.code, 'LOGIN_REQUIRED');
    assert.notEqual(routes.get(path).limiter.skipSuccessfulRequests, true);
  }
  assert.equal(calls.sql.length, 0);
  assert.equal(calls.sms, 0);
  assert.equal(calls.tokens, 0);
});

test('concurrent OTP verification issues one session and never exposes a production JWT', async () => {
  const { invoke, calls } = await otpRoutes();
  const cookies = { [otp.OTP_CHALLENGE_COOKIE]: otp.createOtpChallenge('user-a', secret) };
  const results = await Promise.all([invoke('/verify-2fa', cookies), invoke('/verify-2fa', cookies)]);
  assert.equal(results.filter((r) => !r.error).length, 1);
  assert.equal(results.filter((r) => r.error?.code === 'INVALID_CODE').length, 1);
  assert.equal(calls.tokens, 1);
  assert.deepEqual(results.find((r) => !r.error).res.body.data, {});
});

test('HTTP auth rejects disabled accounts and preserves a 503 for database outages', async () => {
  let outage = false;
  const { jwtAuth, meetsPermissionLevel } = await loadTs('server/src/shared/middleware/auth.ts', {
    express: {},
    '../db/connection': {
      async queryOne(sql) {
        assert.match(sql, /status = 'active'/);
        if (outage) throw new Error('test outage');
        return undefined;
      }, queryAll: async () => [],
    },
    '../auth/jwt': { verifyToken: () => ({ userId: 'disabled' }) },
    '../../config': { config: { authMode: 'password' } },
  });
  const req = { headers: { authorization: 'Bearer token' } };
  const res = { status(code) { this.code = code; return this; }, json() {} };
  let next = 0;
  await jwtAuth(req, res, () => { next++; });
  assert.equal(req.user, undefined);
  assert.equal(next, 1);
  outage = true;
  await jwtAuth(req, res, () => { next++; });
  assert.equal(res.code, 503);
  assert.equal(next, 1);
  for (const [level, allowed] of [['reader', false], ['editor', false], ['manager', true], ['owner', true]]) {
    assert.equal(meetsPermissionLevel('member', level, 'manager'), allowed);
  }

  let row;
  const { canControlProduction } = await loadTs('server/src/shared/collab/controlPermission.ts', {
    '../db/connection': { queryOne: async (sql) => { assert.match(sql, /status = 'active'/); return row; } },
    '../middleware/auth': { meetsPermissionLevel },
  });
  for (const [value, expected] of [
    [undefined, false], [{ role: 'member', access_level: 'reader' }, false],
    [{ role: 'member', access_level: 'editor' }, false], [{ role: 'member', access_level: 'manager' }, true],
    [{ role: 'system_admin' }, true],
  ]) { row = value; assert.equal(await canControlProduction('user-a'), expected); }
  assert.equal(await canControlProduction(null), false);
});
