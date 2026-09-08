import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs, AppError } from './helpers/load-ts.mjs';

test('security-card return consumes an active lending once and reports a concurrent loan conflict', async () => {
  let returned = false;
  const { securityCardService } = await loadTs('server/src/contexts/dailyops/services/security-card.service.ts', {
    uuid: { v4: () => 'new-id' },
    '../../../shared/db/connection': {
      async queryOne(sql) {
        if (sql.startsWith('UPDATE security_card_lendings')) {
          assert.match(sql, /status = 'active' AND deleted_at IS NULL RETURNING id/);
          if (returned) return undefined;
          returned = true;
          return { id: 'lending' };
        }
        if (sql.includes('SELECT id, borrower_person')) return undefined;
        if (sql.includes('SELECT id, notes FROM security_card_lendings')) return { id: 'lending', notes: 'original' };
        return { id: 'card', is_active: true };
      },
      queryAll: async () => [],
      execute: async () => { throw Object.assign(new Error('duplicate'), { code: '23505' }); },
    },
    '../../../shared/middleware/errorHandler': { AppError },
    '../../../shared/utils/jst': { jstDate: () => '2026-09-07' },
  });
  const results = await Promise.allSettled([
    securityCardService.returnCard('card', { notes: 'one' }),
    securityCardService.returnCard('card', { notes: 'two' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'NOT_LENT');
  await assert.rejects(securityCardService.lend('card', { borrower_person: 'Borrower' }), { code: 'ALREADY_LENT', statusCode: 409 });
});

test('intercompany rejects non-finite/sub-yen amounts and locks linked records before mutation', async () => {
  const queries = [];
  let writes = 0;
  const dueCalls = [];
  const writeCalls = [];
  const tx = {
    async queryOne(sql) {
      queries.push(sql);
      if (sql.includes('FROM projects')) return { id: 'project', entity_code: 'GSS' };
      if (sql.includes('intercompany_links')) return { id: 'link', revenue_id: 'revenue', purchase_id: 'purchase' };
      if (sql.includes('invoice_issued')) return { id: 'revenue', invoice_issued: false };
      return { id: 'row' };
    },
    async execute(sql, args) { writes++; writeCalls.push({ sql, args }); },
  };
  const service = await loadTs('server/src/contexts/finance/services/intercompany.service.ts', {
    uuid: { v4: () => 'new-id' },
    '../../../shared/db/connection': { queryOne: tx.queryOne, queryAll: async () => [], withTransaction: async (fn) => fn(tx) },
    '../../../shared/middleware/errorHandler': { AppError },
    '../../../shared/services/billing-key.service': { generateBillingKey: () => 'key' },
    '../../../shared/services/tax-category.service': { normalizeTaxCategory: () => 'taxable' },
    './money-rules.service': { computeDueDate: async (date) => { dueCalls.push(date); return date ? '2026-10-31' : null; }, computeVendorDueDate: async (date) => { dueCalls.push(date); return date ? '2026-11-30' : null; } },
    '../../../shared/constants/entity-default': { SELF_COMPANY_ID_BY_ENTITY: { GSS: 'gss', GJV: 'gjv' } },
  });
  for (const amount of [Infinity, -Infinity, NaN, 0, -1, 0.5]) {
    await assert.rejects(service.createIntercompanyPurchase({ amount }), { code: 'VALIDATION_ERROR' });
    await assert.rejects(service.updateIntercompanyLink('link', { amount }, 'user'), { code: 'VALIDATION_ERROR' });
  }
  await assert.rejects(service.createIntercompanyPurchase({ amount: 100, projectId: 'project' }), { code: 'VALIDATION_ERROR' });
  assert.equal(writes, 0);
  queries.length = 0;
  await service.updateIntercompanyLink('link', { amount: 100 }, 'user');
  assert.match(queries[0], /intercompany_links[\s\S]*FOR UPDATE/);
  assert.match(queries[1], /deleted_at IS NULL FOR UPDATE/);
  assert.equal(writes, 2);
  assert.equal(dueCalls.length, 0); // unrelated edits preserve existing due dates
  await service.updateIntercompanyLink('link', { recognitionDate: '2026-09-07' }, 'user');
  assert.deepEqual(dueCalls, ['2026-09-07', '2026-09-07']);
  assert.match(writeCalls[2].sql, /payment_due_date = CASE WHEN/);
  assert.ok(writeCalls[2].args.includes('2026-10-31'));
  assert.ok(writeCalls[3].args.includes('2026-11-30'));
  await service.updateIntercompanyLink('link', { recognitionDate: null }, 'user');
  assert.equal(writeCalls[4].args[3], true);
  assert.equal(writeCalls[4].args[4], null);
});

test('MCP OAuth codes are consumed atomically, disabled users are denied and refresh scopes cannot expand', async () => {
  let active = true;
  let consumed = false;
  let tokenCount = 0;
  const provider = await loadTs('server/src/contexts/mcp/oauth/provider.ts', {
    jsonwebtoken: { default: {
      sign() { tokenCount++; return 'access-token'; },
      verify: () => ({ typ: 'mcp_access', sub: 'user', cid: 'client', scope: 'mcp' }),
      decode: () => ({ exp: 9999999999 }),
    } }, uuid: { v4() {} },
    '../../../shared/db/connection': {
      async queryOne(sql) {
        if (sql.includes('FROM users')) { assert.match(sql, /status = 'active'/); return active ? { id: 'user' } : undefined; }
        if (sql.includes('mcp_oauth_codes')) {
          assert.match(sql, /DELETE FROM[\s\S]*expires_at > NOW\(\)[\s\S]*RETURNING \*/);
          if (consumed) return undefined;
          consumed = true;
        }
        return { user_id: 'user', scope: 'mcp', expires_at: '2099-01-01', redirect_uri: 'https://client.test/callback' };
      }, execute: async () => {},
    },
    './store': { mcpClientsStore: {} }, './context': { authorizeContext: {} },
    './token-secret': { MCP_TOKEN_SECRET: 'test', ACCESS_TOKEN_TTL_SEC: 60, REFRESH_TOKEN_TTL_SEC: 60, McpAccessTokenClaims: null },
  });
  const p = provider.mcpOAuthProvider;
  const client = { client_id: 'client' };
  const results = await Promise.allSettled([
    p.exchangeAuthorizationCode(client, 'code', undefined, 'https://client.test/callback'),
    p.exchangeAuthorizationCode(client, 'code', undefined, 'https://client.test/callback'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(tokenCount, 1);
  await assert.rejects(p.exchangeRefreshToken(client, 'refresh', ['mcp', 'admin']), /invalid_scope/);
  assert.equal(tokenCount, 1);
  await p.exchangeRefreshToken(client, 'refresh', ['mcp']);
  active = false;
  await assert.rejects(p.exchangeRefreshToken(client, 'refresh'), /account unavailable/);
  await assert.rejects(p.verifyAccessToken('access'), /account unavailable/);
});
