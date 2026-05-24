import axios from 'axios';

interface TokenCache {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, TokenCache>();
const inflight = new Map<string, Promise<string>>();

export async function getTeamsToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const existing = inflight.get(tenantId);
  if (existing) return existing;

  const promise = (async () => {
    const res = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      },
    );
    const token: string = res.data.access_token;
    const ttl: number = (res.data.expires_in ?? 3599) - 120;
    cache.set(tenantId, { token, expiresAt: Date.now() + ttl * 1000 });
    return token;
  })();

  inflight.set(tenantId, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(tenantId);
  }
}
